/**
 * vk_user_id и launch params VK Mini Apps.
 * Параметры из URL сохраняем в sessionStorage при старте — hash-router (#/dictionary)
 * не должен «терять» vk_sign для API.
 */
const LAUNCH_STORAGE_KEY = 'seashell_vk_launch_qs';

function queryStringFromLocation() {
  if (typeof window === 'undefined') return '';

  const search = String(window.location.search || '').trim();
  if (search.startsWith('?') && search.length > 1) {
    return search.slice(1);
  }

  const hash = String(window.location.hash || '');
  const qIdx = hash.indexOf('?');
  if (qIdx >= 0) {
    const fromHash = hash.slice(qIdx + 1);
    if (fromHash.includes('vk_user_id=') || fromHash.includes('vk_sign=')) {
      return fromHash;
    }
  }

  if (hash.includes('vk_user_id=')) {
    const h = hash.startsWith('#') ? hash.slice(1) : hash;
    if (!h.startsWith('/') && h.includes('=')) {
      return h;
    }
  }

  return '';
}

/** Вызвать один раз при старте (main.js), до любых запросов к API. */
export function captureVkLaunchParamsFromLocation() {
  if (typeof window === 'undefined') return;
  const qs = queryStringFromLocation();
  if (!qs || !qs.includes('vk_user_id=')) return;
  try {
    window.sessionStorage?.setItem(LAUNCH_STORAGE_KEY, qs);
  } catch {
    // private mode / quota
  }
}

/**
 * Строка launch params для заголовка X-VK-Launch-Params (без leading '?').
 */
export function getVkLaunchParamsFromLocation() {
  if (typeof window === 'undefined') return '';

  try {
    const stored = window.sessionStorage?.getItem(LAUNCH_STORAGE_KEY);
    if (stored && stored.includes('vk_user_id=')) {
      return stored;
    }
  } catch {
    // ignore
  }

  return queryStringFromLocation();
}

export function getVkUserIdFromLocation() {
  if (typeof window === 'undefined') return null;

  const fromLaunch = getVkLaunchParamsFromLocation();
  if (fromLaunch) {
    const id = new URLSearchParams(fromLaunch).get('vk_user_id');
    const n = id != null ? parseInt(String(id), 10) : NaN;
    if (Number.isFinite(n) && n > 0) return n;
  }

  const fromSearch = new URLSearchParams(window.location.search).get('vk_user_id');
  let id = fromSearch;

  if (id == null && window.location.hash) {
    const h = window.location.hash.startsWith('#')
      ? window.location.hash.slice(1)
      : window.location.hash;
    const qIdx = h.indexOf('?');
    const paramPart = qIdx >= 0 ? h.slice(qIdx + 1) : h.startsWith('/') ? '' : h;
    if (paramPart) {
      id = new URLSearchParams(paramPart).get('vk_user_id');
    }
  }

  const n = id != null ? parseInt(String(id), 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}
