#!/usr/bin/env node
/**
 * Синхронизация всего server/ на VPS. Не копируйте только index.js —
 * иначе index.js вызывает функции из db.js/gigachat.js, которых там нет.
 */
import { spawnSync } from 'node:child_process';
import { unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const serverDir = join(root, 'server');
const VPS = process.env.SEASHELL_VPS ?? 'root@155.212.141.148';
const REMOTE_DIR = process.env.SEASHELL_VPS_DIR ?? '/root/seashell-server-new';
const tarPath = join(tmpdir(), `seashell-server-${Date.now()}.tar.gz`);

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', ...opts });
  if (r.status !== 0) {
    console.error(r.stderr || r.stdout || `${cmd} exit ${r.status}`);
    process.exit(r.status ?? 1);
  }
  return r;
}

console.log(`[deploy:api-vps] ${serverDir} → ${VPS}:${REMOTE_DIR}`);
console.log('  (весь server/, без .env / node_modules / data/)');

try {
  run('tar', [
    '-czf',
    tarPath,
    '-C',
    serverDir,
    '--exclude=node_modules',
    '--exclude=.env',
    '--exclude=.env.save',
    '--exclude=data',
    '.',
  ]);

  run('scp', [tarPath, `${VPS}:${REMOTE_DIR}/deploy.tar.gz`]);
  run('ssh', [VPS, `cd ${REMOTE_DIR} && tar -xzf deploy.tar.gz && rm -f deploy.tar.gz`]);
  run('ssh', [VPS, `cd ${REMOTE_DIR} && rm -rf node_modules && npm install --omit=dev`]);
  run('ssh', [VPS, 'pm2 restart seashell-api']);

  const health = run('ssh', [VPS, 'curl -s http://127.0.0.1:3001/api/health']);
  console.log(health.stdout.trim());
  console.log('\n✓ VPS API = локальный server/ целиком');
} finally {
  try {
    unlinkSync(tarPath);
  } catch {
    // ignore
  }
}
