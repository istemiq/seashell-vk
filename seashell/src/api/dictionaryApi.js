/**
 * HTTP-клиент для REST API словаря (`/api/words`, `/api/refresh-examples`…).
 * Все запросы с заголовком X-VK-User-Id (из URL или fallback после VKWebAppGetUserInfo).
 * База URL: в проде задаётся VITE_API_URL; в dev — относительный `/api` + прокси Vite.
 */
import { getVkUserIdFromLocation } from '../utils/vkUserId.js';

/**
 * Прод: VITE_API_URL=https://ИМЯ.beget.app или https://ИМЯ.beget.app/api
 * Дев: не задан — запросы на тот же origin, Vite проксирует /api → локальный бэкенд.
 */
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

/** Если в URL нет vk_user_id — подставляется из VKWebAppGetUserInfo (локальная разработка). */
let vkUserIdFallback = null;

export function setVkUserIdFallback(id) {
  const n = id != null ? parseInt(String(id), 10) : NaN;
  vkUserIdFallback = Number.isFinite(n) && n > 0 ? n : null;
}

function resolveVkUserId() {
  return getVkUserIdFromLocation() ?? vkUserIdFallback;
}

function headers() {
  const vkUserId = resolveVkUserId();
  if (vkUserId == null) {
    throw new Error('Не удалось определить vk_user_id (нет в URL и не задан fallback)');
  }
  return {
    'Content-Type': 'application/json',
    'X-VK-User-Id': String(vkUserId),
  };
}

const API_DOWN_HINT =
  'Бэкенд не отвечает (порт 3001). В папке seashell запусти: npm run dev — и не закрывай окно, пока тестируешь.';

async function request(path, init = {}) {
  let r;
  try {
    r = await fetch(apiUrl(path), {
      ...init,
      headers: { ...headers(), ...init.headers },
    });
  } catch (e) {
    if (e?.name === 'TypeError') {
      throw new Error(`${API_DOWN_HINT} (${e.message})`);
    }
    throw e;
  }
  return r;
}

const RESTART_API_HINT =
  'Перезапусти API: в терминале останови npm run dev (Ctrl+C) и снова запусти из папки seashell — иначе на порту 3001 может висеть старый процесс Node без новых маршрутов.';

/** 502 от Vite = прокси не достучался; 502 от Express = часто { error } от GigaChat. */
function messageFromStatusAndBody(status, text) {
  const raw = String(text ?? '');
  const trimmed = raw.trim();
  if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html')) {
    if (status === 404 && /Cannot POST/i.test(trimmed)) {
      return `Маршрут не найден (404). ${RESTART_API_HINT}`;
    }
    return `Ответ сервера не JSON (часто это значит, что запрос попал не в Express). ${RESTART_API_HINT}`;
  }
  try {
    const j = JSON.parse(raw);
    if (j?.error && typeof j.error === 'string') return j.error;
  } catch {
    // не JSON
  }
  if (status === 404 && /Cannot POST/i.test(trimmed)) {
    return `Маршрут не найден (404). ${RESTART_API_HINT}`;
  }
  if ((status === 502 || status === 503) && !trimmed) {
    return API_DOWN_HINT;
  }
  if ((status === 502 || status === 503) && trimmed) {
    return trimmed.length < 800 ? trimmed : API_DOWN_HINT;
  }
  return trimmed || `HTTP ${status}`;
}

async function readHttpError(r) {
  const t = await r.text();
  return messageFromStatusAndBody(r.status, t);
}

export async function fetchWords() {
  const r = await request('/words');
  if (!r.ok) throw new Error(await readHttpError(r));
  return r.json();
}

export async function fetchWordsInSet(setId) {
  const id = setId != null ? parseInt(String(setId), 10) : NaN;
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error('Invalid setId');
  }
  const r = await request(`/words?setId=${encodeURIComponent(String(id))}`);
  if (!r.ok) throw new Error(await readHttpError(r));
  return r.json();
}

export async function fetchWord(wordId) {
  const r = await request(`/words/${wordId}`);
  if (!r.ok) throw new Error(await readHttpError(r));
  return r.json();
}

export async function fetchSets() {
  const r = await request('/sets');
  if (!r.ok) throw new Error(await readHttpError(r));
  return r.json();
}

export async function createSet(name) {
  const n = String(name ?? '').trim().replace(/\s+/g, ' ');
  const r = await request('/sets', {
    method: 'POST',
    body: JSON.stringify({ name: n }),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(messageFromStatusAndBody(r.status, text));
  return JSON.parse(text);
}

export async function renameSet(setId, name) {
  const id = setId != null ? parseInt(String(setId), 10) : NaN;
  const n = String(name ?? '').trim().replace(/\s+/g, ' ');
  if (!Number.isFinite(id) || id <= 0) throw new Error('Invalid setId');
  const r = await request(`/sets/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ name: n }),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(messageFromStatusAndBody(r.status, text));
  return JSON.parse(text);
}

export async function deleteSet(setId) {
  const id = setId != null ? parseInt(String(setId), 10) : NaN;
  if (!Number.isFinite(id) || id <= 0) throw new Error('Invalid setId');
  const r = await request(`/sets/${id}`, { method: 'DELETE' });
  const text = await r.text();
  if (!r.ok) throw new Error(messageFromStatusAndBody(r.status, text));
  return JSON.parse(text);
}

export async function updateWordSets(wordId, setIds) {
  const id = wordId != null ? parseInt(String(wordId), 10) : NaN;
  if (!Number.isFinite(id) || id <= 0) throw new Error('Invalid wordId');
  const r = await request(`/words/${id}/sets`, {
    method: 'PUT',
    body: JSON.stringify({ setIds: Array.isArray(setIds) ? setIds : [] }),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(messageFromStatusAndBody(r.status, text));
  return JSON.parse(text);
}

export async function addWord(word) {
  const r = await request('/words', {
    method: 'POST',
    body: JSON.stringify({ word }),
  });
  const text = await r.text();
  if (!r.ok) {
    throw new Error(messageFromStatusAndBody(r.status, text));
  }
  return JSON.parse(text);
}

export async function removeWord(wordId) {
  const r = await request(`/words/${wordId}`, { method: 'DELETE' });
  if (!r.ok && r.status !== 204) {
    throw new Error(await readHttpError(r));
  }
}

/** Заново запросить у GigaChat 15 примеров с переводами и заменить сохранённые. */
export async function refreshWordExamples(wordId) {
  const r = await request('/refresh-examples', {
    method: 'POST',
    body: JSON.stringify({ wordId }),
  });
  const text = await r.text();
  if (!r.ok) {
    throw new Error(messageFromStatusAndBody(r.status, text));
  }
  return JSON.parse(text);
}

export async function fetchTtsWav(text) {
  const t = String(text ?? '').trim();
  if (!t) throw new Error('Empty text');
  if (t.length > 400) throw new Error('Слишком длинно для озвучки (лимит 400 символов).');
  const vkUserId = resolveVkUserId();
  if (vkUserId == null) {
    throw new Error('Не удалось определить vk_user_id (нет в URL и не задан fallback)');
  }
  let r;
  try {
    r = await fetch(apiUrl(`/tts?text=${encodeURIComponent(t)}`), {
      headers: {
        'X-VK-User-Id': String(vkUserId),
      },
    });
  } catch (e) {
    if (e?.name === 'TypeError') {
      throw new Error(`${API_DOWN_HINT} (${e.message})`);
    }
    throw e;
  }
  if (!r.ok) {
    throw new Error(await readHttpError(r));
  }
  return r.blob();
}

export { resolveVkUserId };
