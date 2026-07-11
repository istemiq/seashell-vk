import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { timingSafeEqualString, generationErrorMessage } from '../securityHelpers.js';

describe('securityHelpers', () => {
  it('timingSafeEqualString compares equal strings', () => {
    assert.equal(timingSafeEqualString('secret', 'secret'), true);
    assert.equal(timingSafeEqualString('secret', 'other'), false);
    assert.equal(timingSafeEqualString('a', 'aa'), false);
  });

  it('generationErrorMessage hides details in production', () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    assert.equal(generationErrorMessage(new Error('OpenRouter 502')), 'Generation failed');
    process.env.NODE_ENV = prev;
  });

  it('generationErrorMessage shows details in dev', () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    assert.equal(generationErrorMessage(new Error('detail')), 'detail');
    process.env.NODE_ENV = prev;
  });
});
