/**
 * Premium access: PREMIUM_USER_IDS env (unlimited bypass) or paid subscription in DB.
 * Same numeric id as X-VK-User-Id / Telegram platform user id.
 */
function parsePremiumIdSet() {
  const raw = String(process.env.PREMIUM_USER_IDS ?? '').trim();
  if (!raw) return new Set();
  return new Set(
    raw
      .split(/[,;\s]+/)
      .map((s) => parseInt(s, 10))
      .filter((n) => Number.isFinite(n) && n > 0),
  );
}

let cachedIds = null;

function premiumIdSet() {
  if (!cachedIds) cachedIds = parsePremiumIdSet();
  return cachedIds;
}

export function isPremiumUser(userId) {
  const id = parseInt(String(userId ?? ''), 10);
  if (!Number.isFinite(id) || id <= 0) return false;
  return premiumIdSet().has(id);
}

/** For tests: reset env cache after changing PREMIUM_USER_IDS. */
export function resetPremiumCacheForTests() {
  cachedIds = null;
}
