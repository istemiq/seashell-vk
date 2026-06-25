#!/usr/bin/env node
/** Stage/prod probe + banner detection for known hosting hashes. */
import { spawnSync } from 'node:child_process';

const hashes = [
  '25a3c6dd9866',
  '2f620630a7e3',
  '2fccaaa19365',
  '7bc841a1c1e2',
  '92679b745307',
  '602fa78463c2',
  'a50005caed51',
];

function curl(url, body = false) {
  const args = body ? ['-sS', '-L', url] : ['-sS', '-o', 'NUL', '-w', '%{http_code}', url];
  const r = spawnSync('curl.exe', args, { encoding: 'utf8', timeout: 30000 });
  return body ? (r.stdout ?? '') : String(r.stdout ?? '').trim();
}

console.log('hash\t\t\tstage\tprod\tbanner?\tbuild stamp');
console.log('-'.repeat(72));

for (const h of hashes) {
  const stageBase = `https://stage-app54526886-${h}.pages.vk-apps.com`;
  const prodBase = `https://prod-app54526886-${h}.pages-ac.vk-apps.com`;
  const stageIndex = curl(`${stageBase}/index.html`);
  const prodIndex = curl(`${prodBase}/index.html`);

  let banner = '—';
  let stamp = '—';
  let stageJs = '—';
  let prodJs = '—';

  if (stageIndex === '200') {
    const html = curl(`${stageBase}/index.html`, true);
    const m = html.match(/assets\/(index-[^"']+\.js)/);
    const buildM = html.match(/seashell-build:\s*([^\->]+)/);
    if (buildM) stamp = buildM[1].trim();
    if (m) {
      const js = m[1];
      stageJs = curl(`${stageBase}/assets/${js}`);
      prodJs = curl(`${prodBase}/assets/${js}`);
      const body = curl(`${stageBase}/assets/${js}`, true);
      const hasOurBanner = /tryShowVkBannerAd|VKWebAppShowBannerAd.*bottom|initVkBannerAd/i.test(body);
      banner = hasOurBanner ? 'WITH_BANNER' : 'NO_BANNER';
    }
  }

  console.log(
    `${h}\tidx ${stageIndex}/${prodIndex}\tjs ${stageJs}/${prodJs}\t${banner}\t${stamp}`,
  );
}
