#!/usr/bin/env node
/**
 * Проверка prod/stage URL после deploy (HTTP-код index.html).
 * Выход: 0 — prod 200; 1 — prod не 200 или нет .deploy-urls.json.
 */
import { loadLastDeployUrls } from './placement-checklist.mjs';
import {
  printHostingVerifyResult,
  verifyHostingRecord,
} from './hosting-verify.mjs';

const record = loadLastDeployUrls();
if (!record?.prod || !record?.stage) {
  console.error('');
  console.error('Нет .deploy-urls.json — сначала: npm run deploy:prod');
  console.error('');
  process.exit(1);
}

const result = await verifyHostingRecord(record, { requireProd: true });
printHostingVerifyResult(record, result);

if (result.ok) {
  console.log('  npm run placement:show');
  process.exit(0);
}

if (result.prodCode === 403 && result.stageCode === 200) {
  console.log('  Срочный обход (тот же хеш): stage URL в prod-полях размещения.');
  console.log('  Основной путь: npm.cmd run deploy:prod');
}

process.exit(1);
