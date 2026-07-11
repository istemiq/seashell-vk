/**
 * Aggregated usage from PostgreSQL (words, sets, practice).
 * Excludes VK reviewer / test ids from ADMIN_EXCLUDE_USER_IDS + VK_REVIEWER_USER_ID.
 */

const MS_DAY = 24 * 60 * 60 * 1000;

export function parseExcludedUserIds() {
  const ids = new Set();
  const reviewer = parseInt(String(process.env.VK_REVIEWER_USER_ID ?? '1'), 10);
  if (Number.isFinite(reviewer) && reviewer > 0) ids.add(reviewer);

  const raw = String(process.env.ADMIN_EXCLUDE_USER_IDS ?? '').trim();
  if (raw) {
    for (const part of raw.split(/[,;\s]+/)) {
      const n = parseInt(part, 10);
      if (Number.isFinite(n) && n > 0) ids.add(n);
    }
  }
  return [...ids];
}

function excludeSql(paramIndex = 1) {
  return `($${paramIndex}::bigint[] IS NULL OR cardinality($${paramIndex}) = 0 OR vk_user_id != ALL($${paramIndex}))`;
}

async function scalar(pool, sql, params = []) {
  const { rows } = await pool.query(sql, params);
  return Number(rows[0]?.n ?? 0);
}

/**
 * @param {import('pg').Pool} pool
 * @param {{ now?: number }} [opts]
 */
export async function fetchUsageStats(pool, { now = Date.now() } = {}) {
  const exclude = parseExcludedUserIds();
  const excludeEmpty = exclude.length ? exclude : null;

  const since24h = now - MS_DAY;
  const since7d = now - 7 * MS_DAY;
  const since30d = now - 30 * MS_DAY;
  const dayStart = new Date(now);
  dayStart.setUTCHours(0, 0, 0, 0);
  const sinceToday = dayStart.getTime();

  const userUnion = `
    SELECT vk_user_id, created_at AS ts FROM words WHERE ${excludeSql(1)}
    UNION ALL
    SELECT vk_user_id, created_at AS ts FROM word_sets WHERE ${excludeSql(1)}
    UNION ALL
    SELECT vk_user_id, created_at AS ts FROM practice_sessions WHERE ${excludeSql(1)}
    UNION ALL
    SELECT s.vk_user_id, m.created_at AS ts
      FROM practice_messages m
      JOIN practice_sessions s ON s.id = m.session_id
     WHERE ${excludeSql(1).replace(/vk_user_id/g, 's.vk_user_id')}
  `;

  const [
    usersTotal,
    usersActive24h,
    usersActive7d,
    usersFirstToday,
    wordsTotal,
    words24h,
    words7d,
    words30d,
    setsTotal,
    practiceSessionsTotal,
    practiceSessions24h,
    practiceSessions7d,
    practiceMessagesTotal,
    practiceMessages24h,
    practiceFreeSessions,
    practiceExpertSessions,
    dictCacheEntries,
  ] = await Promise.all([
    scalar(
      pool,
      `SELECT COUNT(DISTINCT vk_user_id)::int AS n FROM (
         SELECT vk_user_id FROM words WHERE ${excludeSql(1)}
         UNION
         SELECT vk_user_id FROM word_sets WHERE ${excludeSql(1)}
         UNION
         SELECT vk_user_id FROM practice_sessions WHERE ${excludeSql(1)}
       ) u`,
      [excludeEmpty],
    ),
    scalar(
      pool,
      `SELECT COUNT(DISTINCT vk_user_id)::int AS n FROM (${userUnion}) a WHERE ts >= $2`,
      [excludeEmpty, since24h],
    ),
    scalar(
      pool,
      `SELECT COUNT(DISTINCT vk_user_id)::int AS n FROM (${userUnion}) a WHERE ts >= $2`,
      [excludeEmpty, since7d],
    ),
    scalar(
      pool,
      `SELECT COUNT(*)::int AS n FROM (
         SELECT vk_user_id, MIN(ts) AS first_ts
           FROM (${userUnion}) x
          GROUP BY vk_user_id
       ) f WHERE first_ts >= $2`,
      [excludeEmpty, sinceToday],
    ),
    scalar(pool, `SELECT COUNT(*)::int AS n FROM words WHERE ${excludeSql(1)}`, [excludeEmpty]),
    scalar(
      pool,
      `SELECT COUNT(*)::int AS n FROM words WHERE ${excludeSql(1)} AND created_at >= $2`,
      [excludeEmpty, since24h],
    ),
    scalar(
      pool,
      `SELECT COUNT(*)::int AS n FROM words WHERE ${excludeSql(1)} AND created_at >= $2`,
      [excludeEmpty, since7d],
    ),
    scalar(
      pool,
      `SELECT COUNT(*)::int AS n FROM words WHERE ${excludeSql(1)} AND created_at >= $2`,
      [excludeEmpty, since30d],
    ),
    scalar(pool, `SELECT COUNT(*)::int AS n FROM word_sets WHERE ${excludeSql(1)}`, [excludeEmpty]),
    scalar(
      pool,
      `SELECT COUNT(*)::int AS n FROM practice_sessions WHERE ${excludeSql(1)}`,
      [excludeEmpty],
    ),
    scalar(
      pool,
      `SELECT COUNT(*)::int AS n FROM practice_sessions WHERE ${excludeSql(1)} AND updated_at >= $2`,
      [excludeEmpty, since24h],
    ),
    scalar(
      pool,
      `SELECT COUNT(*)::int AS n FROM practice_sessions WHERE ${excludeSql(1)} AND updated_at >= $2`,
      [excludeEmpty, since7d],
    ),
    scalar(
      pool,
      `SELECT COUNT(*)::int AS n FROM practice_messages m
         JOIN practice_sessions s ON s.id = m.session_id
        WHERE ${excludeSql(1).replace(/vk_user_id/g, 's.vk_user_id')}`,
      [excludeEmpty],
    ),
    scalar(
      pool,
      `SELECT COUNT(*)::int AS n FROM practice_messages m
         JOIN practice_sessions s ON s.id = m.session_id
        WHERE ${excludeSql(1).replace(/vk_user_id/g, 's.vk_user_id')} AND m.created_at >= $2`,
      [excludeEmpty, since24h],
    ),
    scalar(
      pool,
      `SELECT COUNT(*)::int AS n FROM practice_sessions WHERE ${excludeSql(1)} AND mode = 'free'`,
      [excludeEmpty],
    ),
    scalar(
      pool,
      `SELECT COUNT(*)::int AS n FROM practice_sessions WHERE ${excludeSql(1)} AND mode = 'expert'`,
      [excludeEmpty],
    ),
    scalar(pool, `SELECT COUNT(*)::int AS n FROM dictionary_generation_cache`, []),
  ]);

  const { rows: topExperts } = await pool.query(
    `SELECT expert_id, COUNT(*)::int AS sessions
       FROM practice_sessions
      WHERE mode = 'expert' AND expert_id IS NOT NULL AND ${excludeSql(1)}
      GROUP BY expert_id
      ORDER BY sessions DESC
      LIMIT 8`,
    [excludeEmpty],
  );

  const { rows: recentUsers } = await pool.query(
    `SELECT vk_user_id, MAX(ts) AS last_ts, COUNT(*)::int AS events
       FROM (${userUnion}) a
      GROUP BY vk_user_id
      ORDER BY last_ts DESC
      LIMIT 12`,
    [excludeEmpty],
  );

  return {
    generatedAt: new Date(now).toISOString(),
    timezone: 'UTC',
    excludedUserIds: exclude,
    users: {
      total: usersTotal,
      active24h: usersActive24h,
      active7d: usersActive7d,
      newToday: usersFirstToday,
    },
    words: { total: wordsTotal, last24h: words24h, last7d: words7d, last30d: words30d },
    sets: { total: setsTotal },
    practice: {
      sessionsTotal: practiceSessionsTotal,
      sessions24h: practiceSessions24h,
      sessions7d: practiceSessions7d,
      messagesTotal: practiceMessagesTotal,
      messages24h: practiceMessages24h,
      freeSessions: practiceFreeSessions,
      expertSessions: practiceExpertSessions,
      topExperts: topExperts.map((r) => ({
        expertId: r.expert_id,
        sessions: Number(r.sessions),
      })),
    },
    dictionaryCache: { entries: dictCacheEntries },
    recentUsers: recentUsers.map((r) => ({
      userId: Number(r.vk_user_id),
      lastActivityAt: new Date(Number(r.last_ts)).toISOString(),
      eventCount: Number(r.events),
    })),
  };
}

/** Human-readable report for SSH / cron. */
export function formatUsageStatsText(stats) {
  const lines = [
    `Seashell usage — ${stats.generatedAt} (${stats.timezone})`,
    '',
    `Users: ${stats.users.total} total | ${stats.users.active24h} active 24h | ${stats.users.active7d} active 7d | ${stats.users.newToday} new today`,
    `Words: ${stats.words.total} total | +${stats.words.last24h} 24h | +${stats.words.last7d} 7d | +${stats.words.last30d} 30d`,
    `Sets: ${stats.sets.total}`,
    `Practice: ${stats.practice.sessionsTotal} sessions (${stats.practice.freeSessions} free, ${stats.practice.expertSessions} expert)`,
    `  sessions 24h: ${stats.practice.sessions24h} | 7d: ${stats.practice.sessions7d}`,
    `  messages: ${stats.practice.messagesTotal} total | +${stats.practice.messages24h} 24h`,
  ];

  if (stats.practice.topExperts?.length) {
    lines.push('  top experts: ' + stats.practice.topExperts.map((e) => `${e.expertId}(${e.sessions})`).join(', '));
  }

  if (stats.recentUsers?.length) {
    lines.push('', 'Recent users (id / last activity):');
    for (const u of stats.recentUsers) {
      lines.push(`  ${u.userId} — ${u.lastActivityAt}`);
    }
  }

  if (stats.excludedUserIds?.length) {
    lines.push('', `Excluded test ids: ${stats.excludedUserIds.join(', ')}`);
  }

  return lines.join('\n');
}

function formatMskDate(iso) {
  try {
    return new Date(iso).toLocaleString('ru-RU', {
      timeZone: 'Europe/Moscow',
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

/** Compact Russian report for Telegram (daily cron). */
export function formatUsageStatsTelegram(stats) {
  const when = formatMskDate(stats.generatedAt);
  const lines = [
    `📊 Seashell — отчёт`,
    when + ' МСК',
    '',
    `👥 Пользователи: ${stats.users.total} всего · ${stats.users.active24h} за 24ч · ${stats.users.newToday} новых сегодня · ${stats.users.active7d} за 7д`,
    `📖 Слова: ${stats.words.total} (+${stats.words.last24h} / 24ч, +${stats.words.last7d} / 7д, +${stats.words.last30d} / 30д)`,
    `📁 Группы: ${stats.sets.total}`,
    `💬 Практика: ${stats.practice.sessionsTotal} сессий (${stats.practice.freeSessions} free, ${stats.practice.expertSessions} expert)`,
    `   за 24ч: ${stats.practice.sessions24h} сессий, ${stats.practice.messages24h} сообщений`,
  ];

  if (stats.practice.topExperts?.length) {
    const top = stats.practice.topExperts
      .slice(0, 5)
      .map((e) => `${e.expertId}(${e.sessions})`)
      .join(', ');
    lines.push(`   топ экспертов: ${top}`);
  }

  if (stats.recentUsers?.length) {
    lines.push('', 'Последняя активность:');
    for (const u of stats.recentUsers.slice(0, 6)) {
      lines.push(`• ${u.userId} — ${formatMskDate(u.lastActivityAt)}`);
    }
  }

  return lines.join('\n');
}
