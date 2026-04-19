/**
 * Слой доступа к SQLite: слова пользователя и примеры с переводами.
 * Движок: встроенный модуль Node `node:sqlite` (DatabaseSync). Файл БД: server/data/words.db.
 * Миграции: новые колонки добавляются через ALTER TABLE при старте, если их ещё нет.
 */
import { DatabaseSync } from 'node:sqlite';
import fs from 'fs';
import { englishLineFromItem, russianLineFromItem } from './exampleFields.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// На хостинге с постоянным диском: DATA_DIR=/data (см. DEPLOY.txt)
const dataDir = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, 'data');
const dbPath = path.join(dataDir, 'words.db');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new DatabaseSync(dbPath);
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS words (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vk_user_id INTEGER NOT NULL,
    word TEXT NOT NULL COLLATE NOCASE,
    created_at INTEGER NOT NULL,
    UNIQUE (vk_user_id, word)
  );
  CREATE TABLE IF NOT EXISTS examples (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    word_id INTEGER NOT NULL,
    idx INTEGER NOT NULL,
    text TEXT NOT NULL,
    FOREIGN KEY (word_id) REFERENCES words(id) ON DELETE CASCADE,
    UNIQUE (word_id, idx)
  );
  CREATE INDEX IF NOT EXISTS idx_words_user ON words(vk_user_id);
  CREATE INDEX IF NOT EXISTS idx_examples_word ON examples(word_id);
`);

// Миграции для старых БД без новых колонок (однократно при первом запуске после обновления).
const exampleColumns = db.prepare('PRAGMA table_info(examples)').all();
if (!exampleColumns.some((c) => c.name === 'translation')) {
  db.exec('ALTER TABLE examples ADD COLUMN translation TEXT');
}

const wordColumns = db.prepare('PRAGMA table_info(words)').all();
if (!wordColumns.some((c) => c.name === 'gloss_ru')) {
  db.exec('ALTER TABLE words ADD COLUMN gloss_ru TEXT');
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

export function listWords(vkUserId) {
  const rows = db
    .prepare(
      `SELECT w.id, w.word, w.created_at,
        (SELECT COUNT(*) FROM examples e WHERE e.word_id = w.id) AS example_count
       FROM words w WHERE w.vk_user_id = ?
       ORDER BY w.created_at DESC`,
    )
    .all(vkUserId);
  return rows.map((r) => ({
    ...r,
    example_count: Number(r.example_count ?? 0),
  }));
}

export function getWordWithExamples(vkUserId, wordId) {
  const word = db
    .prepare('SELECT id, word, created_at, gloss_ru FROM words WHERE id = ? AND vk_user_id = ?')
    .get(wordId, vkUserId);
  if (!word) return null;
  const examples = db
    .prepare('SELECT idx, text, translation FROM examples WHERE word_id = ? ORDER BY idx ASC')
    .all(word.id);
  return { ...word, examples };
}

export function insertWordWithExamples(vkUserId, wordNorm, payload) {
  const { glossRu, examples: examplesIn } = unpackWordPayload(payload);
  const createdAt = Date.now();
  const insertWord = db.prepare(
    'INSERT INTO words (vk_user_id, word, created_at, gloss_ru) VALUES (?, ?, ?, ?)',
  );
  const insertEx = db.prepare(
    'INSERT INTO examples (word_id, idx, text, translation) VALUES (?, ?, ?, ?)',
  );

  db.exec('BEGIN IMMEDIATE');
  try {
    const info = insertWord.run(vkUserId, wordNorm, createdAt, glossRu);
    const wordId = Number(info.lastInsertRowid);
    examplesIn.forEach((ex, idx) => {
      const text = englishLineFromItem(ex);
      const tr = russianLineFromItem(ex);
      const translation = typeof ex === 'string' ? null : tr || null;
      insertEx.run(wordId, idx, text, translation);
    });
    db.exec('COMMIT');
    return getWordWithExamples(vkUserId, wordId);
  } catch (e) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // ignore
    }
    throw e;
  }
}

/** Удаляет все примеры слова и записывает новый набор (тот же payload, что у insertWordWithExamples). */
export function replaceExamplesForWord(vkUserId, wordId, payload) {
  const { glossRu, examples: examplesIn } = unpackWordPayload(payload);
  const word = db
    .prepare('SELECT id FROM words WHERE id = ? AND vk_user_id = ?')
    .get(wordId, vkUserId);
  if (!word) return null;

  const updateGloss = db.prepare('UPDATE words SET gloss_ru = ? WHERE id = ? AND vk_user_id = ?');
  const insertEx = db.prepare(
    'INSERT INTO examples (word_id, idx, text, translation) VALUES (?, ?, ?, ?)',
  );

  db.exec('BEGIN IMMEDIATE');
  try {
    if (glossRu != null) {
      updateGloss.run(glossRu, word.id, vkUserId);
    }
    db.prepare('DELETE FROM examples WHERE word_id = ?').run(word.id);
    examplesIn.forEach((ex, idx) => {
      const text = englishLineFromItem(ex);
      const tr = russianLineFromItem(ex);
      const translation = typeof ex === 'string' ? null : tr || null;
      insertEx.run(word.id, idx, text, translation);
    });
    db.exec('COMMIT');
    return getWordWithExamples(vkUserId, word.id);
  } catch (e) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // ignore
    }
    throw e;
  }
}

export function deleteWord(vkUserId, wordId) {
  const q = db.prepare('DELETE FROM words WHERE id = ? AND vk_user_id = ?');
  const r = q.run(wordId, vkUserId);
  return r.changes > 0;
}

export function findWordByLemma(vkUserId, wordNorm) {
  return db
    .prepare('SELECT id FROM words WHERE vk_user_id = ? AND word = ? COLLATE NOCASE')
    .get(vkUserId, wordNorm);
}
