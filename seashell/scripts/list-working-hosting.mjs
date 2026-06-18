#!/usr/bin/env node
/**
 * Сканирует известные hash и пишет seashell/WORKING-HOSTING-URLS.json
 * Запуск: node scripts/list-working-hosting.mjs
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outFile = join(root, 'WORKING-HOSTING-URLS.json');
const APP_ID = 54526886;

function collectHashes() {
  const set = new Set([
    '5ec7ada0148c',
    'c0bcdfbd8d0b',
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

  for (const rel of ['.deploy-urls.json']) {
    const p = join(root, rel);
    if (!existsSync(p)) continue;
    for (const m of readFileSync(p, 'utf8').matchAll(/54526886-([a-f0-9]{12})/g)) set.add(m[1]);
  }

  for (const name of ['last-deploy.log', 'last-diagnose.log', 'vk-robot-probe.log']) {
    const p = join(root, 'logs', name);
    if (!existsSync(p)) continue;
    for (const m of readFileSync(p, 'utf8').matchAll(/54526886-([a-f0-9]{12})/g)) set.add(m[1]);
  }

  return [...set].sort();
}

function httpCode(url) {
  const r = spawnSync('curl.exe', ['-sS', '-o', 'NUL', '-w', '%{http_code}', url], {
    encoding: 'utf8',
    timeout: 25000,
  });
  return String(r.stdout ?? '').trim() || 'ERR';
}

function fetchText(url) {
  const r = spawnSync('curl.exe', ['-sS', '-L', url], { encoding: 'utf8', timeout: 25000 });
  return r.status === 0 ? (r.stdout ?? '') : '';
}

function urls(hash) {
  return {
    hash,
    stage: `https://stage-app${APP_ID}-${hash}.pages.vk-apps.com/index.html`,
    prod: `https://prod-app${APP_ID}-${hash}.pages-ac.vk-apps.com/index.html`,
  };
}

function probeSide(baseUrl) {
  const indexUrl = `${baseUrl}/index.html`;
  const index = httpCode(indexUrl);
  let jsFile = null;
  let js = null;
  if (index === '200') {
    const html = fetchText(indexUrl);
    const m = html.match(/assets\/(index-[^"']+\.js)/);
    jsFile = m?.[1] ?? null;
    if (jsFile) js = httpCode(`${baseUrl}/assets/${jsFile}`);
  }
  const fullyWorking = index === '200' && js === '200';
  return { index, jsFile, js, fullyWorking, indexUrl };
}

const hashes = collectHashes();
const entries = [];

for (const hash of hashes) {
  const { stage, prod } = urls(hash);
  const stageBase = stage.replace(/\/index\.html$/, '');
  const prodBase = prod.replace(/\/index\.html$/, '');
  const stageProbe = probeSide(stageBase);
  const prodProbe = probeSide(prodBase);
  entries.push({
    hash,
    stage: {
      url: stage,
      index: stageProbe.index,
      jsFile: stageProbe.jsFile,
      js: stageProbe.js,
      fullyWorking: stageProbe.fullyWorking,
    },
    prod: {
      url: prod,
      index: prodProbe.index,
      jsFile: prodProbe.jsFile,
      js: prodProbe.js,
      fullyWorking: prodProbe.fullyWorking,
    },
  });
}

const workingStage = entries.filter((e) => e.stage.fullyWorking);
const workingProd = entries.filter((e) => e.prod.fullyWorking);
const prodIndexOnly = entries.filter((e) => e.prod.index === '200' && !e.prod.fullyWorking);

let deployMeta = {};
try {
  if (existsSync(join(root, '.deploy-urls.json'))) {
    deployMeta = JSON.parse(readFileSync(join(root, '.deploy-urls.json'), 'utf8'));
  }
} catch {
  deployMeta = {};
}

const doc = {
  appId: APP_ID,
  probedAt: new Date().toISOString(),
  placement: 'https://dev.vk.com/admin/app-54526886/placement',
  notes: [
    'fullyWorking = index.html и главный JS отдают HTTP 200',
    'Для пользователей (prod-поля) нужен prod.fullyWorking',
    'bad/prod-contour-35bb6eb @ 35bb6eb — не деплоить без probe prod JS',
    'good/prod-no-ads-5ec7ada0148c — важная рабочая версия без рекламы (prod+stage 200)',
  ],
  currentRecommended: workingProd[0]
    ? {
        hash: workingProd[0].hash,
        gitCommit: deployMeta.gitCommit ?? '7a51db8',
        prod: workingProd[0].prod.url,
        stage: workingProd[0].stage.url,
      }
    : null,
  working: {
    prod: workingProd.map((e) => ({
      hash: e.hash,
      url: e.prod.url,
      jsFile: e.prod.jsFile,
    })),
    stage: workingStage.map((e) => ({
      hash: e.hash,
      url: e.stage.url,
      jsFile: e.stage.jsFile,
    })),
  },
  partial: {
    prodIndexOnlyJsBlocked: prodIndexOnly.map((e) => ({
      hash: e.hash,
      url: e.prod.url,
      jsFile: e.prod.jsFile,
      jsHttp: e.prod.js,
    })),
  },
  all: entries,
};

writeFileSync(outFile, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');

console.log(`Written ${outFile}`);
console.log(`  prod fullyWorking: ${workingProd.length}`);
console.log(`  stage fullyWorking: ${workingStage.length}`);
for (const e of workingProd) {
  console.log(`  ✓ prod ${e.hash}`);
}
