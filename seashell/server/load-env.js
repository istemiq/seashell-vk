import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envInServer = path.join(__dirname, '.env');
const envInSeashellRoot = path.join(__dirname, '..', '.env');

// Часть переменных держат в seashell/.env, часть в server/.env — читаем оба; server перекрывает корень.
for (const p of [envInSeashellRoot, envInServer]) {
  if (fs.existsSync(p)) {
    dotenv.config({ path: p, override: true });
  }
}

/** Страховка: иногда dotenv на Windows не кладёт отдельные ключи (кодировка/BOM) — добираем вручную. */
function slurpEnvKey(filePath, key) {
  if (!fs.existsSync(filePath)) return undefined;
  let text;
  try {
    text = fs.readFileSync(filePath, 'utf8');
  } catch {
    try {
      text = fs.readFileSync(filePath, 'utf16le');
    } catch {
      return undefined;
    }
  }
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    if (k !== key) continue;
    return t.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
  }
  return undefined;
}

if (!process.env.GIGACHAT_TLS_INSECURE?.trim()) {
  const v =
    slurpEnvKey(envInServer, 'GIGACHAT_TLS_INSECURE') ?? slurpEnvKey(envInSeashellRoot, 'GIGACHAT_TLS_INSECURE');
  if (v != null && v !== '') {
    process.env.GIGACHAT_TLS_INSECURE = v;
    console.log('[load-env] GIGACHAT_TLS_INSECURE подставлен из файла (fallback, не через dotenv)');
  }
}

const tls = process.env.GIGACHAT_TLS_INSECURE?.trim();
const nodeEnv = process.env.NODE_ENV ?? '(не задан)';
console.log(
  `[load-env] server/.env ${fs.existsSync(envInServer) ? 'ok' : 'нет'} | seashell/.env ${fs.existsSync(envInSeashellRoot) ? 'ok' : 'нет'} | GIGACHAT_TLS_INSECURE=${tls ?? '(unset)'} | NODE_ENV=${nodeEnv}`
);

if (tls === '1' || tls?.toLowerCase() === 'true') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}
