import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  extractScheduleFieldErrors,
  formatHubTags,
  parseHubTags,
  toggleShiftSelection,
  validateScheduleChangeRequest,
} from '../features/rider/utils/riderScheduleRequests.js';

test('toggleShiftSelection prevents conflicting flexible and specific shift combinations', () => {
  assert.deepEqual(toggleShiftSelection(['lunch'], 'breakfast'), ['lunch', 'breakfast']);
  assert.deepEqual(toggleShiftSelection(['lunch', 'breakfast'], 'flexible'), ['flexible']);
  assert.deepEqual(toggleShiftSelection(['flexible'], 'dinner'), ['dinner']);
  assert.deepEqual(toggleShiftSelection(['flexible'], 'flexible'), []);
});

test('validateScheduleChangeRequest enforces required days, shifts, effective date, reason, and hub length', () => {
  const invalid = validateScheduleChangeRequest(
    {
      available_days: [],
      preferred_shifts: [],
      preferred_hubs: ['A'.repeat(260)],
      effective_date: '2026-11-20',
      reason: 'hey',
    },
    '2026-11-24',
  );

  assert.equal(invalid.isValid, false);
  assert.ok(invalid.errors.available_days);
  assert.ok(invalid.errors.preferred_shifts);
  assert.ok(invalid.errors.preferred_hubs);
  assert.ok(invalid.errors.effective_date);
  assert.ok(invalid.errors.reason);

  const validWithFlexible = validateScheduleChangeRequest(
    {
      available_days: ['mon', 'wed', 'fri'],
      preferred_shifts: ['flexible'],
      preferred_hubs: ['Diliman', 'Katipunan'],
      effective_date: '2026-12-01',
      reason: 'Adjusting schedule for afternoon classes.',
    },
    '2026-11-24',
  );

  assert.equal(validWithFlexible.isValid, true);
  assert.deepEqual(validWithFlexible.errors, {});
});

test('extractScheduleFieldErrors maps Laravel 422 validation errors cleanly', () => {
  const mapped = extractScheduleFieldErrors({
    errors: {
      effective_date: ['Effective date cannot be in the past.'],
      reason: 'Provide a reason.',
    },
  });
  assert.deepEqual(mapped, {
    effective_date: 'Effective date cannot be in the past.',
    reason: 'Provide a reason.',
  });
});

test('parseHubTags and formatHubTags round-trip comma-separated hub strings', () => {
  assert.deepEqual(parseHubTags('Diliman, Katipunan , Cubao'), ['Diliman', 'Katipunan', 'Cubao']);
  assert.equal(formatHubTags(['Diliman', 'Katipunan']), 'Diliman, Katipunan');
});

test('RiderSchedulePage enforces read-only approved availability and preserves Manage Online Status', () => {
  const pageSource = fs.readFileSync(
    path.resolve('src/features/rider/pages/RiderSchedulePage.jsx'),
    'utf8',
  );
  assert.ok(pageSource.includes('Manage Online Status'));
  assert.ok(pageSource.includes('/rider/go-online'));
  assert.ok(pageSource.includes('Request Schedule Change'));
  assert.ok(
    pageSource.includes('Your approved availability is shown here. Changes to your schedule require approval.'),
  );
  assert.equal(pageSource.includes('updateProfile'), false);
  assert.equal(pageSource.includes('Save Schedule'), false);
});
