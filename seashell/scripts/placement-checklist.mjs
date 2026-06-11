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

/** Prod URL с тем же хешом, что у stage (если VK не напечатал prod в логе). */
export function prodUrlFromStage(stageUrl) {
  if (!stageUrl) return null;
  const m = stageUrl.match(
    /https:\/\/stage-app(\d+)-([a-f0-9]+)\.pages\.vk-apps\.com\/index\.html/,
  );
  if (!m) return null;
  return `https://prod-app${m[1]}-${m[2]}.pages-ac.vk-apps.com/index.html`;
}

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
  const stage = stageMatches.at(-1)?.[0] ?? null;
  const prod = prodMatches.at(-1)?.[0] ?? null;
  const prodCandidate = prod ?? prodUrlFromStage(stage);
  return { prod, stage, prodCandidate };
}

export function hashFromUrl(url) {
  if (!url) return null;
  const m = url.match(/app54526886-([a-f0-9]+)\./);
  return m?.[1] ?? null;
}

export function printPlacementChecklist(record) {
  const { prod, stage, recordedAt, prodVerified, prodHttp, lastKnownGoodProd } = record;
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
  if (prodHttp != null) {
    console.log(`  prod HTTP: ${prodHttp}`);
  }
  console.log('');
  console.log('  Ссылка vk.ru/app54526886 открывает URL из dev.vk → Размещение.');
  console.log('');

  if (prodVerified && prod) {
    console.log('  PROD — вставить в prod-поля (режим разработки ВЫКЛ):');
    console.log(`  ${prod}`);
  } else if (prod) {
    console.log('  PROD в логе, но НЕ прошёл проверку — НЕ вставлять в prod-поля:');
    console.log(`  ${prod}`);
    if (stage) {
      console.log('');
      console.log('  Временно (новый код): stage URL в prod-поля:');
      console.log(`  ${stage}`);
    }
    if (lastKnownGoodProd) {
      console.log('');
      console.log('  Или оставить последний рабочий prod (pages-ac):');
      console.log(`  ${lastKnownGoodProd}`);
    }
  } else {
    console.log('  PROD URL не найден в логе deploy.');
  }

  console.log('');
  console.log('  STAGE (поля под «Режим разработки»):');
  console.log(`  ${stage ?? '(не найден в логе)'}`);
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
  if (prodVerified) {
    console.log('  2. PROD URL (выше) → все prod-поля');
  } else {
    console.log('  2. Prod не 200 — не трогать мёртвый prod URL');
  }
  console.log('  3. STAGE URL → stage-поля (режим разработки)');
  console.log('  4. Сохранить → vk.ru/app54526886 из приложения VK');
  console.log('  5. npm run verify:hosting');
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
