/**
 * vk_user_id из строки запроса (как в VK Mini Apps launch params).
 * При необходимости смотрим и fragment (#vk_user_id=...) — часть сценариев VK.
 */
export function getVkUserIdFromLocation() {
  if (typeof window === 'undefined') return null;

  const fromSearch = new URLSearchParams(window.location.search).get('vk_user_id');
  let id = fromSearch;

  if (id == null && window.location.hash) {
    const h = window.location.hash.startsWith('#')
      ? window.location.hash.slice(1)
      : window.location.hash;
    id = new URLSearchParams(h).get('vk_user_id');
  }

  const n = id != null ? parseInt(String(id), 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Возвращает launch params VK (querystring без '?').
 * Нужны бэкенду для проверки подписи (vk_sign) и извлечения vk_user_id без доверия к заголовкам.
 */
export function getVkLaunchParamsFromLocation() {
  if (typeof window === 'undefined') return '';
  const s = String(window.location.search || '').trim();
  return s.startsWith('?') ? s.slice(1) : s;
}
