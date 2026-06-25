#!/usr/bin/env node
/**
 * Прописать OpenRouter + DeepSeek в /root/seashell-server-new/.env на VPS.
 *
 *   $env:OPENROUTER_API_KEY = "sk-or-v1-..."
 *   node scripts/set-openrouter-vps.mjs
 */
import { spawnSync } from 'node:child_process';

const VPS = process.env.SEASHELL_VPS ?? 'root@155.212.141.148';
const ENV_FILE = process.env.SEASHELL_VPS_ENV ?? '/root/seashell-server-new/.env';
const key = String(process.env.OPENROUTER_API_KEY ?? '').trim();
const model = String(process.env.OPENROUTER_MODEL ?? 'deepseek/deepseek-chat').trim();

if (!key.startsWith('sk-or-')) {
  console.error('Задайте ключ OpenRouter в окружении:');
  console.error('  PowerShell: $env:OPENROUTER_API_KEY = "sk-or-v1-..."');
  console.error('  cmd:        set OPENROUTER_API_KEY=sk-or-v1-...');
  console.error('Затем: node scripts/set-openrouter-vps.mjs');
  process.exit(1);
}

const vars = {
  LLM_PROVIDER: 'openrouter',
  OPENROUTER_API_KEY: key,
  OPENROUTER_MODEL: model,
  OPENROUTER_APP_NAME: 'Seashell',
  OPENROUTER_HTTP_REFERER: 'https://api.sishel.ru',
};

const py = `
import re
from pathlib import Path
p = Path(${JSON.stringify(ENV_FILE)})
text = p.read_text(encoding='utf-8') if p.exists() else ''
vars = ${JSON.stringify(vars)}
for k, v in vars.items():
    line = f"{k}={v}"
    pat = re.compile(rf'^{re.escape(k)}=.*$', re.M)
    if pat.search(text):
        text = pat.sub(line, text)
    else:
        if text and not text.endswith('\\n'):
            text += '\\n'
        text += line + '\\n'
p.parent.mkdir(parents=True, exist_ok=True)
p.write_text(text, encoding='utf-8')
print('ok')
`;

const r = spawnSync('ssh', [VPS, `python3 -c ${JSON.stringify(py)}`], { encoding: 'utf8' });
if (r.status !== 0) {
  console.error(r.stderr || r.stdout);
  process.exit(r.status ?? 1);
}

const restart = spawnSync('ssh', [VPS, 'pm2 restart seashell-api'], { encoding: 'utf8', stdio: 'inherit' });
if (restart.status !== 0) process.exit(restart.status ?? 1);

const health = spawnSync('ssh', [VPS, 'curl -s http://127.0.0.1:3001/api/health'], { encoding: 'utf8' });
console.log(health.stdout.trim());
console.log('\n✓ OpenRouter +', model, 'на VPS. Проверка: https://api.sishel.ru/api/health');
