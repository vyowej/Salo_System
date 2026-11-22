import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyAuditDisplay, formatAuditValue } from '../features/admin/utils/auditDisplay.js';

test('email_otp_sent without values renders as event-only without value change cards', () => {
  const result = classifyAuditDisplay({
    action: 'email_otp_sent',
    previousValue: null,
    newValue: null,
    reason: 'OTP verification email sent (purpose: rider_application)',
  });

  assert.equal(result.mode, 'event');
  assert.equal(result.hasEventContext, false);
  assert.equal(result.prevFormatted.isEmpty, true);
  assert.equal(result.nextFormatted.isEmpty, true);
});

test('historical email_otp_sent with legacy new_values renders as event context, not value changes', () => {
  const result = classifyAuditDisplay({
    action: 'email_otp_sent',
    previousValue: null,
    newValue: JSON.stringify({
      email: 'ty2020501076@wmsu.edu.ph',
      purpose: 'rider_application',
    }),
    reason: null,
  });

  assert.equal(result.mode, 'event');
  assert.equal(result.hasEventContext, true);
  assert.equal(result.nextFormatted.isJson, true);
});

test('email_otp_verified with real email_verified_at change renders as value diff', () => {
  const result = classifyAuditDisplay({
    action: 'email_otp_verified',
    previousValue: JSON.stringify({ email_verified_at: null }),
    newValue: JSON.stringify({ email_verified_at: '2026-11-22T09:00:00+08:00' }),
    reason: 'Email verified via OTP (purpose: rider_application)',
  });

  assert.equal(result.mode, 'diff');
  assert.equal(result.prevFormatted.isEmpty, false);
  assert.equal(result.nextFormatted.isEmpty, false);
});

test('record modification events preserve Previous Value and New Value diff', () => {
  const result = classifyAuditDisplay({
    action: 'admin_restaurant_status_updated',
    previousValue: JSON.stringify({ restaurant_status: 'active' }),
    newValue: JSON.stringify({ restaurant_status: 'suspended' }),
    reason: 'Policy review',
  });

  assert.equal(result.mode, 'diff');
  assert.equal(formatAuditValue(null).isEmpty, true);
});
