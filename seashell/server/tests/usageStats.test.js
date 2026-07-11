import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseExcludedUserIds,
  formatUsageStatsText,
  formatUsageStatsTelegram,
} from '../usageStats.js';

describe('usageStats', () => {
  const prevReviewer = process.env.VK_REVIEWER_USER_ID;
  const prevExclude = process.env.ADMIN_EXCLUDE_USER_IDS;

  beforeEach(() => {
    delete process.env.ADMIN_EXCLUDE_USER_IDS;
  });

  afterEach(() => {
    if (prevReviewer === undefined) delete process.env.VK_REVIEWER_USER_ID;
    else process.env.VK_REVIEWER_USER_ID = prevReviewer;
    if (prevExclude === undefined) delete process.env.ADMIN_EXCLUDE_USER_IDS;
    else process.env.ADMIN_EXCLUDE_USER_IDS = prevExclude;
  });

  it('parseExcludedUserIds includes reviewer and extra ids', () => {
    process.env.VK_REVIEWER_USER_ID = '1';
    process.env.ADMIN_EXCLUDE_USER_IDS = '42, 826648841';
    const ids = parseExcludedUserIds();
    assert.deepEqual(ids.sort((a, b) => a - b), [1, 42, 826648841]);
  });

  it('formatUsageStatsText includes main counters', () => {
    const text = formatUsageStatsText({
      generatedAt: '2026-06-29T12:00:00.000Z',
      timezone: 'UTC',
      excludedUserIds: [1],
      users: { total: 10, active24h: 3, active7d: 7, newToday: 1 },
      words: { total: 50, last24h: 5, last7d: 12, last30d: 20 },
      sets: { total: 8 },
      practice: {
        sessionsTotal: 4,
        sessions24h: 2,
        sessions7d: 3,
        messagesTotal: 30,
        messages24h: 8,
        freeSessions: 2,
        expertSessions: 2,
        topExperts: [{ expertId: 'socrates', sessions: 2 }],
      },
      recentUsers: [{ userId: 99, lastActivityAt: '2026-06-29T11:00:00.000Z', eventCount: 3 }],
    });
    assert.match(text, /Users: 10 total/);
    assert.match(text, /Words: 50 total/);
    assert.match(text, /socrates\(2\)/);
    assert.match(text, /99 — 2026-06-29T11:00:00.000Z/);
  });

  it('formatUsageStatsTelegram uses Russian labels', () => {
    const text = formatUsageStatsTelegram({
      generatedAt: '2026-06-29T06:00:00.000Z',
      users: { total: 10, active24h: 3, active7d: 7, newToday: 1 },
      words: { total: 50, last24h: 5, last7d: 12, last30d: 20 },
      sets: { total: 8 },
      practice: {
        sessionsTotal: 4,
        sessions24h: 2,
        messages24h: 8,
        freeSessions: 2,
        expertSessions: 2,
        topExperts: [{ expertId: 'socrates', sessions: 2 }],
      },
      recentUsers: [{ userId: 99, lastActivityAt: '2026-06-29T05:00:00.000Z', eventCount: 1 }],
    });
    assert.match(text, /📊 Seashell/);
    assert.match(text, /Пользователи: 10/);
    assert.match(text, /socrates\(2\)/);
  });
});
