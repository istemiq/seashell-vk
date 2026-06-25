#!/usr/bin/env node
/**
 * Симуляция проверок робота VK при публикации на хостинг.
 * VK не отдаёт разработчику свой лог — скрипт повторяет известные шаги и пишет PASS/FAIL
 * с номерами строк в build/index.html и server/index.js.
 *
 * Без deploy, без лимита VK.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import { loadLastDeployUrls } from './placement-checklist.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const logsDir = join(root, 'logs');
const outFile = join(logsDir, 'vk-robot-probe.log');
const API = 'https://api.sishel.ru';

mkdirSync(logsDir, { recursive: true });

const lines = [];
const log = (s = '') => {
  lines.push(s);
  console.log(s);
};

function httpCode(url, extraHeaders = {}) {
  const args = ['-sS', '-o', 'NUL', '-w', '%{http_code}', '-L', url];
  for (const [k, v] of Object.entries(extraHeaders)) {
    args.push('-H', `${k}: ${v}`);
  }
  const r = spawnSync('curl.exe', args, { encoding: 'utf8', timeout: 30000 });
  const c = Number.parseInt(String(r.stdout ?? '').trim(), 10);
  return Number.isFinite(c) ? c : `ERR ${r.stderr?.trim() || 'curl'}`;
}

function httpGet(url, extraHeaders = {}) {
  const args = ['-sS', '-L', url];
  for (const [k, v] of Object.entries(extraHeaders)) {
    args.push('-H', `${k}: ${v}`);
  }
  const r = spawnSync('curl.exe', args, { encoding: 'utf8', timeout: 30000 });
  if (r.status !== 0) return { ok: false, error: r.stderr?.trim() || 'curl failed' };
  return { ok: true, body: r.stdout ?? '' };
}

function parseHtmlResources(html) {
  const rows = [];
  const fileLines = html.split(/\r?\n/);
  fileLines.forEach((line, i) => {
    const ln = i + 1;
    const m =
      line.match(/<script[^>]+src=["']([^"']+)["']/i) ||
      line.match(/<link[^>]+href=["']([^"']+)["']/i);
    if (m) {
      rows.push({ line: ln, raw: line.trim(), url: m[1] });
    }
    if (/<div id="root"/.test(line)) {
      rows.push({ line: ln, raw: line.trim(), url: '#root' });
    }
    if (/send\('VKWebAppInit'\)/.test(line)) {
      rows.push({ line: ln, raw: 'VKWebAppInit (inline)', url: 'VKWebAppInit' });
    }
  });
  return rows;
}

function pass(label) {
  log(`  PASS  ${label}`);
}

function fail(label, detail) {
  log(`  FAIL  ${label}`);
  if (detail) log(`        ${detail}`);
}

function section(title) {
  log('');
  log('═'.repeat(70));
  log(`  ${title}`);
  log('═'.repeat(70));
}

const record = loadLastDeployUrls();
const buildHtmlPath = join(root, 'build', 'index.html');
const serverIndexPath = join(root, 'server', 'index.js');

log('VK ROBOT PROBE — симуляция (не официальный лог VK)');
log(`Время: ${new Date().toISOString()}`);
log('');
log('VK не публикует разработчику «на какой строке упал робот».');
log('Ниже — те же проверки, которые описаны в AGENTS.md и server/index.js:172-189.');
log('');

section('1. Локальный build/index.html — что робот должен увидеть после загрузки CDN');

if (!existsSync(buildHtmlPath)) {
  fail('build/index.html отсутствует', 'npm run build');
} else {
  const html = readFileSync(buildHtmlPath, 'utf8');
  const resources = parseHtmlResources(html);
  pass(`файл есть, ${html.split(/\r?\n/).length} строк`);
  log('');
  log('  Строка | что проверяет робот / браузер');
  log('  ' + '-'.repeat(66));
  for (const r of resources) {
    log(`  ${String(r.line).padStart(5)} | ${r.url}`);
    if (r.url === 'VKWebAppInit') {
      log('         | см. public/vk-early-init.js:47, src/main.js:19 — type=module = defer, не sync');
    }
    if (r.url.startsWith('./assets/') || r.url.startsWith('assets/')) {
      log('         | если CDN отдаёт 403 → JS не выполнится, робот: «App not detected»');
    }
  }
  if (!resources.some((r) => r.url === '#root')) {
    fail('#root не найден в HTML', 'React некуда монтироваться');
  } else {
    pass('#root для React (src/main.js:22 createRoot)');
  }
}

section('2. CDN stage — робот грузит билд с *.pages.vk-apps.com');

const stageUrl = record?.stage;
const prodUrl = record?.prod;

if (!stageUrl) {
  fail('нет stage URL', 'нужен хотя бы deploy:stage или .deploy-urls.json');
} else {
  log(`  URL: ${stageUrl}`);
  const code = httpCode(stageUrl);
  if (code === 200) {
    pass(`GET index.html → HTTP ${code}`);
  } else {
    fail(`GET index.html → HTTP ${code}`, 'робот не увидит приложение');
  }

  const base = stageUrl.replace(/\/index\.html$/i, '');
  const live = code === 200 ? httpGet(stageUrl).body : readFileSync(buildHtmlPath, 'utf8');
  const assets = parseHtmlResources(live).filter((r) => r.url.startsWith('./') || r.url.startsWith('assets/'));

  log('');
  log('  Ассеты из HTML на CDN (stage):');
  for (const a of assets) {
    const rel = a.url.replace(/^\.\//, '');
    const assetUrl = `${base}/${rel}`;
    const ac = httpCode(assetUrl);
    const ref = `build/index.html:${a.line}`;
    if (ac === 200) pass(`${ref}  ${rel} → HTTP ${ac}`);
    else fail(`${ref}  ${rel} → HTTP ${ac}`, assetUrl);
  }
}

section('3. CDN prod (pages-ac) — публикация после SMS / update_prod');

if (!prodUrl) {
  log('  (prod URL не записан — пропуск)');
} else {
  log(`  URL: ${prodUrl}`);
  const code = httpCode(prodUrl);
  if (code === 200) pass(`GET index.html → HTTP ${code}`);
  else {
    fail(`GET index.html → HTTP ${code}`, 'типичная причина: prod не опубликован на pages-ac');
    log('        upload на stage прошёл (Deploy success), но prod-бакет AccessDenied');
    log('        update_prod:0 → SMS-код не вводился → prod CDN не обновляется');
  }

  if (code === 200) {
    const base = prodUrl.replace(/\/index\.html$/i, '');
    const html = httpGet(prodUrl).body ?? '';
    for (const a of parseHtmlResources(html).filter((r) => r.url.startsWith('./') || r.url.startsWith('assets/'))) {
      const rel = a.url.replace(/^\.\//, '');
      const ac = httpCode(`${base}/${rel}`);
      const ref = `index.html:${a.line}`;
      if (ac === 200) pass(`${ref} ${rel} → ${ac}`);
      else fail(`${ref} ${rel} → ${ac}`);
    }
  } else {
    fail('prod JS/CSS не проверены', 'index.html уже 403 — робот до бандла не доходит');
  }
}

section('4. API — как server/index.js:172-189 (reviewer probe для робота)');

const stageOrigin = stageUrl
  ? stageUrl.replace(/\/index\.html$/i, '').replace(/^https:\/\//, 'https://')
  : 'https://stage-app54526886.pages.vk-apps.com';

const robotChecks = [
  {
    name: 'GET /api/health (без auth)',
    url: `${API}/api/health`,
    headers: {},
    expect: 200,
    codeRef: 'server/index.js — до auth middleware',
  },
  {
    name: 'GET /api/words как робот VK (Origin *.vk-apps.com, БЕЗ X-VK-Launch-Params)',
    url: `${API}/api/words`,
    headers: { Origin: stageOrigin.startsWith('http') ? stageOrigin : `https://${stageOrigin}` },
    expect: 200,
    codeRef: 'server/index.js:152-178 tryVkReviewerProbe → 200, не 401',
  },
  {
    name: 'GET /api/sets — тот же reviewer probe',
    url: `${API}/api/sets`,
    headers: { Origin: stageOrigin.startsWith('http') ? stageOrigin : `https://${stageOrigin}` },
    expect: 200,
    codeRef: 'server/index.js:155 isVkReviewerProbeRequest',
  },
];

for (const c of robotChecks) {
  const code = httpCode(c.url, c.headers);
  if (code === c.expect) {
    pass(`${c.name} → HTTP ${code}`);
    log(`        ${c.codeRef}`);
  } else {
    fail(`${c.name} → HTTP ${code} (ожидали ${c.expect})`, c.codeRef);
    if (code === 401) {
      log('        проверьте VPS: VK_APP_SECRET, VK_REVIEWER_USER_ID=1, pm2 restart seashell-api');
    }
  }
}

section('5. Фронт при старте (что робот косвенно требует)');

log('  src/main.js:15-22     bootstrapVkSession / VKWebAppInit');
log('  src/main.js:22        createRoot(#root) — нужен div из index.html');
log('  src/App.js:73-90      VKWebAppGetUserInfo (таймаут 8s, UI через 2.5s)');
log('  src/api/dictionaryApi.js:129  fetchWords — при открытии «Словарь», не на home');
log('  vite.config.js:84     base: "./" — пути assets/ в index.html');
log('');
log('  Если CDN prod 403 на строках 68-69 index.html — робот не доходит до main.js.');

section('ИТОГ для текущего hash');

let verdict = 'OK';
if (record?.prod && httpCode(record.prod) !== 200) {
  verdict = 'PROD CDN 403 — робот VK не публикует hash на pages-ac (не баг строки в коде)';
}
if (stageUrl && httpCode(stageUrl) === 200) {
  pass(`stage ${record?.stage?.match(/7bc841a1c1e2|[a-f0-9]{12}/)?.[0] ?? 'hash'} доступен для размещения`);
}
log('');
log(`  ВЕРДИКТ: ${verdict}`);
log('');
log(`  Полный текст: ${outFile}`);
log('  Для других AI: приложите этот файл + build/index.html + server/index.js:130-200');

writeFileSync(outFile, `${lines.join('\n')}\n`, 'utf8');

const hasFail = lines.some((l) => l.startsWith('  FAIL'));
process.exit(hasFail ? 1 : 0);
