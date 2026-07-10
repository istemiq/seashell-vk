/**
 * PostgreSQL: subscriptions, credits balance, Stars payments.
 */
import { getDbPool } from './db.js';
import {
  BILLING_PRODUCT_SUBSCRIPTION,
  BILLING_PRODUCT_TOPUP,
  SUBSCRIPTION_CREDITS,
  SUBSCRIPTION_DAYS,
  TOPUP_CREDITS,
} from './billingPolicy.js';

function pool() {
  return getDbPool();
}

export async function initBillingDb() {
  await pool().query(`CREATE TABLE IF NOT EXISTS user_entitlements (
    vk_user_id BIGINT PRIMARY KEY,
    subscription_until BIGINT NOT NULL DEFAULT 0,
    credits_balance INT NOT NULL DEFAULT 0,
    updated_at BIGINT NOT NULL DEFAULT 0
  )`);

  await pool().query(`CREATE TABLE IF NOT EXISTS star_payments (
    id BIGSERIAL PRIMARY KEY,
    vk_user_id BIGINT NOT NULL,
    telegram_payment_charge_id TEXT NOT NULL,
    invoice_payload TEXT NOT NULL,
    product_type TEXT NOT NULL,
    stars_amount INT NOT NULL,
    credits_granted INT NOT NULL DEFAULT 0,
    created_at BIGINT NOT NULL
  )`);
  await pool().query(
    `CREATE UNIQUE INDEX IF NOT EXISTS star_payments_charge_id
     ON star_payments (telegram_payment_charge_id)`,
  );
  await pool().query(
    `CREATE INDEX IF NOT EXISTS star_payments_user_time ON star_payments (vk_user_id, created_at)`,
  );
}

export async function getEntitlementsRow(vkUserId) {
  const r = await pool().query(
    `SELECT vk_user_id, subscription_until, credits_balance, updated_at
     FROM user_entitlements WHERE vk_user_id = $1`,
    [vkUserId],
  );
  return r.rows[0] ?? null;
}

export async function ensureEntitlementsRow(vkUserId) {
  const now = Date.now();
  await pool().query(
    `INSERT INTO user_entitlements (vk_user_id, subscription_until, credits_balance, updated_at)
     VALUES ($1, 0, 0, $2)
     ON CONFLICT (vk_user_id) DO NOTHING`,
    [vkUserId, now],
  );
}

/**
 * @returns {{ subscriptionUntil: number, creditsBalance: number, updatedAt: number }}
 */
export async function getEntitlements(vkUserId) {
  await ensureEntitlementsRow(vkUserId);
  const row = await getEntitlementsRow(vkUserId);
  return {
    subscriptionUntil: Number(row?.subscription_until ?? 0),
    creditsBalance: Number(row?.credits_balance ?? 0),
    updatedAt: Number(row?.updated_at ?? 0),
  };
}

export async function consumeCredits(vkUserId, amount, { subscriptionRequired = true } = {}) {
  const cost = Math.max(0, Math.floor(Number(amount)));
  if (cost === 0) return getEntitlements(vkUserId);

  const client = await pool().connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO user_entitlements (vk_user_id, subscription_until, credits_balance, updated_at)
       VALUES ($1, 0, 0, $2)
       ON CONFLICT (vk_user_id) DO NOTHING`,
      [vkUserId, Date.now()],
    );

    const r = await client.query(
      `SELECT subscription_until, credits_balance FROM user_entitlements
       WHERE vk_user_id = $1 FOR UPDATE`,
      [vkUserId],
    );
    const row = r.rows[0];
    const until = Number(row?.subscription_until ?? 0);
    const balance = Number(row?.credits_balance ?? 0);
    const now = Date.now();

    if (subscriptionRequired && until <= now) {
      await client.query('ROLLBACK');
      const err = new Error('Subscription inactive');
      err.code = 'SUBSCRIPTION_INACTIVE';
      throw err;
    }
    if (balance < cost) {
      await client.query('ROLLBACK');
      const err = new Error('Insufficient credits');
      err.code = 'CREDITS_EXHAUSTED';
      throw err;
    }

    const nextBalance = balance - cost;
    await client.query(
      `UPDATE user_entitlements SET credits_balance = $2, updated_at = $3 WHERE vk_user_id = $1`,
      [vkUserId, nextBalance, now],
    );
    await client.query('COMMIT');
    return { subscriptionUntil: until, creditsBalance: nextBalance, updatedAt: now };
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    throw e;
  } finally {
    client.release();
  }
}

export async function findPaymentByChargeId(chargeId) {
  const r = await pool().query(
    `SELECT id FROM star_payments WHERE telegram_payment_charge_id = $1 LIMIT 1`,
    [String(chargeId)],
  );
  return r.rows[0] ?? null;
}

/**
 * Apply Stars payment idempotently.
 * @returns {{ applied: boolean, entitlements: Awaited<ReturnType<typeof getEntitlements>> }}
 */
export async function applyStarPayment({
  vkUserId,
  chargeId,
  payload,
  productType,
  starsAmount,
}) {
  const existing = await findPaymentByChargeId(chargeId);
  if (existing) {
    return { applied: false, entitlements: await getEntitlements(vkUserId) };
  }

  const now = Date.now();
  const dayMs = 86_400_000;
  let creditsGranted = 0;
  let extendDays = 0;

  if (productType === BILLING_PRODUCT_SUBSCRIPTION) {
    creditsGranted = SUBSCRIPTION_CREDITS;
    extendDays = SUBSCRIPTION_DAYS;
  } else if (productType === BILLING_PRODUCT_TOPUP) {
    creditsGranted = TOPUP_CREDITS;
  } else {
    const err = new Error('Unknown product');
    err.code = 'UNKNOWN_PRODUCT';
    throw err;
  }

  const client = await pool().connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO user_entitlements (vk_user_id, subscription_until, credits_balance, updated_at)
       VALUES ($1, 0, 0, $2)
       ON CONFLICT (vk_user_id) DO NOTHING`,
      [vkUserId, now],
    );

    const r = await client.query(
      `SELECT subscription_until, credits_balance FROM user_entitlements
       WHERE vk_user_id = $1 FOR UPDATE`,
      [vkUserId],
    );
    const row = r.rows[0];
    const prevUntil = Number(row?.subscription_until ?? 0);
    const prevCredits = Number(row?.credits_balance ?? 0);

    const baseUntil = Math.max(prevUntil, now);
    const nextUntil =
      productType === BILLING_PRODUCT_SUBSCRIPTION
        ? baseUntil + extendDays * dayMs
        : prevUntil;
    const nextCredits =
      productType === BILLING_PRODUCT_SUBSCRIPTION ? creditsGranted : prevCredits + creditsGranted;

    await client.query(
      `UPDATE user_entitlements
       SET subscription_until = $2, credits_balance = $3, updated_at = $4
       WHERE vk_user_id = $1`,
      [vkUserId, nextUntil, nextCredits, now],
    );

    await client.query(
      `INSERT INTO star_payments
         (vk_user_id, telegram_payment_charge_id, invoice_payload, product_type, stars_amount, credits_granted, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [vkUserId, String(chargeId), String(payload), productType, starsAmount, creditsGranted, now],
    );

    await client.query('COMMIT');
    return {
      applied: true,
      entitlements: {
        subscriptionUntil: nextUntil,
        creditsBalance: nextCredits,
        updatedAt: now,
      },
    };
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    throw e;
  } finally {
    client.release();
  }
}
