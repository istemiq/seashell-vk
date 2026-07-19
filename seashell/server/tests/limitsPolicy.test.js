import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FREE_PRACTICE_BATCH,
  FREE_PRACTICE_PER_AD,
  FREE_WORDS_BATCH,
  FREE_WORDS_PER_AD,
  practiceBatchLimit,
  wordsBatchLimit,
} from '../limitsPolicy.js';

test('wordsBatchLimit is fixed per ad window', () => {
  assert.equal(wordsBatchLimit(), FREE_WORDS_BATCH);
  assert.equal(FREE_WORDS_BATCH, 2);
  assert.equal(FREE_WORDS_PER_AD, 2);
});

test('practiceBatchLimit is fixed per ad window', () => {
  assert.equal(practiceBatchLimit(), FREE_PRACTICE_BATCH);
  assert.equal(FREE_PRACTICE_BATCH, 3);
  assert.equal(FREE_PRACTICE_PER_AD, 3);
});
