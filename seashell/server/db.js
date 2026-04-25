/**
 * Слой доступа к PostgreSQL: слова пользователя и примеры с переводами.
 * Подключение: переменная окружения DATABASE_URL.
 */
import pg from 'pg';
import { englishLineFromItem, russianLineFromItem } from './exampleFields.js';

const { Pool } = pg;

function resolveDatabaseUrl() {
  const url = process.env.DATABASE_URL?.trim();
  if (url) return url;

  // Dev-удобство: если забыли .env, пробуем локальный Postgres по умолчанию.
  // В production по-прежнему требуем явный DATABASE_URL.
  if ((process.env.NODE_ENV ?? '').toLowerCase() !== 'production') {
    return 'postgresql://seashell:seashell@localhost:5432/seashell';
  }

  throw new Error(
    'DATABASE_URL не задан. Укажи строку подключения PostgreSQL (например: postgresql://user:pass@host:5432/db)',
  );
}

const pool = new Pool({ connectionString: resolveDatabaseUrl() });

export async function initDb() {
  await pool.query(`CREATE TABLE IF NOT EXISTS words (
    id SERIAL PRIMARY KEY,
    vk_user_id BIGINT NOT NULL,
    word TEXT NOT NULL,
    created_at BIGINT NOT NULL,
    gloss_ru TEXT
  )`);
  await pool.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS words_user_word_lower ON words (vk_user_id, LOWER(word))`,
  );
  await pool.query(`CREATE TABLE IF NOT EXISTS examples (
    id SERIAL PRIMARY KEY,
    word_id INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
    idx INTEGER NOT NULL,
    text TEXT NOT NULL,
    translation TEXT,
    UNIQUE (word_id, idx)
  )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_words_user ON words (vk_user_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_examples_word ON examples (word_id)`);
}

/** Разбор ответа GigaChat: либо массив примеров, либо объект { glossRu, examples }. */
function unpackWordPayload(payload) {
  if (Array.isArray(payload)) {
    return { glossRu: null, examples: payload };
  }
  if (payload && typeof payload === 'object') {
    const g = payload.glossRu ?? payload.gloss_ru;
    const glossRu = typeof g === 'string' ? g.trim() || null : null;
    const examples = payload.examples ?? [];
    return { glossRu, examples: Array.isArray(examples) ? examples : [] };
  }
  return { glossRu: null, examples: [] };
}

export async function listWords(vkUserId) {
  const { rows } = await pool.query(
    `SELECT w.id, w.word, w.created_at,
      (SELECT COUNT(*)::int FROM examples e WHERE e.word_id = w.id) AS example_count
     FROM words w WHERE w.vk_user_id = $1
     ORDER BY w.created_at DESC`,
    [vkUserId],
  );
  return rows.map((r) => ({
    ...r,
    example_count: Number(r.example_count ?? 0),
  }));
}

export async function getWordWithExamples(vkUserId, wordId) {
  const { rows: wRows } = await pool.query(
    'SELECT id, word, created_at, gloss_ru FROM words WHERE id = $1 AND vk_user_id = $2',
    [wordId, vkUserId],
  );
  const word = wRows[0];
  if (!word) return null;
  const { rows: examples } = await pool.query(
    'SELECT idx, text, translation FROM examples WHERE word_id = $1 ORDER BY idx ASC',
    [word.id],
  );
  return { ...word, examples };
}

export async function insertWordWithExamples(vkUserId, wordNorm, payload) {
  const { glossRu, examples: examplesIn } = unpackWordPayload(payload);
  const createdAt = Date.now();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ins = await client.query(
      'INSERT INTO words (vk_user_id, word, created_at, gloss_ru) VALUES ($1, $2, $3, $4) RETURNING id',
      [vkUserId, wordNorm, createdAt, glossRu],
    );
    const wordId = Number(ins.rows[0].id);
    for (let idx = 0; idx < examplesIn.length; idx++) {
      const ex = examplesIn[idx];
      const text = englishLineFromItem(ex);
      const tr = russianLineFromItem(ex);
      const translation = typeof ex === 'string' ? null : tr || null;
      await client.query(
        'INSERT INTO examples (word_id, idx, text, translation) VALUES ($1, $2, $3, $4)',
        [wordId, idx, text, translation],
      );
    }
    await client.query('COMMIT');
    return getWordWithExamples(vkUserId, wordId);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

/** Удаляет все примеры слова и записывает новый набор (тот же payload, что у insertWordWithExamples). */
export async function replaceExamplesForWord(vkUserId, wordId, payload) {
  const { glossRu, examples: examplesIn } = unpackWordPayload(payload);
  const { rows } = await pool.query('SELECT id FROM words WHERE id = $1 AND vk_user_id = $2', [
    wordId,
    vkUserId,
  ]);
  const word = rows[0];
  if (!word) return null;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (glossRu != null) {
      await client.query('UPDATE words SET gloss_ru = $1 WHERE id = $2 AND vk_user_id = $3', [
        glossRu,
        word.id,
        vkUserId,
      ]);
    }
    await client.query('DELETE FROM examples WHERE word_id = $1', [word.id]);
    for (let idx = 0; idx < examplesIn.length; idx++) {
      const ex = examplesIn[idx];
      const text = englishLineFromItem(ex);
      const tr = russianLineFromItem(ex);
      const translation = typeof ex === 'string' ? null : tr || null;
      await client.query(
        'INSERT INTO examples (word_id, idx, text, translation) VALUES ($1, $2, $3, $4)',
        [word.id, idx, text, translation],
      );
    }
    await client.query('COMMIT');
    return getWordWithExamples(vkUserId, word.id);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function deleteWord(vkUserId, wordId) {
  const r = await pool.query('DELETE FROM words WHERE id = $1 AND vk_user_id = $2', [wordId, vkUserId]);
  return r.rowCount > 0;
}

export async function findWordByLemma(vkUserId, wordNorm) {
  const { rows } = await pool.query(
    'SELECT id FROM words WHERE vk_user_id = $1 AND LOWER(word) = LOWER($2)',
    [vkUserId, wordNorm],
  );
  return rows[0] ?? null;
}
