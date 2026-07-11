import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseChatIdList,
  resolveStatsChatIds,
} from '../telegramNotify.js';

describe('telegramNotify', () => {
  const prevStats = process.env.TELEGRAM_STATS_CHAT_IDS;
  const prevPremium = process.env.PREMIUM_USER_IDS;

  afterEach(() => {
    if (prevStats === undefined) delete process.env.TELEGRAM_STATS_CHAT_IDS;
    else process.env.TELEGRAM_STATS_CHAT_IDS = prevStats;
    if (prevPremium === undefined) delete process.env.PREMIUM_USER_IDS;
    else process.env.PREMIUM_USER_IDS = prevPremium;
  });

  it('parseChatIdList splits comma-separated ids', () => {
    assert.deepEqual(parseChatIdList('42, 1001;2002'), [42, 1001, 2002]);
  });

  it('resolveStatsChatIds uses only TELEGRAM_STATS_CHAT_IDS', () => {
    process.env.TELEGRAM_STATS_CHAT_IDS = '111';
    process.env.PREMIUM_USER_IDS = '222';
    assert.deepEqual(resolveStatsChatIds(), [111]);
  });

  it('resolveStatsChatIds returns empty without explicit env', () => {
    delete process.env.TELEGRAM_STATS_CHAT_IDS;
    process.env.PREMIUM_USER_IDS = '333,444';
    assert.deepEqual(resolveStatsChatIds(), []);
  });
});
