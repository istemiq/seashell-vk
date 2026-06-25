#!/usr/bin/env node
/**
 * deploy:prod + полная диагностика. Лог пишется в logs/last-deploy.log (cmd и PowerShell).
 */
import { spawn } from 'node:child_process';
import { mkdirSync, createWriteStream } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripAnsi } from './log-utils.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const logsDir = join(root, 'logs');
mkdirSync(logsDir, { recursive: true });

const logPath = join(logsDir, 'last-deploy.log');
const logStream = createWriteStream(logPath, { flags: 'w' });

function writeLog(chunk) {
  logStream.write(stripAnsi(chunk));
}

function run(label, command, args, { env = process.env } = {}) {
  const banner = `\n${'▶'.repeat(30)}\n  ${label}\n${'▶'.repeat(30)}\n\n`;
  process.stdout.write(banner);
  writeLog(banner);

  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: root,
      env,
      shell: true,
    });

    child.stdout.on('data', (chunk) => {
      process.stdout.write(chunk);
      writeLog(chunk);
    });
    child.stderr.on('data', (chunk) => {
      process.stderr.write(chunk);
      writeLog(chunk);
    });
    child.on('close', (code) => resolve(code ?? 1));
    child.on('error', (err) => {
      const msg = `\n✗ spawn error: ${err.message}\n`;
      process.stderr.write(msg);
      writeLog(msg);
      resolve(1);
    });
  });
}

console.log(`[deploy-prod:full] Полный лог:  ${logPath}`);
console.log(`[deploy-prod:full] Сводка:      logs\\last-deploy-summary.txt (после шага C)`);
console.log('');

let deployExit = 0;

deployExit = await run('Шаг A — vite build', 'npm', ['run', 'build']);
if (deployExit !== 0) {
  const msg = '\n✗ Сборка упала — vk-miniapps-deploy не запускаем.\n';
  process.stderr.write(msg);
  writeLog(msg);
} else {
  deployExit = await run('Шаг B — vk-miniapps-deploy (production)', 'node', ['scripts/deploy-prod.mjs'], {
    env: { ...process.env, MINI_APPS_ENVIRONMENT: 'production' },
  });
}

const diagExit = await run('Шаг C — полная диагностика', 'node', ['scripts/deploy-diagnostics.mjs']);

const summary = [
  '',
  '═'.repeat(60),
  '  deploy:prod:full — сводка',
  '═'.repeat(60),
  `  build + vk-deploy exit: ${deployExit}`,
  `  diagnose exit:          ${diagExit}`,
  `  log file:               ${logPath}`,
  '',
  deployExit !== 0
    ? '  Deploy не прошёл — см. шаг B (токен MINI_APPS_ACCESS_TOKEN, SMS-код, prod 403).'
    : '  Deploy завершён — см. шаг B в логе.',
  diagExit !== 0
    ? '  Диагностика нашла проблемы — см. шаг C (index / JS / API).'
    : '  Диагностика OK.',
  '═'.repeat(60),
  '',
].join('\n');

process.stdout.write(summary);
writeLog(`${summary}\n`);
logStream.end();

process.exit(deployExit !== 0 ? deployExit : diagExit);
