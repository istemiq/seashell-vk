/** Telegram Stars billing and internal credits (not LLM tokens). */

function intEnv(name, fallback) {
  const n = parseInt(String(process.env[name] ?? '').trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Standard subscription (~250 ₽ in RU ≈ 145 ⭐ at ~1.72 ₽/⭐). */
export const SUBSCRIPTION_STARS = intEnv('STARS_SUBSCRIPTION_AMOUNT', 145);
export const SUBSCRIPTION_DAYS = intEnv('STARS_SUBSCRIPTION_DAYS', 30);
export const SUBSCRIPTION_CREDITS = intEnv('SUBSCRIPTION_CREDITS', 120);

/** Optional top-up when monthly credits are spent. */
export const TOPUP_STARS = intEnv('STARS_TOPUP_AMOUNT', 69);
export const TOPUP_CREDITS = intEnv('TOPUP_CREDITS', 60);

/** Credit cost per action (≈0.05 ₽ LLM each). */
export const CREDIT_WORD = 3;
export const CREDIT_PRACTICE = 1;
export const CREDIT_REFRESH = 2;

export const CREDITS_EXHAUSTED_ERROR =
  'Not enough credits. Buy a top-up pack or renew your subscription.';

export const BILLING_PRODUCT_SUBSCRIPTION = 'sub_month';
export const BILLING_PRODUCT_TOPUP = 'topup_credits';

export function billingProductCatalog() {
  return {
    subscription: {
      product: BILLING_PRODUCT_SUBSCRIPTION,
      stars: SUBSCRIPTION_STARS,
      credits: SUBSCRIPTION_CREDITS,
      days: SUBSCRIPTION_DAYS,
    },
    topUp: {
      product: BILLING_PRODUCT_TOPUP,
      stars: TOPUP_STARS,
      credits: TOPUP_CREDITS,
    },
  };
}
