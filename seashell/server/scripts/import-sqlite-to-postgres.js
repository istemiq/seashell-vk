/**
 * Восстановление словаря из старой SQLite (words.db) в PostgreSQL.
 *
 * Раньше прод хранил слова в server/data/words.db; после перехода на Postgres
 * данные не мигрировали автоматически — этот скрипт переносит их.
 *
 * На VPS:
 *   node scripts/import-sqlite-to-postgres.js
 *   node scripts/import-sqlite-to-postgres.js /path/to/words.db
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { DatabaseSync } from 'node:sqlite';
import '../load-env.js';
import { initDb, findWordByLemma } from '../db.js';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.join(__dirname, '..');

const DEFAULT_CANDIDATES = [
  path.join(serverRoot, 'data', 'words.db'),
  '/root/seashell-server-new/data/words.db',
  '/root/seashell/server/data/words.db',
  '/data/words.db',
];

function resolveSqlitePath() {
  const arg = process.argv[2]?.trim();
  if (arg) {
    if (!fs.existsSync(arg)) {
      console.error(`Файл не найден: ${arg}`);
      process.exit(1);
    }
    return arg;
  }
  for (const p of DEFAULT_CANDIDATES) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  console.error('words.db не найден. Укажите путь:');
  console.error('  node scripts/import-sqlite-to-postgres.js /path/to/words.db');
  process.exit(1);
}

function sqliteColumnNames(db, table) {
  return db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
}

async function main() {
  const sqlitePath = resolveSqlitePath();
  const stat = fs.statSync(sqlitePath);
  console.log(`SQLite: ${sqlitePath} (${stat.size} bytes)`);

  const sqlite = new DatabaseSync(sqlitePath);
  const wordCols = sqliteColumnNames(sqlite, 'words');
  const exCols = sqliteColumnNames(sqlite, 'examples');

  const words = sqlite.prepare('SELECT * FROM words ORDER BY id').all();
  console.log(`Слов в SQLite: ${words.length}`);

  if (words.length === 0) {
    console.log('Нечего импортировать.');
    process.exit(0);
  }

  const byUser = new Map();
  for (const w of words) {
    const uid = Number(w.vk_user_id);
    byUser.set(uid, (byUser.get(uid) ?? 0) + 1);
  }
  console.log('По vk_user_id:', Object.fromEntries(byUser));

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  await initDb();

  const { rows: before } = await pool.query('SELECT COUNT(*)::int AS n FROM words');
  console.log(`Слов в PostgreSQL до импорта: ${before[0].n}`);

  let imported = 0;
  let skipped = 0;

  for (const w of words) {
    const vkUserId = Number(w.vk_user_id);
    const lemma = String(w.word ?? '').trim();
    if (!lemma || !Number.isFinite(vkUserId) || vkUserId <= 0) {
      skipped += 1;
      continue;
    }

    if (await findWordByLemma(vkUserId, lemma)) {
      skipped += 1;
      continue;
    }

    const glossRu = wordCols.includes('gloss_ru') ? w.gloss_ru ?? null : null;
    const glossNoteRu = wordCols.includes('gloss_note_ru') ? w.gloss_note_ru ?? null : null;
    const verbUsage = wordCols.includes('verb_usage') ? w.verb_usage ?? null : null;
    const createdAt = Number(w.created_at) || Date.now();

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const ins = await client.query(
        `INSERT INTO words (vk_user_id, word, created_at, gloss_ru, gloss_note_ru, verb_usage)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [vkUserId, lemma, createdAt, glossRu, glossNoteRu, verbUsage],
      );
      const wordId = Number(ins.rows[0].id);

      const examples = sqlite
        .prepare('SELECT * FROM examples WHERE word_id = ? ORDER BY idx')
        .all(w.id);

      for (const ex of examples) {
        const text = String(ex.text ?? '').trim();
        if (!text) continue;
        const translation = exCols.includes('translation') ? ex.translation ?? null : null;
        const noteRu = exCols.includes('note_ru') ? ex.note_ru ?? null : null;
        await client.query(
          'INSERT INTO examples (word_id, idx, text, translation, note_ru) VALUES ($1, $2, $3, $4, $5)',
          [wordId, Number(ex.idx) || 0, text, translation, noteRu],
        );
      }

      await client.query('COMMIT');
      imported += 1;
      console.log(`  + ${lemma} (user ${vkUserId}, examples ${examples.length})`);
    } catch (e) {
      await client.query('ROLLBACK');
      console.error(`  ! skip "${lemma}": ${e.message}`);
      skipped += 1;
    } finally {
      client.release();
    }
  }

  const { rows: after } = await pool.query('SELECT COUNT(*)::int AS n FROM words');
  console.log('');
  console.log(`Импортировано: ${imported}, пропущено: ${skipped}`);
  console.log(`Слов в PostgreSQL после: ${after[0].n}`);

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
