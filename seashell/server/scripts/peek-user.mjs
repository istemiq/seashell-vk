#!/usr/bin/env node
import '../load-env.js';
import pg from 'pg';

const id = process.argv[2];
if (!id) {
  console.error('Usage: node scripts/peek-user.mjs USER_ID');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const { rows: words } = await pool.query(
  'SELECT word, created_at FROM words WHERE vk_user_id = $1 ORDER BY created_at DESC LIMIT 8',
  [id],
);
const { rows: sets } = await pool.query(
  'SELECT name, created_at FROM word_sets WHERE vk_user_id = $1 ORDER BY created_at',
  [id],
);
console.log('user', id, 'words:', words.length ? words : '(none)');
console.log('sets:', sets.length ? sets : '(none)');
await pool.end();
