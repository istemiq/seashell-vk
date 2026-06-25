#!/usr/bin/env node
/** Проверка всех известных prod hash (index + JS). */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function collectHashes() {
  const set = new Set([
    '92679b745307',
    '7bc841a1c1e2',
    'a50005caed51',
    '2f620630a7e3',
    '602fa78463c2',
    'e1f0e4dde17f',
    '615b81138886',
    '25a3c6dd9866',
    'df42cab19d6e',
    '2fccaaa19365',
    'a7f1d163afa3',
    'f8fb387e380f',
  ]);

  const deployFile = join(root, '.deploy-urls.json');
  if (existsSync(deployFile)) {
    const text = readFileSync(deployFile, 'utf8');
    for (const m of text.matchAll(/54526886-([a-f0-9]{12})/g)) set.add(m[1]);
  }

  for (const name of ['last-deploy.log', 'last-diagnose.log', 'vk-robot-probe.log']) {
    const p = join(root, 'logs', name);
    if (!existsSync(p)) continue;
    const text = readFileSync(p, 'utf8');
    for (const m of text.matchAll(/54526886-([a-f0-9]{12})/g)) set.add(m[1]);
  }

  return [...set];
}

function httpCode(url) {
  const r = spawnSync('curl.exe', ['-sS', '-o', 'NUL', '-w', '%{http_code}', url], {
    encoding: 'utf8',
    timeout: 25000,
  });
  const c = String(r.stdout ?? '').trim();
  return c || 'ERR';
}

function fetchText(url) {
  const r = spawnSync('curl.exe', ['-sS', '-L', url], { encoding: 'utf8', timeout: 25000 });
  return r.status === 0 ? (r.stdout ?? '') : '';
}

const hashes = collectHashes();
const rows = [];

for (const h of hashes) {
  const base = `https://prod-app54526886-${h}.pages-ac.vk-apps.com`;
  const indexUrl = `${base}/index.html`;
  const index = httpCode(indexUrl);
  let js = '—';
  let jsCode = '—';
  if (index === '200') {
    const html = fetchText(indexUrl);
    const m = html.match(/assets\/(index-[^"']+\.js)/);
    js = m?.[1] ?? 'index-65BF1sgl.js';
    jsCode = httpCode(`${base}/assets/${js}`);
  }
  rows.push({ h, index, js, jsCode, url: indexUrl });
}

rows.sort((a, b) => {
  const score = (r) => (r.index === '200' && r.jsCode === '200' ? 0 : r.index === '200' ? 1 : 2);
  return score(a) - score(b) || a.h.localeCompare(b.h);
});

console.log('Prod history probe (pages-ac)\n');
console.log('hash\t\tindex\tjs file\t\t\tjs');
for (const r of rows) {
  console.log(`${r.h}\t${r.index}\t${r.js}\t${r.jsCode}`);
}

const full = rows.filter((r) => r.index === '200' && r.jsCode === '200');
const indexOnly = rows.filter((r) => r.index === '200' && r.jsCode !== '200');

console.log('\n--- Полностью рабочий prod (index + JS = 200) ---');
if (full.length) {
  for (const r of full) console.log(r.url);
} else {
  console.log('(нет)');
}

console.log('\n--- Index 200, JS не 200 ---');
if (indexOnly.length) {
  for (const r of indexOnly) console.log(`${r.url}  js=${r.jsCode} (${r.js})`);
} else {
  console.log('(нет)');
}

console.log('\n--- Все 403/ERR ---');
for (const r of rows.filter((x) => x.index !== '200')) {
  console.log(`${r.h}: index=${r.index}`);
}
