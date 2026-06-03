#!/usr/bin/env node
/**
 * Обёртка vk-miniapps-deploy: сохраняет prod/stage URL и печатает чеклист.
 */
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DEPLOY_URLS_FILE,
  parseDeployOutput,
  printPlacementChecklist,
} from './placement-checklist.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function runVkDeploy() {
  return new Promise((resolve) => {
    const child = spawn('vk-miniapps-deploy', [], {
      cwd: root,
      shell: true,
      stdio: ['inherit', 'pipe', 'pipe'],
    });

    let output = '';
    child.stdout.on('data', (chunk) => {
      const s = String(chunk);
      output += s;
      process.stdout.write(s);
    });
    child.stderr.on('data', (chunk) => {
      const s = String(chunk);
      output += s;
      process.stderr.write(s);
    });
    child.on('close', (code) => resolve({ code: code ?? 1, output }));
  });
}

const envHint = process.env.MINI_APPS_ENVIRONMENT === 'production' ? 'production' : 'dev (default)';
console.log(`[vk-deploy] MINI_APPS_ENVIRONMENT=${envHint}\n`);

const { code, output } = await runVkDeploy();

if (code !== 0) {
  process.exit(code);
}

const urls = parseDeployOutput(output);
const record = {
  prod: urls.prod,
  stage: urls.stage,
  recordedAt: new Date().toISOString(),
};

writeFileSync(DEPLOY_URLS_FILE, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
printPlacementChecklist(record);

if (!urls.prod || !urls.stage) {
  console.warn(
    '⚠ В логе deploy не найдены prod/stage URL. Скопируйте их вручную из вывода выше.',
  );
  process.exit(1);
}
