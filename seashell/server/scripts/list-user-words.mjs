#!/usr/bin/env node
import '../load-env.js';
import pg from 'pg';

const id = process.argv[2];
if (!id) {
  console.error('Usage: node scripts/list-user-words.mjs USER_ID');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const { rows } = await pool.query(
  'SELECT word FROM words WHERE vk_user_id = $1 ORDER BY LOWER(word)',
  [id],
);
console.log(`Всего: ${rows.length}`);
rows.forEach((r, i) => console.log(`${i + 1}. ${r.word}`));
await pool.end();
