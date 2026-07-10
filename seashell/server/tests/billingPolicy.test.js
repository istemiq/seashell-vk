import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  SUBSCRIPTION_STARS,
  SUBSCRIPTION_CREDITS,
  CREDIT_WORD,
  CREDIT_PRACTICE,
  billingProductCatalog,
} from '../billingPolicy.js';

describe('billingPolicy', () => {
  it('default subscription is ~145 stars (~250 ₽) with 120 credits', () => {
    assert.equal(SUBSCRIPTION_STARS, 145);
    assert.equal(SUBSCRIPTION_CREDITS, 120);
    assert.equal(CREDIT_WORD, 3);
    assert.equal(CREDIT_PRACTICE, 1);
    const catalog = billingProductCatalog();
    assert.equal(catalog.subscription.stars, 145);
    assert.equal(catalog.topUp.stars, 69);
  });
});
