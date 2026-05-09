import crypto from 'crypto';

function base64UrlEncode(buf) {
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

/**
 * Проверка подписи launch params VK Mini Apps.
 * Ожидает query string без leading '?', например: "vk_user_id=...&vk_app_id=...&vk_sign=..."
 *
 * Алгоритм: взять параметры, начинающиеся с "vk_", исключить "vk_sign",
 * отсортировать по ключу, склеить "k=v" через "&", посчитать HMAC-SHA256 с app secret,
 * сравнить с vk_sign (base64url).
 */
export function verifyVkLaunchParams(launchParams, appSecret) {
  const qs = String(launchParams ?? '').trim().replace(/^\?/, '');
  const secret = String(appSecret ?? '').trim();
  if (!qs || !secret) return { ok: false, reason: 'missing' };

  const params = new URLSearchParams(qs);
  const sign = params.get('vk_sign');
  if (!sign) return { ok: false, reason: 'no_vk_sign' };

  const pairs = [];
  for (const [k, v] of params.entries()) {
    if (!k.startsWith('vk_')) continue;
    if (k === 'vk_sign') continue;
    pairs.push([k, v]);
  }
  pairs.sort((a, b) => a[0].localeCompare(b[0]));

  const baseString = pairs.map(([k, v]) => `${k}=${v}`).join('&');
  const digest = crypto.createHmac('sha256', secret).update(baseString).digest();
  const expected = base64UrlEncode(digest);

  if (expected !== sign) return { ok: false, reason: 'bad_sign' };
  return { ok: true, vkUserId: params.get('vk_user_id') ?? null };
}

