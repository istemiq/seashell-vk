#!/usr/bin/env node
/**
 * Проверка prod/stage URL после deploy (HTTP-код index.html).
 * Выход: 0 — prod 200; 1 — prod не 200 или нет .deploy-urls.json.
 */
import { loadLastDeployUrls } from './placement-checklist.mjs';

async function headStatus(url) {
  try {
    const res = await fetch(url, { method: 'GET', redirect: 'follow' });
    return res.status;
  } catch (e) {
    return `ERR ${e.message}`;
  }
}

const record = loadLastDeployUrls();
if (!record?.prod || !record?.stage) {
  console.error('');
  console.error('Нет .deploy-urls.json — сначала: npm run deploy');
  console.error('');
  process.exit(1);
}

console.log('');
console.log('Проверка хостинга VK (index.html)...');
console.log(`  prod:  ${record.prod}`);
console.log(`  stage: ${record.stage}`);
console.log('');

const [prodCode, stageCode] = await Promise.all([
  headStatus(record.prod),
  headStatus(record.stage),
]);

console.log(`  prod HTTP:  ${prodCode}`);
console.log(`  stage HTTP: ${stageCode}`);
console.log('');

if (prodCode === 200 && stageCode === 200) {
  console.log('✓ Prod и stage отдают 200 — можно сохранять URL в размещении и идти на модерацию.');
  console.log('  npm run placement:show');
  process.exit(0);
}

if (prodCode === 403 && stageCode === 200) {
  console.log('✗ Prod 403, stage 200 — типичный сбой production на pages-ac.');
  console.log('');
  console.log('  Сделайте по порядку (один раз, не крутите deploy подряд):');
  console.log('  1) $env:MINI_APPS_ENVIRONMENT="production"');
  console.log('  2) npm run deploy   (сервисный токен в MINI_APPS_ACCESS_TOKEN)');
  console.log('  3) npm run verify:hosting   → нужен prod: 200');
  console.log('  4) dev.vk → Размещение → prod URL из лога → Сохранить');
  console.log('  5) vk.ru/app54526886, режим разработки ВЫКЛ');
  console.log('');
  console.log('  Срочный обход до починки prod (если хеши совпадают):');
  console.log('  в prod-полях размещения временно вставьте STAGE URL (pages.vk-apps.com),');
  console.log('  сохраните, проверьте приложение. После prod:200 верните pages-ac URL.');
  console.log('');
  process.exit(1);
}

console.log('✗ Нестандартная комбинация кодов — смотрите лог deploy и лимит 24/сутки.');
process.exit(1);
