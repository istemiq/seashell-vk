import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { isPremiumUser, resetPremiumCacheForTests } from '../premium.js';

describe('premium', () => {
  const prev = process.env.PREMIUM_USER_IDS;

  beforeEach(() => {
    resetPremiumCacheForTests();
  });

  afterEach(() => {
    if (prev === undefined) delete process.env.PREMIUM_USER_IDS;
    else process.env.PREMIUM_USER_IDS = prev;
    resetPremiumCacheForTests();
  });

  it('returns false when env empty', () => {
    delete process.env.PREMIUM_USER_IDS;
    resetPremiumCacheForTests();
    assert.equal(isPremiumUser(1001), false);
  });

  it('recognizes listed user ids', () => {
    process.env.PREMIUM_USER_IDS = '42, 1001';
    resetPremiumCacheForTests();
    assert.equal(isPremiumUser(1001), true);
    assert.equal(isPremiumUser(42), true);
    assert.equal(isPremiumUser(99), false);
  });
});
