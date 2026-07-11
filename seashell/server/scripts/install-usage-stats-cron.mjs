#!/usr/bin/env node
/**
 * Install daily usage report cron on VPS (root).
 *   node scripts/install-usage-stats-cron.mjs
 *   node scripts/install-usage-stats-cron.mjs --hour 9
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const hour = (() => {
  const i = process.argv.indexOf('--hour');
  if (i === -1) return 9;
  const n = parseInt(process.argv[i + 1], 10);
  return Number.isFinite(n) && n >= 0 && n <= 23 ? n : 9;
})();

const marker = '# seashell-usage-daily';
const job = `${marker}\nCRON_TZ=Europe/Moscow\n0 ${hour} * * * cd /root/seashell-server-new && /usr/bin/node scripts/usage-stats-daily.mjs >> /var/log/seashell-usage-daily.log 2>&1\n`;

const list = spawnSync('crontab', ['-l'], { encoding: 'utf8' });
const prev = list.status === 0 ? list.stdout : '';
const without = prev
  .split('\n')
  .filter((line) => !line.includes(marker) && line !== 'CRON_TZ=Europe/Moscow' && !line.includes('usage-stats-daily.mjs'))
  .join('\n')
  .replace(/\n{3,}/g, '\n\n')
  .trim();

const next = (without ? `${without}\n\n` : '') + job;
writeFileSync('/tmp/seashell-cron.txt', next);
spawnSync('crontab', ['/tmp/seashell-cron.txt'], { stdio: 'inherit' });

console.log(`✓ Cron installed: daily at ${hour}:00 Europe/Moscow`);
console.log('  Log: /var/log/seashell-usage-daily.log');
console.log('  Test: cd /root/seashell-server-new && node scripts/usage-stats-daily.mjs --dry-run');
