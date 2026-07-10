import {
  CREDIT_PRACTICE,
  CREDIT_REFRESH,
  CREDIT_WORD,
  CREDITS_EXHAUSTED_ERROR,
  SUBSCRIPTION_CREDITS,
  billingProductCatalog,
} from './billingPolicy.js';
import { consumeCredits, getEntitlements } from './billingDb.js';
import { isPremiumUser } from './premium.js';
import { QUOTA_LIMIT_ERROR } from './limitsPolicy.js';

export { isPremiumUser };

export function isUnlimitedBypass(userId) {
  return isPremiumUser(userId);
}

export async function hasActiveSubscription(userId) {
  if (isUnlimitedBypass(userId)) return true;
  const ent = await getEntitlements(userId);
  return ent.subscriptionUntil > Date.now();
}

/** Premium UI: no ads, subscription features. */
export async function isPremiumForUi(userId) {
  return hasActiveSubscription(userId);
}

export async function buildUserPlanResponse(userId) {
  const bypass = isUnlimitedBypass(userId);
  const ent = await getEntitlements(userId);
  const now = Date.now();
  const subscriptionActive = bypass || ent.subscriptionUntil > now;
  const catalog = billingProductCatalog();

  return {
    premium: subscriptionActive,
    admin: false,
    bypass,
    subscription: {
      active: subscriptionActive,
      until: bypass ? null : ent.subscriptionUntil > 0 ? ent.subscriptionUntil : null,
      credits: bypass ? null : ent.creditsBalance,
      creditsMonthly: SUBSCRIPTION_CREDITS,
    },
    billing: {
      enabled: Boolean(String(process.env.TELEGRAM_BOT_TOKEN ?? '').trim()),
      subscriptionStars: catalog.subscription.stars,
      topUpStars: catalog.topUp.stars,
      topUpCredits: catalog.topUp.credits,
    },
  };
}

/**
 * @returns {'bypass'|'credits'|'free'|null} null = denied (response already sent)
 */
export async function assertWordsAccess(req, res, { used, limit }) {
  if (isUnlimitedBypass(req.vkUserId)) return 'bypass';

  const ent = await getEntitlements(req.vkUserId);
  if (ent.subscriptionUntil > Date.now()) {
    if (ent.creditsBalance < CREDIT_WORD) {
      res.status(403).json({ error: CREDITS_EXHAUSTED_ERROR, code: 'CREDITS_EXHAUSTED' });
      return null;
    }
    return 'credits';
  }

  if (used >= limit) {
    res.status(403).json({ error: QUOTA_LIMIT_ERROR, code: 'QUOTA_LIMIT' });
    return null;
  }
  return 'free';
}

export async function assertPracticeAccess(req, res, { used, limit }) {
  if (isUnlimitedBypass(req.vkUserId)) return 'bypass';

  const ent = await getEntitlements(req.vkUserId);
  if (ent.subscriptionUntil > Date.now()) {
    if (ent.creditsBalance < CREDIT_PRACTICE) {
      res.status(403).json({ error: CREDITS_EXHAUSTED_ERROR, code: 'CREDITS_EXHAUSTED' });
      return null;
    }
    return 'credits';
  }

  if (used >= limit) {
    res.status(403).json({ error: QUOTA_LIMIT_ERROR, code: 'QUOTA_LIMIT' });
    return null;
  }
  return 'free';
}

export async function assertRefreshAccess(req, res) {
  if (isUnlimitedBypass(req.vkUserId)) return 'bypass';

  const ent = await getEntitlements(req.vkUserId);
  if (ent.subscriptionUntil <= Date.now()) {
    res.status(403).json({ error: 'Refresh examples is available for premium users only' });
    return null;
  }
  if (ent.creditsBalance < CREDIT_REFRESH) {
    res.status(403).json({ error: CREDITS_EXHAUSTED_ERROR, code: 'CREDITS_EXHAUSTED' });
    return null;
  }
  return 'credits';
}

export async function chargeWordCredit(userId) {
  return consumeCredits(userId, CREDIT_WORD);
}

export async function chargePracticeCredit(userId) {
  return consumeCredits(userId, CREDIT_PRACTICE);
}

export async function chargeRefreshCredit(userId) {
  return consumeCredits(userId, CREDIT_REFRESH);
}
