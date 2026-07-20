/**
 * Persisted practice dialogues (free + expert).
 */
import pg from 'pg';
import {
  PRACTICE_MAX_MESSAGE_CHARS,
  PRACTICE_MAX_SESSIONS_LIST,
  PRACTICE_MAX_STORED_TURNS,
  PRACTICE_MAX_SUMMARY_CHARS,
  PRACTICE_MAX_USER_TEXT_CHARS,
} from './practiceConstants.js';

const { Pool } = pg;

function pool() {
  return globalThis.__seashellPgPool;
}

export async function initPracticeDb(sharedPool) {
  globalThis.__seashellPgPool = sharedPool;
  await sharedPool.query(`CREATE TABLE IF NOT EXISTS practice_sessions (
    id BIGSERIAL PRIMARY KEY,
    vk_user_id BIGINT NOT NULL,
    mode TEXT NOT NULL CHECK (mode IN ('free', 'expert')),
    expert_id TEXT,
    content_locale TEXT NOT NULL DEFAULT 'ru',
    dialogue_summary TEXT NOT NULL DEFAULT '',
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL
  )`);
  await sharedPool.query(`ALTER TABLE practice_sessions ADD COLUMN IF NOT EXISTS target_word_id BIGINT`);
  await sharedPool.query(`
    DO $$ BEGIN
      ALTER TABLE practice_sessions DROP CONSTRAINT IF EXISTS practice_sessions_mode_check;
    EXCEPTION WHEN undefined_object THEN NULL;
    END $$;
  `);
  await sharedPool.query(`
    ALTER TABLE practice_sessions ADD CONSTRAINT practice_sessions_mode_check
    CHECK (mode IN ('free', 'expert', 'word'))
  `);
  await sharedPool.query(
    `CREATE INDEX IF NOT EXISTS idx_practice_sessions_user_updated
     ON practice_sessions (vk_user_id, updated_at DESC)`,
  );

  await sharedPool.query(`CREATE TABLE IF NOT EXISTS practice_messages (
    id BIGSERIAL PRIMARY KEY,
    session_id BIGINT NOT NULL REFERENCES practice_sessions(id) ON DELETE CASCADE,
    seq INTEGER NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    user_text TEXT,
    echo TEXT,
    corrections TEXT,
    reply TEXT NOT NULL,
    is_opening BOOLEAN NOT NULL DEFAULT FALSE,
    created_at BIGINT NOT NULL,
    UNIQUE (session_id, seq)
  )`);
  await sharedPool.query(
    `CREATE INDEX IF NOT EXISTS idx_practice_messages_session_seq
     ON practice_messages (session_id, seq)`,
  );
}

function clipText(s, max = PRACTICE_MAX_MESSAGE_CHARS) {
  return String(s ?? '').slice(0, max);
}

export async function createPracticeSession({
  vkUserId,
  mode,
  expertId = null,
  targetWordId = null,
  contentLocale = 'ru',
}) {
  const now = Date.now();
  const r = await pool().query(
    `INSERT INTO practice_sessions (vk_user_id, mode, expert_id, target_word_id, content_locale, dialogue_summary, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, '', $6, $6)
     RETURNING id, mode, expert_id, target_word_id, content_locale, dialogue_summary, created_at, updated_at`,
    [vkUserId, mode, expertId, targetWordId, contentLocale, now],
  );
  return r.rows[0];
}

export async function getPracticeSession(vkUserId, sessionId) {
  const r = await pool().query(
    `SELECT id, mode, expert_id, target_word_id, content_locale, dialogue_summary, created_at, updated_at
     FROM practice_sessions WHERE id = $1 AND vk_user_id = $2`,
    [sessionId, vkUserId],
  );
  return r.rows[0] ?? null;
}

export async function listPracticeSessions(vkUserId, { mode } = {}) {
  const params = [vkUserId, PRACTICE_MAX_SESSIONS_LIST];
  let sql = `SELECT s.id, s.mode, s.expert_id, s.target_word_id, s.content_locale, s.dialogue_summary, s.created_at, s.updated_at,
      (SELECT COUNT(*)::int FROM practice_messages m WHERE m.session_id = s.id) AS message_count,
      (SELECT COUNT(*)::int FROM practice_messages m WHERE m.session_id = s.id AND m.is_opening = FALSE) AS user_turn_count,
      (SELECT reply FROM practice_messages m WHERE m.session_id = s.id ORDER BY seq DESC LIMIT 1) AS last_preview
     FROM practice_sessions s
     WHERE s.vk_user_id = $1
       AND EXISTS (
         SELECT 1 FROM practice_messages m
         WHERE m.session_id = s.id AND m.is_opening = FALSE
       )`;
  if (mode === 'free' || mode === 'expert' || mode === 'word') {
    sql += ` AND s.mode = $3`;
    params.push(mode);
  }
  sql += ` ORDER BY s.updated_at DESC LIMIT $2`;
  const r = await pool().query(sql, params);
  return r.rows;
}

export async function deletePracticeSession(vkUserId, sessionId) {
  const r = await pool().query(
    `DELETE FROM practice_sessions WHERE id = $1 AND vk_user_id = $2 RETURNING id`,
    [sessionId, vkUserId],
  );
  return (r.rowCount ?? 0) > 0;
}

/** One-off maintenance: remove all stored practice dialogues. */
export async function purgeAllPracticeSessions() {
  const r = await pool().query(`DELETE FROM practice_sessions`);
  return r.rowCount ?? 0;
}

/** Remove sessions that only have the bot opening line (no user messages). */
export async function purgeEmptyPracticeSessions() {
  const r = await pool().query(
    `DELETE FROM practice_sessions s
     WHERE NOT EXISTS (
       SELECT 1 FROM practice_messages m
       WHERE m.session_id = s.id AND m.is_opening = FALSE
     )`,
  );
  return r.rowCount ?? 0;
}

export async function listPracticeMessages(sessionId) {
  const r = await pool().query(
    `SELECT id, seq, role, user_text, echo, corrections, reply, is_opening, created_at
     FROM practice_messages
     WHERE session_id = $1
     ORDER BY seq ASC`,
    [sessionId],
  );
  return r.rows;
}

export async function touchPracticeSession(sessionId) {
  await pool().query(`UPDATE practice_sessions SET updated_at = $2 WHERE id = $1`, [sessionId, Date.now()]);
}

export async function setPracticeSessionSummary(sessionId, summary) {
  const trimmed = String(summary ?? '').trim().slice(0, PRACTICE_MAX_SUMMARY_CHARS);
  await pool().query(
    `UPDATE practice_sessions SET dialogue_summary = $2, updated_at = $3 WHERE id = $1`,
    [sessionId, trimmed, Date.now()],
  );
  return trimmed;
}

export async function getNextPracticeMessageSeq(sessionId) {
  const r = await pool().query(
    `SELECT COALESCE(MAX(seq), -1) + 1 AS next_seq FROM practice_messages WHERE session_id = $1`,
    [sessionId],
  );
  return Number(r.rows[0]?.next_seq ?? 0);
}

export async function countPracticeTurnsSince(vkUserId, sinceMs) {
  const r = await pool().query(
    `SELECT COUNT(*)::int AS n
     FROM practice_messages m
     JOIN practice_sessions s ON s.id = m.session_id
     WHERE s.vk_user_id = $1 AND m.is_opening = FALSE AND m.created_at > $2`,
    [vkUserId, sinceMs],
  );
  return Number(r.rows[0]?.n ?? 0);
}

/** @deprecated use countPracticeTurnsSince with getLastAdViewTime */
export async function countPracticeTurnsToday(vkUserId) {
  return countPracticeTurnsSince(vkUserId, 0);
}

/** Store assistant opening (expert __start__). */
export async function insertPracticeOpeningMessage(sessionId, { reply }) {
  const seq = await getNextPracticeMessageSeq(sessionId);
  const now = Date.now();
  await pool().query(
    `INSERT INTO practice_messages (session_id, seq, role, user_text, echo, corrections, reply, is_opening, created_at)
     VALUES ($1, $2, 'assistant', NULL, NULL, NULL, $3, TRUE, $4)`,
    [sessionId, seq, clipText(reply, PRACTICE_MAX_MESSAGE_CHARS * 2), now],
  );
  await touchPracticeSession(sessionId);
  return seq;
}

/** Store user turn + assistant response as one logical row (user fields + reply). */
export async function insertPracticeExchange(sessionId, { userText, echo, corrections, reply }) {
  const seq = await getNextPracticeMessageSeq(sessionId);
  const now = Date.now();
  await pool().query(
    `INSERT INTO practice_messages (session_id, seq, role, user_text, echo, corrections, reply, is_opening, created_at)
     VALUES ($1, $2, 'assistant', $3, $4, $5, $6, FALSE, $7)`,
    [
      sessionId,
      seq,
      clipText(userText, PRACTICE_MAX_USER_TEXT_CHARS),
      echo != null ? clipText(echo) : null,
      corrections != null ? clipText(corrections, 2000) : null,
      clipText(reply, PRACTICE_MAX_MESSAGE_CHARS * 2),
      now,
    ],
  );
  await touchPracticeSession(sessionId);
  return seq;
}

/** Remove oldest messages when over cap; returns removed rows for summarization. */
export async function prunePracticeMessages(sessionId) {
  const countR = await pool().query(
    `SELECT COUNT(*)::int AS c FROM practice_messages WHERE session_id = $1`,
    [sessionId],
  );
  const count = countR.rows[0]?.c ?? 0;
  if (count <= PRACTICE_MAX_STORED_TURNS) return [];
  const toRemove = count - PRACTICE_MAX_STORED_TURNS;
  const oldR = await pool().query(
    `SELECT id, seq, role, user_text, echo, corrections, reply, is_opening
     FROM practice_messages
     WHERE session_id = $1
     ORDER BY seq ASC
     LIMIT $2`,
    [sessionId, toRemove],
  );
  const ids = oldR.rows.map((r) => r.id);
  if (ids.length) {
    await pool().query(`DELETE FROM practice_messages WHERE id = ANY($1::bigint[])`, [ids]);
  }
  return oldR.rows;
}
