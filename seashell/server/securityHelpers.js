import crypto from 'crypto';

export function timingSafeEqualString(a, b) {
  const left = crypto.createHash('sha256').update(String(a ?? '')).digest();
  const right = crypto.createHash('sha256').update(String(b ?? '')).digest();
  return crypto.timingSafeEqual(left, right);
}

export function clientIp(req) {
  const fwd = String(req.headers['x-forwarded-for'] ?? '')
    .split(',')[0]
    .trim();
  return fwd || req.socket?.remoteAddress || 'unknown';
}

/** Generic client message in production; details only in logs. */
export function generationErrorMessage(e, fallback = 'Generation failed') {
  const isProd = String(process.env.NODE_ENV ?? '').toLowerCase() === 'production';
  if (isProd) return fallback;
  return e?.message || fallback;
}
