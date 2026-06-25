#!/usr/bin/env node
/**
 * diagnose:deploy с автозаписью в logs/last-diagnose.log + logs/last-deploy-summary.txt
 */
import { spawn } from 'node:child_process';
import { mkdirSync, createWriteStream } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripAnsi } from './log-utils.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const logsDir = join(root, 'logs');
mkdirSync(logsDir, { recursive: true });

const logPath = join(logsDir, 'last-diagnose.log');
const logStream = createWriteStream(logPath, { flags: 'w' });

console.log(`[diagnose:deploy] Лог:    ${logPath}`);
console.log(`[diagnose:deploy] Сводка: logs\\last-deploy-summary.txt`);

const child = spawn('node', ['scripts/deploy-diagnostics.mjs'], {
  cwd: root,
  shell: true,
});

const write = (chunk) => logStream.write(stripAnsi(chunk));

child.stdout.on('data', (chunk) => {
  process.stdout.write(chunk);
  write(chunk);
});
child.stderr.on('data', (chunk) => {
  process.stderr.write(chunk);
  write(chunk);
});

child.on('close', (code) => {
  logStream.end();
  process.exit(code ?? 1);
});
