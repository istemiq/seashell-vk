#!/usr/bin/env node
/**
 * Обёртка vk-miniapps-deploy: сохраняет prod/stage URL и печатает чеклист.
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DEPLOY_URLS_FILE,
  parseDeployOutput,
  printPlacementChecklist,
} from './placement-checklist.mjs';
import {
  printHostingVerifyResult,
  verifyHostingRecord,
  waitForProdReady,
} from './hosting-verify.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function runVkDeploy() {
  return new Promise((resolve) => {
    const child = spawn('vk-miniapps-deploy', [], {
      cwd: root,
      shell: true,
      stdio: ['inherit', 'pipe', 'pipe'],
    });

    let output = '';
    child.stdout.on('data', (chunk) => {
      const s = String(chunk);
      output += s;
      process.stdout.write(s);
    });
    child.stderr.on('data', (chunk) => {
      const s = String(chunk);
      output += s;
      process.stderr.write(s);
    });
    child.on('close', (code) => resolve({ code: code ?? 1, output }));
  });
}

const envHint = process.env.MINI_APPS_ENVIRONMENT === 'production' ? 'production' : 'dev (default)';
console.log(`[vk-deploy] MINI_APPS_ENVIRONMENT=${envHint}\n`);

const { code, output } = await runVkDeploy();

if (code !== 0) {
  process.exit(code);
}

const prodConfirmedInLog =
  /Deploy confirmed successfully/i.test(output) ||
  /URLs changed for production/i.test(output);

const urls = parseDeployOutput(output);

if (!urls.stage) {
  console.error('');
  console.error('✗ В логе deploy нет stage URL. Проверьте вывод vk-miniapps-deploy выше.');
  process.exit(1);
}

let previous = null;
try {
  if (existsSync(DEPLOY_URLS_FILE)) {
    previous = JSON.parse(readFileSync(DEPLOY_URLS_FILE, 'utf8'));
  }
} catch {
  previous = null;
}

const record = {
  prod: urls.prod ?? urls.prodCandidate,
  stage: urls.stage,
  recordedAt: new Date().toISOString(),
  lastKnownGoodProd:
    previous?.lastKnownGoodProd ??
    'https://prod-app54526886-25a3c6dd9866.pages-ac.vk-apps.com/index.html',
};

const isProductionDeploy =
  process.env.MINI_APPS_ENVIRONMENT === 'production';
let verify = await verifyHostingRecord(record, {
  requireProd: isProductionDeploy,
});

if (isProductionDeploy && !verify.ok && verify.prodCode === 403 && record.prod) {
  console.log('');
  console.log('  Prod 403 сразу после deploy — ждём публикацию VK (до ~3 мин)...');
  console.log('');
  const waited = await waitForProdReady(record.prod);
  if (waited.ok) {
    verify = await verifyHostingRecord(record, { requireProd: true });
  }
}

printHostingVerifyResult(record, verify);

record.prodHttp = verify.prodCode;
record.prodVerified = verify.prodCode === 200;

if (verify.ok && verify.prodCode === 200) {
  record.lastKnownGoodProd = record.prod;
  record.lastKnownGoodAt = record.recordedAt;
}

writeFileSync(DEPLOY_URLS_FILE, `${JSON.stringify(record, null, 2)}\n`, 'utf8');

if (isProductionDeploy && !prodConfirmedInLog) {
  console.error('');
  console.error('✗ В логе нет подтверждения PRODUCTION (код с телефона / URLs changed for production).');
  console.error('  Без этого prod CDN часто остаётся 403. Повторите deploy:prod и введите код из VK.');
  console.error('');
}

if (!isProductionDeploy && verify.stageCode === 200 && !verify.prodVerified) {
  console.log('');
  console.log('  ✓ deploy:stage — stage 200. Для пользователей вставьте STAGE URL в prod-поля размещения.');
  console.log(`  ${record.stage}`);
  console.log('');
}

if (isProductionDeploy && !verify.ok) {
  console.error('');
  console.error('✗ deploy:prod: prod не отдаёт 200.');
  console.error('');
  console.error('  ВОССТАНОВИТЬ PROD в размещении (pages-ac, работает сейчас):');
  console.error(`  ${record.lastKnownGoodProd}`);
  console.error('  Команда: npm run placement:restore-prod');
  console.error('');
  if (verify.prodBroken && record.stage) {
    console.error('  Временно новая сборка на stage (только если нужен именно новый код):');
    console.error(`  ${record.stage}`);
    console.error('  Подробно: npm run placement:recovery');
  }
  console.error('');
  console.error('  Не меняйте размещение на prod URL с 403 — будет «App not detected».');
  process.exit(1);
}

printPlacementChecklist(record);
