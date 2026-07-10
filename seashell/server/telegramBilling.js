import crypto from 'crypto';
import {
  BILLING_PRODUCT_SUBSCRIPTION,
  BILLING_PRODUCT_TOPUP,
  SUBSCRIPTION_STARS,
  TOPUP_STARS,
  billingProductCatalog,
} from './billingPolicy.js';
import { applyStarPayment } from './billingDb.js';

function botToken() {
  return String(process.env.TELEGRAM_BOT_TOKEN ?? '').trim();
}

function payloadSecret() {
  return (
    String(process.env.BILLING_PAYLOAD_SECRET ?? '').trim() ||
    String(process.env.TELEGRAM_WEBHOOK_SECRET ?? '').trim() ||
    botToken()
  );
}

function webhookSecret() {
  return String(process.env.TELEGRAM_WEBHOOK_SECRET ?? '').trim();
}

function signPart(data) {
  return crypto.createHmac('sha256', payloadSecret()).update(data).digest('hex').slice(0, 16);
}

export function buildInvoicePayload(userId, product) {
  const uid = parseInt(String(userId), 10);
  if (!Number.isFinite(uid) || uid <= 0) throw new Error('Invalid user id');
  if (product !== BILLING_PRODUCT_SUBSCRIPTION && product !== BILLING_PRODUCT_TOPUP) {
    throw new Error('Invalid product');
  }
  const nonce = crypto.randomBytes(6).toString('hex');
  const base = `ss:${product}:${uid}:${nonce}`;
  const sig = signPart(base);
  return `${base}:${sig}`;
}

export function parseInvoicePayload(payload) {
  const raw = String(payload ?? '').trim();
  const parts = raw.split(':');
  if (parts.length !== 5 || parts[0] !== 'ss') return { ok: false, reason: 'format' };
  const product = parts[1];
  const userId = parseInt(parts[2], 10);
  const nonce = parts[3];
  const sig = parts[4];
  if (!Number.isFinite(userId) || userId <= 0) return { ok: false, reason: 'user' };
  if (product !== BILLING_PRODUCT_SUBSCRIPTION && product !== BILLING_PRODUCT_TOPUP) {
    return { ok: false, reason: 'product' };
  }
  const base = `ss:${product}:${userId}:${nonce}`;
  const expected = signPart(base);
  if (sig !== expected) return { ok: false, reason: 'sig' };
  return { ok: true, userId, product, nonce };
}

async function telegramApi(method, body) {
  const token = botToken();
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not set');
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    const desc = data?.description ?? res.statusText ?? 'Telegram API error';
    throw new Error(desc);
  }
  return data.result;
}

function invoiceCopy(product) {
  const catalog = billingProductCatalog();
  if (product === BILLING_PRODUCT_SUBSCRIPTION) {
    return {
      title: 'Seashell Premium',
      description: `${catalog.subscription.credits} credits for ${catalog.subscription.days} days. No ads.`,
      stars: catalog.subscription.stars,
    };
  }
  return {
    title: 'Seashell credits',
    description: `+${catalog.topUp.credits} credits for dictionary and practice.`,
    stars: catalog.topUp.stars,
  };
}

export async function createStarsInvoiceLink(userId, product) {
  const copy = invoiceCopy(product);
  const payload = buildInvoicePayload(userId, product);
  return telegramApi('createInvoiceLink', {
    title: copy.title,
    description: copy.description,
    payload,
    provider_token: '',
    currency: 'XTR',
    prices: [{ label: copy.title, amount: copy.stars }],
  });
}

export function verifyWebhookSecret(req) {
  const expected = webhookSecret();
  if (!expected) return true;
  const got = String(req.headers['x-telegram-bot-api-secret-token'] ?? '');
  return got === expected;
}

async function answerPreCheckout(queryId, ok, errorMessage) {
  await telegramApi('answerPreCheckoutQuery', {
    pre_checkout_query_id: queryId,
    ok,
    ...(ok ? {} : { error_message: String(errorMessage ?? 'Payment rejected').slice(0, 200) }),
  });
}

export async function handleTelegramBillingUpdate(update) {
  if (update?.pre_checkout_query) {
    const q = update.pre_checkout_query;
    const parsed = parseInvoicePayload(q.invoice_payload);
    if (!parsed.ok) {
      await answerPreCheckout(q.id, false, 'Invalid invoice');
      return { handled: true, kind: 'pre_checkout_rejected' };
    }
    const expectedStars =
      parsed.product === BILLING_PRODUCT_SUBSCRIPTION ? SUBSCRIPTION_STARS : TOPUP_STARS;
    const total = Number(q.total_amount ?? 0);
    if (total !== expectedStars || String(q.currency ?? '').toUpperCase() !== 'XTR') {
      await answerPreCheckout(q.id, false, 'Price mismatch');
      return { handled: true, kind: 'pre_checkout_rejected' };
    }
    await answerPreCheckout(q.id, true);
    return { handled: true, kind: 'pre_checkout_ok' };
  }

  const payment = update?.message?.successful_payment;
  if (payment) {
    const parsed = parseInvoicePayload(payment.invoice_payload);
    if (!parsed.ok) {
      console.error('[billing] successful_payment with bad payload', payment.invoice_payload);
      return { handled: true, kind: 'payment_bad_payload' };
    }
    const chargeId = String(payment.telegram_payment_charge_id ?? '').trim();
    if (!chargeId) {
      return { handled: true, kind: 'payment_no_charge_id' };
    }
    const result = await applyStarPayment({
      vkUserId: parsed.userId,
      chargeId,
      payload: payment.invoice_payload,
      productType: parsed.product,
      starsAmount: Number(payment.total_amount ?? 0),
    });
    console.log(
      `[billing] payment user=${parsed.userId} product=${parsed.product} applied=${result.applied}`,
    );
    return { handled: true, kind: 'payment_ok', applied: result.applied, userId: parsed.userId };
  }

  return { handled: false };
}
