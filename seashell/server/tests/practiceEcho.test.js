import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { echoReflectsUserInput, sanitizePracticeEcho, sanitizeWordPracticeEcho, sanitizeWordPracticeCorrections } from '../practiceEcho.js';

describe('practiceEcho', () => {
  it('accepts light grammar fixes', () => {
    const user = 'How is it affecting our well-being?';
    const echo = 'How does it affect our well-being?';
    assert.equal(echoReflectsUserInput(user, echo), true);
    assert.equal(sanitizePracticeEcho(user, echo), echo);
  });

  it('rejects invented questions', () => {
    const user = 'Up to u';
    const echo = 'What kind of topics can we discuss?';
    assert.equal(echoReflectsUserInput(user, echo), false);
    assert.equal(sanitizePracticeEcho(user, echo), user);
  });

  it('falls back to user text when echo is empty', () => {
    assert.equal(sanitizePracticeEcho('Sure thing', null), 'Sure thing');
  });

  it('preserves target phrase in word drill echo', () => {
    const user = "I'm free as of today";
    const echo = "I'm free starting today";
    assert.equal(sanitizeWordPracticeEcho(user, echo, 'as of tomorrow'), user);
  });

  it('allows naturalness corrections when target phrase was used', () => {
    const user = 'Being drunk she moved in zigzags';
    const corrections = 'Нужна запятая: "Being drunk, she moved in zigzags."';
    assert.equal(sanitizeWordPracticeCorrections(user, corrections, 'in zigzags'), corrections);
  });

  it('still blocks synonym swap for the practiced phrase', () => {
    const user = "I'm free as of today";
    const corrections = "Maybe you meant: I'm free starting today?";
    assert.equal(sanitizeWordPracticeCorrections(user, corrections, 'as of tomorrow'), null);
  });
});
