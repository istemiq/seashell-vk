#!/usr/bin/env node
/**
 * Полная диагностика после deploy (или без него): build, URLs, index, assets, API, чеклист.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import {
  DEPLOY_URLS_FILE,
  loadLastDeployUrls,
  printPlacementChecklist,
  hashFromUrl,
} from './placement-checklist.mjs';
import {
  fetchIndexStatus,
  printHostingVerifyResult,
  verifyHostingRecord,
} from './hosting-verify.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const API_HEALTH = 'https://api.sishel.ru/api/health';
const SUMMARY_FILE = join(root, 'logs', 'last-deploy-summary.txt');

function step(n, total, title) {
  console.log('');
  console.log('═'.repeat(60));
  console.log(`  [${n}/${total}] ${title}`);
  console.log('═'.repeat(60));
}

async function fetchTextAsync(url) {
  if (process.platform === 'win32') {
    const r = spawnSync('curl.exe', ['-sS', '-L', url], {
      encoding: 'utf8',
      timeout: 30000,
    });
    if (r.status !== 0) {
      return { ok: false, error: r.stderr?.trim() || r.error?.message || 'curl failed' };
    }
    return { ok: true, text: r.stdout ?? '' };
  }
  try {
    const res = await fetch(url, { redirect: 'follow' });
    return { ok: res.ok, text: await res.text(), status: res.status };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function fetchStatus(url) {
  return fetchIndexStatus(url);
}

function baseFromIndexUrl(indexUrl) {
  return indexUrl.replace(/\/index\.html$/i, '');
}

function extractAssets(html) {
  const js = [...html.matchAll(/(?:src|href)=["'](?:\.\/)?(assets\/[^"']+\.(?:js|css))["']/g)].map(
    (m) => m[1],
  );
  return [...new Set(js)];
}

async function probeAssets(indexUrl, label) {
  const base = baseFromIndexUrl(indexUrl);
  const indexCode = await fetchStatus(indexUrl);
  console.log(`  ${label} index.html → HTTP ${indexCode}`);

  if (indexCode !== 200) {
    return { indexCode, assets: [] };
  }

  const fetched = await fetchTextAsync(indexUrl);
  if (!fetched.ok || !fetched.text) {
    console.log(`  ${label} HTML: не удалось скачать (${fetched.error ?? fetched.status ?? '?'})`);
    return { indexCode, assets: [] };
  }

  const paths = extractAssets(fetched.text);
  if (!paths.length) {
    console.log(`  ${label} assets: не найдены в HTML`);
    return { indexCode, assets: [] };
  }

  const assets = [];
  for (const rel of paths) {
    const url = `${base}/${rel.replace(/^\.\//, '')}`;
    const code = await fetchStatus(url);
    assets.push({ rel, url, code });
    const mark = code === 200 ? '✓' : '✗';
    console.log(`  ${mark} ${label} ${rel} → HTTP ${code}`);
  }
  return { indexCode, assets };
}

function writeSummaryFile(lines) {
  const text = `${lines.join('\n')}\n`;
  writeFileSync(SUMMARY_FILE, text, 'utf8');
  console.log('');
  console.log(`  Сводка (читать первой): ${SUMMARY_FILE}`);
}

async function main() {
  const total = 6;
  let failed = false;
  const summaryLines = [
    'SEASHELL — сводка deploy / диагностики',
    `Время: ${new Date().toISOString()}`,
    '',
  ];

  step(1, total, 'Локальная сборка (build/index.html)');
  const buildHtml = join(root, 'build', 'index.html');
  if (!existsSync(buildHtml)) {
    console.log('  ✗ build/index.html нет — сначала npm run build или deploy:prod');
    failed = true;
  } else {
    const html = readFileSync(buildHtml, 'utf8');
    const stamp = html.match(/<!-- seashell-build: ([^>]+) -->/)?.[1] ?? '(нет метки)';
    const localAssets = extractAssets(html);
    console.log(`  ✓ seashell-build: ${stamp}`);
    console.log(`  ✓ ассеты в сборке: ${localAssets.join(', ') || '(не найдены)'}`);
    summaryLines.push(`Сборка: OK (${stamp})`);
  }

  step(2, total, 'Последний deploy (.deploy-urls.json)');
  const record = loadLastDeployUrls();
  if (!record?.prod || !record?.stage) {
    console.log(`  ✗ ${DEPLOY_URLS_FILE} пуст или без prod/stage`);
    console.log('  Сначала: npm run deploy:prod (или deploy:stage)');
    failed = true;
  } else {
    console.log(`  recordedAt: ${record.recordedAt ?? '—'}`);
    console.log(`  prod:  ${record.prod}`);
    console.log(`  stage: ${record.stage}`);
    console.log(`  prodHttp / prodVerified: ${record.prodHttp ?? '—'} / ${record.prodVerified ?? '—'}`);
    const prodHash = hashFromUrl(record.prod);
    const stageHash = hashFromUrl(record.stage);
    if (prodHash && stageHash && prodHash === stageHash) {
      console.log(`  ✓ хеш prod = stage: ${prodHash}`);
    } else {
      console.log(`  ✗ хеши: prod=${prodHash ?? '?'}, stage=${stageHash ?? '?'}`);
    }
    if (record.lastKnownGoodProd) {
      console.log(`  lastKnownGoodProd: ${record.lastKnownGoodProd}`);
    }
    summaryLines.push(`Stage URL: ${record.stage}`);
    summaryLines.push(`Prod URL:  ${record.prod} → HTTP ${record.prodHttp ?? '?'}`);
  }

  step(3, total, 'Проверка index.html (prod / stage)');
  if (record?.prod && record?.stage) {
    const verify = await verifyHostingRecord(record, { requireProd: true });
    printHostingVerifyResult(record, verify);
    if (!verify.ok) failed = true;
  } else {
    console.log('  пропуск — нет URL');
    failed = true;
  }

  step(4, total, 'Проверка ассетов (JS/CSS из index.html на CDN)');
  let stageProbe = null;
  let prodProbe = null;
  if (record?.prod && record?.stage) {
    console.log('');
    prodProbe = await probeAssets(record.prod, 'PROD');
    console.log('');
    stageProbe = await probeAssets(record.stage, 'STAGE');
    const prodJsBroken =
      prodProbe.indexCode !== 200 ||
      prodProbe.assets.some((a) => a.rel.endsWith('.js') && a.code !== 200);
    const stageJsOk = stageProbe.assets.some((a) => a.rel.endsWith('.js') && a.code === 200);
    if (prodJsBroken && stageJsOk) {
      console.log('');
      console.log('  ✗ PROD index/JS/CSS при stage 200 → сбой VK pages-ac, не сборка.');
      failed = true;
    } else if (
      prodProbe.indexCode === 200 &&
      prodProbe.assets.length > 0 &&
      prodProbe.assets.every((a) => a.code === 200)
    ) {
      console.log('');
      console.log('  ✓ все проверенные prod-ассеты отдают 200');
    } else if (prodProbe.indexCode !== 200) {
      console.log('');
      console.log('  ✗ prod index не 200 — prod-ассеты с CDN не проверены');
      failed = true;
    }
  } else {
    console.log('  пропуск — нет URL');
  }

  step(5, total, 'API (https://api.sishel.ru/api/health)');
  const apiCode = await fetchStatus(API_HEALTH);
  console.log(`  GET ${API_HEALTH} → HTTP ${apiCode}`);
  if (apiCode !== 200) {
    console.log('  ✗ API недоступен — проверьте VPS: pm2 logs seashell-api');
    failed = true;
  } else {
    console.log('  ✓ API online');
  }

  summaryLines.push(`API health: HTTP ${apiCode}`);

  step(6, total, 'Чеклист размещения VK');
  if (record) {
    printPlacementChecklist(record);
  } else {
    console.log('  пропуск — нет .deploy-urls.json');
  }

  summaryLines.push('');
  if (failed) {
    summaryLines.push('ВЕРДИКТ: ПРОБЛЕМА');
    if (record?.stage && stageProbe?.indexCode === 200) {
      summaryLines.push('');
      summaryLines.push('Для пользователей (в prod-поля размещения):');
      summaryLines.push(record.stage);
    }
    if (record?.prod && prodProbe?.indexCode !== 200) {
      summaryLines.push('');
      summaryLines.push('НЕ ставить в prod-поля:');
      summaryLines.push(record.prod);
    }
    summaryLines.push('');
    summaryLines.push('Причина: prod CDN pages-ac → 403, stage → 200 (контур VK).');
    summaryLines.push('Полный лог: logs\\last-deploy.log');
  } else {
    summaryLines.push('ВЕРДИКТ: OK — prod и stage готовы.');
  }

  writeSummaryFile(summaryLines);

  console.log('');
  console.log('─'.repeat(60));
  if (failed) {
    console.log('  ИТОГ: есть проблемы (см. ✗ выше).');
    console.log(`  Сводка: ${SUMMARY_FILE}`);
    console.log('─'.repeat(60));
    process.exit(1);
  }
  console.log('  ИТОГ: все проверки пройдены.');
  console.log('─'.repeat(60));
  console.log('');
}

await main();
