#!/usr/bin/env node
/**
 * Что вставить в размещение, если prod 403, а stage 200.
 */
import { loadLastDeployUrls } from './placement-checklist.mjs';
import { printHostingVerifyResult, verifyHostingRecord } from './hosting-verify.mjs';

const PLACEMENT = 'https://dev.vk.com/admin/app-54526886/placement';

const KNOWN_GOOD_PROD =
  'https://prod-app54526886-25a3c6dd9866.pages-ac.vk-apps.com/index.html';

const record = loadLastDeployUrls();
if (!record?.prod || !record?.stage) {
  console.error('Нет .deploy-urls.json — сначала deploy.');
  process.exit(1);
}

const verify = await verifyHostingRecord(record, { requireProd: true });
printHostingVerifyResult(record, verify);

console.log('═'.repeat(60));
console.log('  ВОССТАНОВЛЕНИЕ (prod 403 — типичный сбой VK pages-ac)');
console.log('═'.repeat(60));
console.log('');
console.log(`  Открыть: ${PLACEMENT}`);
console.log('  Режим разработки: ВЫКЛ во всех блоках');
console.log('');

if (verify.ok) {
  console.log('  Prod уже 200 — в prod-поля:');
  console.log(`  ${record.prod}`);
  process.exit(0);
}

console.log('  ВАРИАНТ A — восстановить PROD (pages-ac), приложение снова откроется:');
console.log(`  ${record.lastKnownGoodProd || KNOWN_GOOD_PROD}`);
console.log('  (npm run placement:restore-prod)');
console.log('');
console.log('  ВАРИАНТ B — новая сборка, пока prod 403 (временно, тот же хеш):');
console.log(`  ${record.stage}`);
console.log('');
console.log('  После вставки — Сохранить → vk.com/app54526886');
console.log('');
console.log('  Чтобы НОВЫЙ код вышел на prod: deploy:prod + код с телефона + prod HTTP 200.');
console.log('  update_prod: 1 — код с телефона обязателен; при prod 403 см. stage или lastKnownGoodProd.');
console.log('═'.repeat(60));

process.exit(verify.ok ? 0 : 1);
