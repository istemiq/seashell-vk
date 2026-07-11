#!/usr/bin/env node
/**
 * Перенос Seashell с Beget на новый VPS (EU).
 *
 * Перед запуском:
 *   1. Арендуй VPS (Timeweb Cloud NL/DE или Aeza EU), оплата СБП/Мир
 *   2. На новом сервере: bash scripts/bootstrap-new-vps.sh
 *   3. Задай переменные:
 *        set SEASHELL_VPS_OLD=root@155.212.141.148
 *        set SEASHELL_VPS_NEW=root@NEW_IP
 *
 * Запуск из seashell/:
 *   node scripts/migrate-off-beget.mjs
 *
 * После успеха — смени A-записи api.sishel.ru и front.sishel.ru на NEW_IP,
 * certbot на новом сервере, проверь OpenRouter, отключи Beget.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OLD = process.env.SEASHELL_VPS_OLD ?? 'root@155.212.141.148';
const NEW = process.env.SEASHELL_VPS_NEW ?? '';
const OLD_DIR = process.env.SEASHELL_VPS_DIR ?? '/root/seashell-server-new';
const NEW_DIR = OLD_DIR;
const stamp = Date.now();
const backupLocal = join(tmpdir(), `seashell-migrate-${stamp}.tar.gz`);

function run(cmd, args, { inherit = false } = {}) {
  const r = spawnSync(cmd, args, {
    encoding: 'utf8',
    stdio: inherit ? 'inherit' : 'pipe',
  });
  if (r.status !== 0) {
    console.error(r.stderr || r.stdout || `${cmd} failed`);
    process.exit(r.status ?? 1);
  }
  return (r.stdout || '').trim();
}

function step(n, title) {
  console.log(`\n=== ${n}. ${title} ===\n`);
}

if (!NEW) {
  console.error(`
Задай IP нового сервера:

  PowerShell:
    $env:SEASHELL_VPS_NEW="root@YOUR_NEW_IP"
    node scripts/migrate-off-beget.mjs

Рекомендация: Timeweb Cloud → Амsterdam/Frankfurt, 2 GB RAM, оплата СБП.
После создания VPS сначала на нём:
    scp scripts/bootstrap-new-vps.sh ${OLD.replace('155.212.141.148', 'YOUR_NEW_IP')}
    ssh root@YOUR_NEW_IP bash bootstrap-new-vps.sh
`);
  process.exit(1);
}

step(1, 'Бэкап PostgreSQL + .env с Beget');
run('ssh', [
  OLD,
  `set -e; cd /tmp; sudo -u postgres pg_dump seashell | gzip -9 > seashell-db.sql.gz; cp ${OLD_DIR}/.env seashell.env; tar -czf seashell-migrate.tar.gz seashell-db.sql.gz seashell.env; echo OK`,
]);
run('scp', [`${OLD}:/tmp/seashell-migrate.tar.gz`, backupLocal]);
console.log(`Локальная копия: ${backupLocal}`);

step(2, 'Восстановление на новом VPS');
run('scp', [backupLocal, `${NEW}:/tmp/seashell-migrate.tar.gz`]);
run('ssh', [
  NEW,
  `set -e
cd /tmp && tar -xzf seashell-migrate.tar.gz
cp seashell.env ${NEW_DIR}/.env
gunzip -c seashell-db.sql.gz | sudo -u postgres psql seashell
grep -q '^LLM_PROVIDER=' ${NEW_DIR}/.env || echo 'LLM_PROVIDER=openrouter' >> ${NEW_DIR}/.env
echo OK`,
]);

step(3, 'Проверка OpenRouter с нового IP');
const orCheck = run('ssh', [
  NEW,
  `set -a; source ${NEW_DIR}/.env; curl -sS -w "\\nHTTP:%{http_code}" -H "Authorization: Bearer $OPENROUTER_API_KEY" https://openrouter.ai/api/v1/credits | tail -3`,
]);
console.log(orCheck);
if (orCheck.includes('HTTP:403') || orCheck.includes('security policy')) {
  console.error('\n⚠ OpenRouter всё ещё 403 на этом IP — попробуй другую EU-локацию или LLM_PROVIDER=deepseek');
} else if (orCheck.includes('HTTP:200')) {
  console.log('\n✓ OpenRouter доступен с нового сервера');
}

step(4, 'Деплой API на новый VPS');
const deploy = spawnSync('node', ['scripts/deploy-api-vps.mjs'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, SEASHELL_VPS: NEW, SEASHELL_VPS_DIR: NEW_DIR },
});
if (deploy.status !== 0) process.exit(deploy.status ?? 1);

console.log(`
=== Дальше вручную ===

1. DNS: A-записи api.sishel.ru и front.sishel.ru → IP нового сервера
2. На новом VPS (после DNS, ~5–15 мин):
     certbot --nginx -d api.sishel.ru -d front.sishel.ru --non-interactive --agree-tos -m YOUR_EMAIL
3. Фронт (из seashell_tg_clean):
     $env:SEASHELL_VPS="${NEW}"
     npm run build && npm run deploy:tg-web
4. Проверка:
     curl https://api.sishel.ru/api/health
     curl -I https://front.sishel.ru/
5. Через 1–2 дня — удалить VPS на Beget (экономия ~1700 ₽/мес)

Beget больше не нужен для Seashell.
`);

try {
  unlinkSync(backupLocal);
} catch {
  // keep backup on failure
}
