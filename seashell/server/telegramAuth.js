import crypto from 'crypto';
import { timingSafeEqualString } from './securityHelpers.js';

/** Максимальный возраст initData (сек). 0 = не проверять. По умолчанию 1 час. */
function resolveMaxAuthAgeSec() {
  const raw = String(process.env.TELEGRAM_INIT_DATA_MAX_AGE_SEC ?? '').trim();
  if (raw === '0') return 0;
  const n = parseInt(raw, 10);
  if (Number.isFinite(n) && n > 0) return n;
  return 3600;
}

/**
 * Проверка подписи Telegram Mini App initData.
 * @see https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
export function verifyTelegramInitData(initData, botToken, { maxAgeSec = resolveMaxAuthAgeSec() } = {}) {
  const raw = String(initData ?? '').trim();
  const token = String(botToken ?? '').trim();
  if (!raw || !token) return { ok: false, reason: 'missing' };

  const params = new URLSearchParams(raw);
  const hash = params.get('hash');
  if (!hash) return { ok: false, reason: 'no_hash' };

  const pairs = [];
  for (const [k, v] of params.entries()) {
    if (k === 'hash') continue;
    pairs.push([k, v]);
  }
  pairs.sort((a, b) => a[0].localeCompare(b[0]));
  const dataCheckString = pairs.map(([k, v]) => `${k}=${v}`).join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
  const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  if (!timingSafeEqualString(calculatedHash, hash)) return { ok: false, reason: 'bad_hash' };

  const authDate = parseInt(params.get('auth_date') ?? '', 10);
  if (Number.isFinite(authDate) && maxAgeSec > 0) {
    const now = Math.floor(Date.now() / 1000);
    if (now - authDate > maxAgeSec) return { ok: false, reason: 'expired' };
  }

  let userId = NaN;
  const userRaw = params.get('user');
  if (userRaw) {
    try {
      const user = JSON.parse(userRaw);
      userId = user?.id != null ? parseInt(String(user.id), 10) : NaN;
    } catch {
      return { ok: false, reason: 'bad_user' };
    }
  }
  if (!Number.isFinite(userId) || userId <= 0) return { ok: false, reason: 'no_user_id' };

  return { ok: true, userId, authDate: Number.isFinite(authDate) ? authDate : null };
}
