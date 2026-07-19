/**
 * Загрузка переменных окружения до остального `server/index.js`.
 * Читает `seashell/.env` и `server/.env` (серверный файл перекрывает корень).
 * См. также DEPENDENCIES.md в каталоге seashell.
 */
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
  let lastNonEmpty;
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    if (k !== key) continue;
    const val = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (val !== '') lastNonEmpty = val;
  }
  return lastNonEmpty;
}

function ensureEnvKey(key) {
  if (process.env[key]?.trim()) return;
  const v = slurpEnvKey(envInServer, key) ?? slurpEnvKey(envInSeashellRoot, key);
  if (v != null && v !== '') {
    process.env[key] = v;
    console.log(`[load-env] ${key} подставлен из файла (fallback: пустая строка в .env не затирает значение)`);
  }
}

ensureEnvKey('TELEGRAM_BOT_TOKEN');

const nodeEnv = process.env.NODE_ENV ?? '(не задан)';
console.log(
  `[load-env] server/.env ${fs.existsSync(envInServer) ? 'ok' : 'нет'} | seashell/.env ${fs.existsSync(envInSeashellRoot) ? 'ok' : 'нет'} | NODE_ENV=${nodeEnv}`
);
