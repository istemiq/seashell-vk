/**
 * Чеклист размещения VK после deploy (prod vs stage, хеш хостинга).
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const DEPLOY_URLS_FILE = join(root, '.deploy-urls.json');
const APP_ID = 54526886;
const DEV_PORTAL_PLACEMENT = `https://dev.vk.com/admin/app-${APP_ID}/placement`;

export function parseDeployOutput(text) {
  const prodMatches = [
    ...text.matchAll(
      /https:\/\/prod-app54526886-[a-f0-9]+\.pages-ac\.vk-apps\.com\/index\.html/g,
    ),
  ];
  const stageMatches = [
    ...text.matchAll(
      /https:\/\/stage-app54526886-[a-f0-9]+\.pages\.vk-apps\.com\/index\.html/g,
    ),
  ];
  return {
    prod: prodMatches.at(-1)?.[0] ?? null,
    stage: stageMatches.at(-1)?.[0] ?? null,
  };
}

export function hashFromUrl(url) {
  if (!url) return null;
  const m = url.match(/app54526886-([a-f0-9]+)\./);
  return m?.[1] ?? null;
}

export function printPlacementChecklist(record) {
  const { prod, stage, recordedAt } = record;
  const prodHash = hashFromUrl(prod);
  const stageHash = hashFromUrl(stage);
  const hashesMatch = prodHash && stageHash && prodHash === stageHash;

  console.log('');
  console.log('═'.repeat(60));
  console.log('  ВАЖНО: сверка размещения VK (prod / stage)');
  console.log('═'.repeat(60));
  if (recordedAt) {
    console.log(`  Записано: ${recordedAt}`);
  }
  console.log('');
  console.log('  Ссылка vk.ru/app54526886 открывает URL из dev.vk → Размещение,');
  console.log('  а не файлы с вашего ПК. После каждого deploy сверьте хеш.');
  console.log('');
  console.log('  PRODUCTION (поля URL, режим разработки ВЫКЛ):');
  console.log(`  ${prod ?? '(не найден в логе — скопируйте из вывода deploy)'}`);
  console.log('  Домен: pages-ac.vk-apps.com');
  console.log('');
  console.log('  STAGE (поля под «Режим разработки»):');
  console.log(`  ${stage ?? '(не найден в логе — скопируйте из вывода deploy)'}`);
  console.log('  Домен: pages.vk-apps.com (без -ac)');
  console.log('');

  if (prodHash && stageHash) {
    if (hashesMatch) {
      console.log(`  ✓ Хеш prod и stage совпадают: ${prodHash}`);
    } else {
      console.log(`  ✗ Хеши РАЗНЫЕ: prod=${prodHash}, stage=${stageHash}`);
    }
  }

  console.log('');
  console.log('  Чеклист:');
  console.log(`  1. Открыть: ${DEV_PORTAL_PLACEMENT}`);
  console.log('  2. Вставить PROD URL во все prod-поля (mobile, desktop, m.vk)');
  console.log('  3. Вставить STAGE URL во все stage-поля (под режимом разработки)');
  console.log('  4. Нажать «Сохранить»');
  console.log('  5. Проверка: npm run verify:hosting (prod должен быть HTTP 200)');
  console.log('  6. Режим разработки ВЫКЛ → vk.ru/app54526886 с телефона');
  console.log('  7. Не сохранять форму со старым хешом — перезапишет автообновление');
  console.log('');
  console.log('  Срочный план: см. MODERATION-RUSH.ru.md');
  console.log('  Повторить чеклист: npm run placement:show');
  console.log('═'.repeat(60));
  console.log('');
}

export function loadLastDeployUrls() {
  if (!existsSync(DEPLOY_URLS_FILE)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(DEPLOY_URLS_FILE, 'utf8'));
  } catch {
    return null;
  }
}
