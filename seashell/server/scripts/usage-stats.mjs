#!/usr/bin/env node
/**
 * Usage report from PostgreSQL (run on VPS or locally with DATABASE_URL).
 *
 *   node server/scripts/usage-stats.mjs
 *   node server/scripts/usage-stats.mjs --json
 *
 * Remote via API (after ADMIN_STATS_TOKEN on server):
 *   curl -s -H "Authorization: Bearer TOKEN" https://api.sishel.ru/api/admin/stats
 */
import '../load-env.js';
import pg from 'pg';
import { fetchUsageStats, formatUsageStatsText } from '../usageStats.js';

const asJson = process.argv.includes('--json');

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  const stats = await fetchUsageStats(pool);
  if (asJson) {
    console.log(JSON.stringify(stats, null, 2));
  } else {
    console.log(formatUsageStatsText(stats));
  }
} finally {
  await pool.end();
}
