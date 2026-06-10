#!/usr/bin/env node
/**
 * Вернуть рабочий PROD URL (pages-ac) в размещение — без stage.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEPLOY_URLS_FILE } from './placement-checklist.mjs';
import { fetchIndexStatus, printHostingVerifyResult } from './hosting-verify.mjs';

const PLACEMENT = 'https://dev.vk.com/admin/app-54526886/placement';
const FALLBACK_PROD =
  'https://prod-app54526886-25a3c6dd9866.pages-ac.vk-apps.com/index.html';

const record = existsSync(DEPLOY_URLS_FILE)
  ? JSON.parse(readFileSync(DEPLOY_URLS_FILE, 'utf8'))
  : {};

const prodUrl = record.lastKnownGoodProd || FALLBACK_PROD;
const code = await fetchIndexStatus(prodUrl);

printHostingVerifyResult({ prod: prodUrl, stage: record.stage }, {
  ok: code === 200,
  prodCode: code,
  stageCode: null,
  message: code === 200 ? 'Prod CDN отдаёт 200.' : `Prod HTTP ${code}`,
});

console.log('═'.repeat(60));
console.log('  ВОССТАНОВЛЕНИЕ PROD (pages-ac), не stage');
console.log('═'.repeat(60));
console.log('');
console.log(`  1. ${PLACEMENT}`);
console.log('  2. Режим разработки ВЫКЛ');
console.log('  3. Во ВСЕ prod-поля вставьте:');
console.log(`  ${prodUrl}`);
console.log('  4. Сохранить → vk.com/app54526886');
console.log('');
if (code !== 200) {
  console.log('  ⚠ Этот prod сейчас не 200 — см. placement:recovery');
}
console.log('═'.repeat(60));

process.exit(code === 200 ? 0 : 1);
