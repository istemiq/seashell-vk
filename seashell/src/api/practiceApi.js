/**
 * Один ход разговорной практики: POST /api/practice/turn.
 * Использует тот же `resolveVkUserId`, что и словарь (общий fallback пользователя).
 */
import { resolveVkUserId } from './dictionaryApi.js';

const RAW_BASE = (import.meta.env.VITE_API_URL || '').trim();

function apiRoot() {
  if (!RAW_BASE) return '';
  const b = RAW_BASE.replace(/\/$/, '');
  return b.endsWith('/api') ? b : `${b}/api`;
}

function apiUrl(path) {
  const rel = path.startsWith('/') ? path : `/${path}`;
  const root = apiRoot();
  if (!root) return `/api${rel}`;
  return `${root}${rel}`;
}

function headers() {
  const vkUserId = resolveVkUserId();
  if (vkUserId == null) {
    throw new Error('Не удалось определить пользователя');
  }
  return {
    'Content-Type': 'application/json',
    'X-VK-User-Id': String(vkUserId),
  };
}

function messageFromStatusAndBody(status, text) {
  try {
    const j = JSON.parse(text);
    if (j?.error && typeof j.error === 'string') return j.error;
  } catch {
    // не JSON
  }
  return text || `HTTP ${status}`;
}

/**
 * Один шаг диалога: эхо, правки, ответ собеседника.
 * @param {{ userText: string, history: Array<{ role: string, text: string }> }} body
 */
export async function postPracticeTurn(body) {
  const r = await fetch(apiUrl('/practice/turn'), {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
  });
  const text = await r.text();
  if (!r.ok) {
    throw new Error(messageFromStatusAndBody(r.status, text));
  }
  return JSON.parse(text);
}
