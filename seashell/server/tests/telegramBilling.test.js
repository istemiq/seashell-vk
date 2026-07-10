import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { buildInvoicePayload, parseInvoicePayload } from '../telegramBilling.js';
import { BILLING_PRODUCT_SUBSCRIPTION, BILLING_PRODUCT_TOPUP } from '../billingPolicy.js';

describe('telegramBilling payload', () => {
  const prevSecret = process.env.BILLING_PAYLOAD_SECRET;

  beforeEach(() => {
    process.env.BILLING_PAYLOAD_SECRET = 'test-secret-key';
  });

  afterEach(() => {
    if (prevSecret === undefined) delete process.env.BILLING_PAYLOAD_SECRET;
    else process.env.BILLING_PAYLOAD_SECRET = prevSecret;
  });

  it('round-trips signed subscription payload', () => {
    const payload = buildInvoicePayload(4242, BILLING_PRODUCT_SUBSCRIPTION);
    const parsed = parseInvoicePayload(payload);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.userId, 4242);
    assert.equal(parsed.product, BILLING_PRODUCT_SUBSCRIPTION);
  });

  it('round-trips top-up payload', () => {
    const payload = buildInvoicePayload(99, BILLING_PRODUCT_TOPUP);
    const parsed = parseInvoicePayload(payload);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.product, BILLING_PRODUCT_TOPUP);
  });

  it('rejects tampered signature', () => {
    const payload = buildInvoicePayload(1, BILLING_PRODUCT_SUBSCRIPTION);
    const parsed = parseInvoicePayload(`${payload}x`);
    assert.equal(parsed.ok, false);
  });
});
