#!/usr/bin/env node
/**
 * Daily usage report → Telegram (cron on VPS).
 *
 *   node server/scripts/usage-stats-daily.mjs
 *   node server/scripts/usage-stats-daily.mjs --dry-run
 *
 * Env:
 *   TELEGRAM_BOT_TOKEN — bot from @BotFather (same as mini app)
 *   TELEGRAM_STATS_CHAT_IDS — your Telegram user id (private chat_id = user id)
 *   Each recipient must /start the bot once.
 */
import '../load-env.js';
import pg from 'pg';
import { fetchUsageStats, formatUsageStatsTelegram } from '../usageStats.js';
import { sendStatsToAdmins } from '../telegramNotify.js';

const dryRun = process.argv.includes('--dry-run');

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  const stats = await fetchUsageStats(pool);
  const text = formatUsageStatsTelegram(stats);
  const result = await sendStatsToAdmins(text, { dryRun });
  if (!dryRun) {
    console.log(`Done: sent to ${result.sent} chat(s)`);
  }
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
} finally {
  await pool.end();
}
