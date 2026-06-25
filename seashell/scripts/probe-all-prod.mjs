#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const hashes = [
  '2f620630a7e3',
  'a50005caed51',
  '602fa78463c2',
  'e1f0e4dde17f',
  '615b81138886',
  '25a3c6dd9866',
  'df42cab19d6e',
  '2fccaaa19365',
  'a7f1d163afa3',
  'f8fb387e380f',
];

function status(url) {
  const r = spawnSync('curl.exe', ['-sS', '-o', 'NUL', '-w', '%{http_code}', url], {
    encoding: 'utf8',
    timeout: 25000,
  });
  const c = String(r.stdout ?? '').trim();
  return c || 'ERR';
}

async function probeHash(hash, rounds = 5) {
  const prod = `https://prod-app54526886-${hash}.pages-ac.vk-apps.com`;
  const indexCodes = [];
  let jsPath = 'index-65BF1sgl.js';

  for (let i = 0; i < rounds; i++) {
    indexCodes.push(status(`${prod}/index.html`));
    await new Promise((r) => setTimeout(r, 150));
  }

  for (let i = 0; i < 3 && indexCodes.every((c) => c !== '200'); i++) {
    const c = status(`${prod}/index.html`);
    if (c === '200') {
      const html = spawnSync('curl.exe', ['-sS', `${prod}/index.html`], { encoding: 'utf8' }).stdout ?? '';
      jsPath = html.match(/assets\/(index-[^"']+\.js)/)?.[1] ?? jsPath;
      break;
    }
  }

  if (indexCodes.includes('200')) {
    const html = spawnSync('curl.exe', ['-sS', `${prod}/index.html`], { encoding: 'utf8' }).stdout ?? '';
    jsPath = html.match(/assets\/(index-[^"']+\.js)/)?.[1] ?? jsPath;
  }

  const jsCodes = [];
  for (let i = 0; i < rounds; i++) {
    jsCodes.push(status(`${prod}/assets/${jsPath}`));
    await new Promise((r) => setTimeout(r, 150));
  }

  const sum = (arr) => arr.reduce((a, c) => ({ ...a, [c]: (a[c] ?? 0) + 1 }), {});

  return { hash, jsPath, indexCodes, jsCodes, indexSum: sum(indexCodes), jsSum: sum(jsCodes) };
}

console.log('Prod CDN probe (pages-ac), 5 requests each\n');
for (const h of hashes) {
  const r = await probeHash(h);
  console.log(`${r.hash}`);
  console.log(`  index x5: ${r.indexCodes.join(' ')}  → ${JSON.stringify(r.indexSum)}`);
  console.log(`  js (${r.jsPath}) x5: ${r.jsCodes.join(' ')}  → ${JSON.stringify(r.jsSum)}`);
  console.log('');
}
