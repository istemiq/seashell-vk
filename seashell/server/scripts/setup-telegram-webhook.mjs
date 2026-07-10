#!/usr/bin/env node
/**
 * Register Telegram bot webhook for Stars payments.
 * Usage:
 *   TELEGRAM_BOT_TOKEN=... TELEGRAM_WEBHOOK_SECRET=... node scripts/setup-telegram-webhook.mjs
 *   TELEGRAM_WEBHOOK_URL=https://api.sishel.ru/api/telegram/webhook
 */
const token = String(process.env.TELEGRAM_BOT_TOKEN ?? '').trim();
const url = String(process.env.TELEGRAM_WEBHOOK_URL ?? 'https://api.sishel.ru/api/telegram/webhook').trim();
const secret = String(process.env.TELEGRAM_WEBHOOK_SECRET ?? '').trim();

if (!token) {
  console.error('TELEGRAM_BOT_TOKEN is required');
  process.exit(1);
}

const body = {
  url,
  allowed_updates: ['message', 'pre_checkout_query'],
  ...(secret ? { secret_token: secret } : {}),
};

const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
const data = await res.json();
console.log(JSON.stringify(data, null, 2));
process.exit(data.ok ? 0 : 1);
