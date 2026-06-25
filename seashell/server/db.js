/**
 * Слой доступа к PostgreSQL: слова пользователя и примеры с переводами.
 * Подключение: переменная окружения DATABASE_URL.
 */
import pg from 'pg';
import {
  englishLineFromItem,
  russianLineFromItem,
  stylisticNoteFromItem,
  normalizeVerbUsage,
} from './exampleFields.js';
import { WORD_EXAMPLE_COUNT } from './dictionaryConstants.js';
import { normalizeContentLocale } from './promptLocales.js';
import { resolveLlmModel } from './llmProvider.js';

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

  await pool.query(`CREATE TABLE IF NOT EXISTS word_sets (
    id SERIAL PRIMARY KEY,
    vk_user_id BIGINT NOT NULL,
    name TEXT NOT NULL,
    created_at BIGINT NOT NULL
  )`);
  await pool.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS word_sets_user_name_lower ON word_sets (vk_user_id, LOWER(name))`,
  );
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_word_sets_user ON word_sets (vk_user_id)`);

  await pool.query(`CREATE TABLE IF NOT EXISTS word_set_items (
    set_id INTEGER NOT NULL REFERENCES word_sets(id) ON DELETE CASCADE,
    word_id INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
    PRIMARY KEY (set_id, word_id)
  )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_word_set_items_word ON word_set_items (word_id)`);

  await pool.query(`ALTER TABLE words ADD COLUMN IF NOT EXISTS gloss_note_ru TEXT`);
  await pool.query(`ALTER TABLE examples ADD COLUMN IF NOT EXISTS note_ru TEXT`);
  await pool.query(`ALTER TABLE words ADD COLUMN IF NOT EXISTS verb_usage TEXT`);
  await pool.query(`ALTER TABLE words ADD COLUMN IF NOT EXISTS content_locale TEXT`);
  await pool.query(
    `UPDATE words SET content_locale = 'ru' WHERE content_locale IS NULL OR TRIM(content_locale) = ''`,
  );
  await pool.query(`ALTER TABLE words ALTER COLUMN content_locale SET DEFAULT 'ru'`);
  await pool.query(`DROP INDEX IF EXISTS words_user_word_lower`);
  await pool.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS words_user_word_locale_lower
     ON words (vk_user_id, LOWER(word), content_locale)`,
  );

  await pool.query('DELETE FROM examples WHERE idx >= $1', [WORD_EXAMPLE_COUNT]);

  await pool.query(`CREATE TABLE IF NOT EXISTS dictionary_generation_cache (
    cache_key TEXT PRIMARY KEY,
    request_word TEXT NOT NULL,
    headword_en TEXT NOT NULL,
    model TEXT NOT NULL,
    prompt_version TEXT NOT NULL,
    example_count INTEGER NOT NULL,
    payload JSONB NOT NULL,
    created_at BIGINT NOT NULL,
    last_used_at BIGINT NOT NULL,
    use_count INTEGER NOT NULL DEFAULT 0
  )`);
  await pool.query(
    `ALTER TABLE dictionary_generation_cache ADD COLUMN IF NOT EXISTS content_locale TEXT NOT NULL DEFAULT 'ru'`,
  );
  await pool.query(`DROP INDEX IF EXISTS idx_dictionary_generation_cache_request`);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_dictionary_generation_cache_request
     ON dictionary_generation_cache (
       LOWER(request_word), model, prompt_version, example_count, content_locale
     )`,
  );
}

function parseVerbUsageColumn(raw) {
  if (raw == null || raw === '') return [];
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(String(raw));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function serializeVerbUsage(verbUsage) {
  const normalized = normalizeVerbUsage(verbUsage);
  return normalized.length === 3 ? JSON.stringify(normalized) : null;
}

function normalizeCacheWord(word) {
  return String(word ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function dictionaryCacheKey({
  requestWord,
  model,
  promptVersion,
  exampleCount = WORD_EXAMPLE_COUNT,
  contentLocale = 'ru',
}) {
  return [
    normalizeCacheWord(requestWord),
    String(model || 'GigaChat').trim(),
    String(promptVersion || 'v1').trim(),
    String(exampleCount),
    String(contentLocale || 'ru').trim().toLowerCase(),
  ].join('\u001f');
}

function payloadFromStoredGeneration(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const headwordEn = String(raw.headwordEn ?? raw.headword_en ?? '').trim().replace(/\s+/g, ' ');
  const examples = Array.isArray(raw.examples) ? raw.examples : [];
  if (!headwordEn || examples.length < WORD_EXAMPLE_COUNT) return null;
  return {
    glossRu: typeof raw.glossRu === 'string' ? raw.glossRu : raw.gloss_ru ?? null,
    glossNoteRu: typeof raw.glossNoteRu === 'string' ? raw.glossNoteRu : raw.gloss_note_ru ?? null,
    examples: examples.slice(0, WORD_EXAMPLE_COUNT),
    headwordEn,
    verbUsage: normalizeVerbUsage(raw.verbUsage ?? raw.verb_usage ?? []),
  };
}

function payloadFromWordRow(word, examples) {
  if (!word || !Array.isArray(examples) || examples.length < WORD_EXAMPLE_COUNT) return null;
  return {
    glossRu: word.gloss_ru ?? null,
    glossNoteRu: word.gloss_note_ru ?? null,
    examples: examples.slice(0, WORD_EXAMPLE_COUNT).map((ex) => ({
      text: ex.text,
      translation: ex.translation ?? null,
      noteRu: ex.note_ru ?? null,
    })),
    headwordEn: String(word.word ?? '').trim().replace(/\s+/g, ' '),
    verbUsage: parseVerbUsageColumn(word.verb_usage),
  };
}

export function dictionaryGenerationCacheMeta(contentLocale) {
  return {
    model: resolveLlmModel(),
    promptVersion: String(process.env.GIGACHAT_DICTIONARY_CACHE_VERSION || 'v6').trim() || 'v6',
    exampleCount: WORD_EXAMPLE_COUNT,
    contentLocale: normalizeContentLocale(contentLocale),
  };
}

export async function getCachedWordGeneration(requestWord, meta = dictionaryGenerationCacheMeta()) {
  const key = dictionaryCacheKey({ requestWord, ...meta });
  const { rows } = await pool.query(
    `UPDATE dictionary_generation_cache
     SET last_used_at = $2, use_count = use_count + 1
     WHERE cache_key = $1
     RETURNING payload`,
    [key, Date.now()],
  );
  return payloadFromStoredGeneration(rows[0]?.payload);
}

export async function saveCachedWordGeneration(requestWord, payload, meta = dictionaryGenerationCacheMeta()) {
  const normalized = payloadFromStoredGeneration(payload);
  if (!normalized) return null;
  const now = Date.now();
  const key = dictionaryCacheKey({ requestWord, ...meta });
  await pool.query(
    `INSERT INTO dictionary_generation_cache
      (cache_key, request_word, headword_en, model, prompt_version, example_count, content_locale, payload, created_at, last_used_at, use_count)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $9, 0)
     ON CONFLICT (cache_key) DO UPDATE SET
       headword_en = EXCLUDED.headword_en,
       payload = EXCLUDED.payload,
       content_locale = EXCLUDED.content_locale,
       last_used_at = EXCLUDED.last_used_at`,
    [
      key,
      normalizeCacheWord(requestWord),
      normalized.headwordEn,
      meta.model,
      meta.promptVersion,
      meta.exampleCount,
      normalizeContentLocale(meta.contentLocale),
      JSON.stringify(normalized),
      now,
    ],
  );
  return normalized;
}

/**
 * @deprecated Scripts only — ignores content_locale.
 */
export async function findReusableWordGeneration(wordNorm) {
  const normalized = normalizeCacheWord(wordNorm);
  if (!normalized) return null;
  const { rows: wordRows } = await pool.query(
    `SELECT id, word, gloss_ru, gloss_note_ru, verb_usage
     FROM words
     WHERE LOWER(word) = LOWER($1)
     ORDER BY created_at DESC
     LIMIT 1`,
    [normalized],
  );
  const word = wordRows[0];
  if (!word) return null;

  const { rows: examples } = await pool.query(
    'SELECT idx, text, translation, note_ru FROM examples WHERE word_id = $1 ORDER BY idx ASC LIMIT $2',
    [word.id, WORD_EXAMPLE_COUNT],
  );
  return payloadFromWordRow(word, examples);
}

/** Разбор ответа GigaChat: либо массив примеров, либо объект { glossRu, examples }. */
function unpackWordPayload(payload) {
  if (Array.isArray(payload)) {
    return { glossRu: null, glossNoteRu: null, examples: payload, verbUsage: [] };
  }
  if (payload && typeof payload === 'object') {
    const g = payload.glossRu ?? payload.gloss_ru;
    const glossRu = typeof g === 'string' ? g.trim() || null : null;
    const gn = payload.glossNoteRu ?? payload.gloss_note_ru;
    const glossNoteRu = typeof gn === 'string' ? gn.trim() || null : null;
    const examples = payload.examples ?? [];
    const verbUsage = normalizeVerbUsage(
      payload.verbUsage ?? payload.verb_usage ?? payload.verbForms ?? [],
    );
    return {
      glossRu,
      glossNoteRu,
      examples: Array.isArray(examples) ? examples : [],
      verbUsage,
    };
  }
  return { glossRu: null, glossNoteRu: null, examples: [], verbUsage: [] };
}

export async function listWords(vkUserId) {
  const { rows } = await pool.query(
    `SELECT w.id, w.word, w.created_at, w.content_locale,
      (SELECT COUNT(*)::int FROM examples e WHERE e.word_id = w.id AND e.idx < $2) AS example_count
     FROM words w WHERE w.vk_user_id = $1
     ORDER BY w.created_at DESC`,
    [vkUserId, WORD_EXAMPLE_COUNT],
  );
  return rows.map((r) => ({
    ...r,
    example_count: Number(r.example_count ?? 0),
  }));
}

export async function listWordsInSet(vkUserId, setId) {
  const { rows } = await pool.query(
    `SELECT w.id, w.word, w.created_at, w.content_locale,
      (SELECT COUNT(*)::int FROM examples e WHERE e.word_id = w.id AND e.idx < $3) AS example_count
     FROM words w
     JOIN word_set_items wsi ON wsi.word_id = w.id
     JOIN word_sets s ON s.id = wsi.set_id AND s.vk_user_id = $1
     WHERE w.vk_user_id = $1 AND wsi.set_id = $2
     ORDER BY w.created_at DESC`,
    [vkUserId, setId, WORD_EXAMPLE_COUNT],
  );
  return rows.map((r) => ({
    ...r,
    example_count: Number(r.example_count ?? 0),
  }));
}

export async function getWordWithExamples(vkUserId, wordId) {
  const { rows: wRows } = await pool.query(
    'SELECT id, word, created_at, gloss_ru, gloss_note_ru, verb_usage, content_locale FROM words WHERE id = $1 AND vk_user_id = $2',
    [wordId, vkUserId],
  );
  const word = wRows[0];
  if (!word) return null;
  const { rows: examples } = await pool.query(
    'SELECT idx, text, translation, note_ru FROM examples WHERE word_id = $1 ORDER BY idx ASC LIMIT $2',
    [word.id, WORD_EXAMPLE_COUNT],
  );
  const { rows: setRows } = await pool.query(
    `SELECT wsi.set_id
     FROM word_set_items wsi
     JOIN word_sets s ON s.id = wsi.set_id
     WHERE wsi.word_id = $1 AND s.vk_user_id = $2
     ORDER BY wsi.set_id ASC`,
    [word.id, vkUserId],
  );
  const setIds = setRows.map((r) => Number(r.set_id));
  const verb_usage = parseVerbUsageColumn(word.verb_usage);
  return { ...word, examples, setIds, verb_usage };
}

export async function insertWordWithExamples(vkUserId, wordNorm, payload, contentLocale = 'ru') {
  const loc = normalizeContentLocale(contentLocale);
  const { glossRu, glossNoteRu, examples: examplesInRaw, verbUsage } = unpackWordPayload(payload);
  const examplesIn = examplesInRaw.slice(0, WORD_EXAMPLE_COUNT);
  const verbUsageJson = serializeVerbUsage(verbUsage);
  const createdAt = Date.now();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ins = await client.query(
      `INSERT INTO words (vk_user_id, word, created_at, gloss_ru, gloss_note_ru, verb_usage, content_locale)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [vkUserId, wordNorm, createdAt, glossRu, glossNoteRu, verbUsageJson, loc],
    );
    const wordId = Number(ins.rows[0].id);
    for (let idx = 0; idx < examplesIn.length; idx++) {
      const ex = examplesIn[idx];
      const text = englishLineFromItem(ex);
      const tr = russianLineFromItem(ex);
      const translation = typeof ex === 'string' ? null : tr || null;
      const noteRu = typeof ex === 'string' ? null : stylisticNoteFromItem(ex) || null;
      await client.query(
        'INSERT INTO examples (word_id, idx, text, translation, note_ru) VALUES ($1, $2, $3, $4, $5)',
        [wordId, idx, text, translation, noteRu],
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
  const { glossRu, glossNoteRu, examples: examplesInRaw, verbUsage } = unpackWordPayload(payload);
  const examplesIn = examplesInRaw.slice(0, WORD_EXAMPLE_COUNT);
  const verbUsageJson = serializeVerbUsage(verbUsage);
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
    if (glossNoteRu != null) {
      await client.query('UPDATE words SET gloss_note_ru = $1 WHERE id = $2 AND vk_user_id = $3', [
        glossNoteRu,
        word.id,
        vkUserId,
      ]);
    }
    await client.query('UPDATE words SET verb_usage = $1 WHERE id = $2 AND vk_user_id = $3', [
      verbUsageJson,
      word.id,
      vkUserId,
    ]);
    await client.query('DELETE FROM examples WHERE word_id = $1', [word.id]);
    for (let idx = 0; idx < examplesIn.length; idx++) {
      const ex = examplesIn[idx];
      const text = englishLineFromItem(ex);
      const tr = russianLineFromItem(ex);
      const translation = typeof ex === 'string' ? null : tr || null;
      const noteRu = typeof ex === 'string' ? null : stylisticNoteFromItem(ex) || null;
      await client.query(
        'INSERT INTO examples (word_id, idx, text, translation, note_ru) VALUES ($1, $2, $3, $4, $5)',
        [word.id, idx, text, translation, noteRu],
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

export async function findWordByLemma(vkUserId, wordNorm, contentLocale = 'ru') {
  const loc = normalizeContentLocale(contentLocale);
  const { rows } = await pool.query(
    'SELECT id, word, content_locale FROM words WHERE vk_user_id = $1 AND LOWER(word) = LOWER($2) AND content_locale = $3',
    [vkUserId, wordNorm, loc],
  );
  return rows[0] ?? null;
}

export async function listSets(vkUserId) {
  const { rows } = await pool.query(
    `SELECT id, name, created_at
     FROM word_sets
     WHERE vk_user_id = $1
     ORDER BY created_at DESC`,
    [vkUserId],
  );
  return rows.map((r) => ({ ...r, id: Number(r.id), created_at: Number(r.created_at) }));
}

export async function createSet(vkUserId, name) {
  const createdAt = Date.now();
  const { rows } = await pool.query(
    'INSERT INTO word_sets (vk_user_id, name, created_at) VALUES ($1, $2, $3) RETURNING id, name, created_at',
    [vkUserId, name, createdAt],
  );
  const r = rows[0];
  return { id: Number(r.id), name: r.name, created_at: Number(r.created_at) };
}

export async function renameSet(vkUserId, setId, name) {
  const { rows } = await pool.query(
    'UPDATE word_sets SET name = $1 WHERE id = $2 AND vk_user_id = $3 RETURNING id, name, created_at',
    [name, setId, vkUserId],
  );
  const r = rows[0];
  if (!r) return null;
  return { id: Number(r.id), name: r.name, created_at: Number(r.created_at) };
}

/**
 * Удаляет сет. Также удаляет слова, которые были в этом сете и после удаления не состоят ни в одном сете.
 * Важно: не трогаем слова, которые вообще не были в удаляемом сете.
 */
export async function deleteSetAndOrphanWords(vkUserId, setId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: setRows } = await client.query(
      'SELECT id FROM word_sets WHERE id = $1 AND vk_user_id = $2',
      [setId, vkUserId],
    );
    if (!setRows[0]) {
      await client.query('ROLLBACK');
      return { deleted: false, removedWordIds: [] };
    }

    const { rows: wordRows } = await client.query(
      `SELECT wsi.word_id
       FROM word_set_items wsi
       JOIN words w ON w.id = wsi.word_id
       WHERE wsi.set_id = $1 AND w.vk_user_id = $2`,
      [setId, vkUserId],
    );
    const candidateWordIds = wordRows.map((r) => Number(r.word_id));

    await client.query('DELETE FROM word_sets WHERE id = $1 AND vk_user_id = $2', [setId, vkUserId]);

    if (candidateWordIds.length === 0) {
      await client.query('COMMIT');
      return { deleted: true, removedWordIds: [] };
    }

    const { rows: orphanRows } = await client.query(
      `SELECT w.id
       FROM words w
       WHERE w.vk_user_id = $1
         AND w.id = ANY($2::int[])
         AND NOT EXISTS (SELECT 1 FROM word_set_items wsi WHERE wsi.word_id = w.id)`,
      [vkUserId, candidateWordIds],
    );
    const orphanIds = orphanRows.map((r) => Number(r.id));
    if (orphanIds.length > 0) {
      await client.query(`DELETE FROM words WHERE vk_user_id = $1 AND id = ANY($2::int[])`, [
        vkUserId,
        orphanIds,
      ]);
    }

    await client.query('COMMIT');
    return { deleted: true, removedWordIds: orphanIds };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function replaceWordSets(vkUserId, wordId, setIds) {
  const ids = Array.isArray(setIds)
    ? setIds
        .map((x) => parseInt(String(x), 10))
        .filter((n) => Number.isFinite(n) && n > 0)
    : [];

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: wRows } = await client.query('SELECT id FROM words WHERE id = $1 AND vk_user_id = $2', [
      wordId,
      vkUserId,
    ]);
    if (!wRows[0]) {
      await client.query('ROLLBACK');
      return null;
    }

    // Разрешаем назначать только сеты текущего пользователя.
    let allowed = [];
    if (ids.length > 0) {
      const { rows: sRows } = await client.query(
        'SELECT id FROM word_sets WHERE vk_user_id = $1 AND id = ANY($2::int[])',
        [vkUserId, ids],
      );
      allowed = sRows.map((r) => Number(r.id));
    }

    await client.query('DELETE FROM word_set_items WHERE word_id = $1', [wordId]);
    for (const sid of allowed) {
      await client.query('INSERT INTO word_set_items (set_id, word_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [
        sid,
        wordId,
      ]);
    }

    await client.query('COMMIT');

    const { rows: outRows } = await pool.query(
      `SELECT wsi.set_id
       FROM word_set_items wsi
       JOIN word_sets s ON s.id = wsi.set_id
       WHERE wsi.word_id = $1 AND s.vk_user_id = $2
       ORDER BY wsi.set_id ASC`,
      [wordId, vkUserId],
    );
    return outRows.map((r) => Number(r.set_id));
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
