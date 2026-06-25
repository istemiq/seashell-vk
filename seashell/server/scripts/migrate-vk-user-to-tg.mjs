#!/usr/bin/env node
/**
 * Перенос словаря пользователя: VK user id → Telegram user id (то же поле vk_user_id в БД).
 *
 *   node scripts/migrate-vk-user-to-tg.mjs --from 123456 --to 987654321
 *   node scripts/migrate-vk-user-to-tg.mjs --list-users
 *   node scripts/migrate-vk-user-to-tg.mjs --resolve-vk arinaxxr
 */
import '../load-env.js';
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function listUsers() {
  const { rows } = await pool.query(`
    SELECT w.vk_user_id,
           COUNT(DISTINCT w.id)::int AS words,
           COUNT(DISTINCT s.id)::int AS sets
    FROM words w
    LEFT JOIN word_sets s ON s.vk_user_id = w.vk_user_id
    GROUP BY w.vk_user_id
    ORDER BY words DESC
  `);
  console.log('vk_user_id (words / sets):');
  for (const r of rows) {
    console.log(`  ${r.vk_user_id}  (${r.words} words, ${r.sets} sets)`);
  }
}

async function resolveVkScreenName(name) {
  const token =
    process.env.MINI_APPS_ACCESS_TOKEN?.trim() ||
    process.env.VK_SERVICE_TOKEN?.trim() ||
    process.env.VK_ACCESS_TOKEN?.trim();
  if (!token) {
    console.error('Нет MINI_APPS_ACCESS_TOKEN / VK_SERVICE_TOKEN в .env — users.get недоступен.');
    process.exit(1);
  }
  const hosts = ['https://api.vk.ru/method', 'https://api.vk.com/method'];
  for (const host of hosts) {
    const url = `${host}/users.get?user_ids=${encodeURIComponent(name)}&v=5.199&access_token=${encodeURIComponent(token)}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.error) {
      console.warn(`${host}:`, data.error.error_msg);
      continue;
    }
    const user = data.response?.[0];
    if (!user) {
      console.error('Пользователь не найден:', name);
      process.exit(1);
    }
    console.log(JSON.stringify({ id: user.id, first_name: user.first_name, last_name: user.last_name, screen_name: user.domain || name }, null, 2));
    return Number(user.id);
  }
  process.exit(1);
}

async function migrate(fromId, toId, { mode = 'copy' } = {}) {
  if (!Number.isFinite(fromId) || fromId <= 0 || !Number.isFinite(toId) || toId <= 0) {
    throw new Error('Некорректные id');
  }
  if (fromId === toId) {
    console.log('from === to, нечего делать');
    return;
  }

  const client = await pool.connect();
  try {
    const { rows: srcWords } = await client.query(
      'SELECT COUNT(*)::int AS n FROM words WHERE vk_user_id = $1',
      [fromId],
    );
    const { rows: dstWords } = await client.query(
      'SELECT COUNT(*)::int AS n FROM words WHERE vk_user_id = $1',
      [toId],
    );
    console.log(`Источник VK ${fromId}: ${srcWords[0].n} слов`);
    console.log(`Цель TG ${toId}: ${dstWords[0].n} слов (до миграции)`);

    if (srcWords[0].n === 0) {
      console.log('У источника нет слов — выход.');
      return;
    }

    await client.query('BEGIN');

    if (mode === 'move') {
      await client.query('UPDATE words SET vk_user_id = $1 WHERE vk_user_id = $2', [toId, fromId]);
      await client.query('UPDATE word_sets SET vk_user_id = $1 WHERE vk_user_id = $2', [toId, fromId]);
      await client.query('COMMIT');
      console.log(`MOVE готово: все записи ${fromId} → ${toId}`);
      return;
    }

    // COPY: слова + примеры + группы (merge по LOWER(word) / LOWER(name))
    const { rows: words } = await client.query(
      `SELECT id, word, created_at, gloss_ru, gloss_note_ru, verb_usage
       FROM words WHERE vk_user_id = $1 ORDER BY id`,
      [fromId],
    );

    const wordIdMap = new Map();
    let copiedWords = 0;
    let skippedWords = 0;

    for (const w of words) {
      const dup = await client.query(
        'SELECT id FROM words WHERE vk_user_id = $1 AND LOWER(word) = LOWER($2)',
        [toId, w.word],
      );
      if (dup.rows[0]) {
        wordIdMap.set(w.id, dup.rows[0].id);
        skippedWords += 1;
        continue;
      }
      const ins = await client.query(
        `INSERT INTO words (vk_user_id, word, created_at, gloss_ru, gloss_note_ru, verb_usage)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [toId, w.word, w.created_at, w.gloss_ru, w.gloss_note_ru, w.verb_usage],
      );
      const newId = ins.rows[0].id;
      wordIdMap.set(w.id, newId);
      copiedWords += 1;

      const { rows: examples } = await client.query(
        'SELECT idx, text, translation, note_ru FROM examples WHERE word_id = $1 ORDER BY idx',
        [w.id],
      );
      for (const ex of examples) {
        await client.query(
          'INSERT INTO examples (word_id, idx, text, translation, note_ru) VALUES ($1, $2, $3, $4, $5)',
          [newId, ex.idx, ex.text, ex.translation, ex.note_ru],
        );
      }
    }

    const setIdMap = new Map();
    let copiedSets = 0;
    const { rows: sets } = await client.query(
      'SELECT id, name, created_at FROM word_sets WHERE vk_user_id = $1 ORDER BY id',
      [fromId],
    );

    for (const s of sets) {
      let targetSetId;
      const existing = await client.query(
        'SELECT id FROM word_sets WHERE vk_user_id = $1 AND LOWER(name) = LOWER($2)',
        [toId, s.name],
      );
      if (existing.rows[0]) {
        targetSetId = existing.rows[0].id;
      } else {
        const ins = await client.query(
          'INSERT INTO word_sets (vk_user_id, name, created_at) VALUES ($1, $2, $3) RETURNING id',
          [toId, s.name, s.created_at],
        );
        targetSetId = ins.rows[0].id;
        copiedSets += 1;
      }
      setIdMap.set(s.id, targetSetId);

      const { rows: items } = await client.query(
        'SELECT word_id FROM word_set_items WHERE set_id = $1',
        [s.id],
      );
      for (const it of items) {
        const mappedWordId = wordIdMap.get(it.word_id);
        if (!mappedWordId) continue;
        await client.query(
          `INSERT INTO word_set_items (set_id, word_id) VALUES ($1, $2)
           ON CONFLICT DO NOTHING`,
          [targetSetId, mappedWordId],
        );
      }
    }

    await client.query('COMMIT');
    console.log(`COPY готово: +${copiedWords} слов (${skippedWords} уже были), +${copiedSets} групп → user ${toId}`);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function main() {
  if (process.argv.includes('--list-users')) {
    await listUsers();
    return;
  }

  const screen = arg('--resolve-vk');
  if (screen) {
    await resolveVkScreenName(screen);
    return;
  }

  const from = parseInt(arg('--from') ?? '', 10);
  const to = parseInt(arg('--to') ?? '', 10);
  const mode = process.argv.includes('--move') ? 'move' : 'copy';

  if (!from || !to) {
    console.error(`Usage:
  node scripts/migrate-vk-user-to-tg.mjs --list-users
  node scripts/migrate-vk-user-to-tg.mjs --resolve-vk arinaxxr
  node scripts/migrate-vk-user-to-tg.mjs --from VK_ID --to TG_ID [--move]
`);
    process.exit(1);
  }

  await migrate(from, to, { mode });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => pool.end());
