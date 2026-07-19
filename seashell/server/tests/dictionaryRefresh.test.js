import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { dictionaryCacheKey } from '../db.js';
import {
  examplesOverlapRatio,
  normalizeExampleLine,
  refreshAvoidExamplesNote,
  refreshExamplesTemperature,
} from '../dictionaryRefreshHelpers.js';

describe('dictionary refresh helpers', () => {
  it('normalizeExampleLine collapses whitespace and case', () => {
    assert.equal(normalizeExampleLine('  Hello   World '), 'hello world');
  });

  it('examplesOverlapRatio counts matching new lines', () => {
    const prev = ['Take a break', 'Break the ice'];
    const same = ['Take a break', 'Break the ice', 'New one'];
    assert.equal(examplesOverlapRatio(prev, same), 2 / 3);
    const fresh = ['She took a nap', 'Ice melted fast'];
    assert.equal(examplesOverlapRatio(prev, fresh), 0);
  });

  it('refreshAvoidExamplesNote lists prior sentences', () => {
    const note = refreshAvoidExamplesNote(['Run fast', 'Slow run']);
    assert.match(note, /REGENERATION/);
    assert.match(note, /Run fast/);
    assert.match(note, /Do NOT reuse/);
  });

  it('refreshExamplesTemperature bumps low base values', () => {
    assert.equal(refreshExamplesTemperature(0.38), 0.58);
    assert.equal(refreshExamplesTemperature(0.7), 0.7);
  });
});

describe('dictionary cache key variants', () => {
  const base = {
    requestWord: 'run',
    model: 'deepseek-chat',
    promptVersion: 'v6',
    exampleCount: 10,
    contentLocale: 'ru',
  };

  it('default key has no variant segment', () => {
    const key = dictionaryCacheKey(base);
    assert.equal(key.split('\u001f').length, 5);
  });

  it('refresh variant produces a distinct cache key', () => {
    const primary = dictionaryCacheKey(base);
    const refresh = dictionaryCacheKey({ ...base, variant: 'refresh:123' });
    assert.notEqual(primary, refresh);
    assert.match(refresh, /refresh:123$/);
  });
});
