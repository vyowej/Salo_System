import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  INITIAL_MOCK_SCHEDULE_REQUESTS,
  cancelScheduleChangeRequest,
  createScheduleChangeRequest,
  formatHubTags,
  getPendingScheduleRequest,
  hasPendingScheduleRequest,
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

test('createScheduleChangeRequest and cancelScheduleChangeRequest manage pending request lifecycle', () => {
  assert.equal(hasPendingScheduleRequest(INITIAL_MOCK_SCHEDULE_REQUESTS), false);
  assert.equal(getPendingScheduleRequest(INITIAL_MOCK_SCHEDULE_REQUESTS), null);

  const created = createScheduleChangeRequest(
    {
      available_days: ['tue', 'thu', 'sat'],
      preferred_shifts: ['lunch', 'dinner'],
      preferred_hubs: ['Cubao'],
      effective_date: '2026-12-05',
      reason: 'Switching to Tuesday/Thursday/Saturday availability.',
    },
    new Date('2026-11-24T09:00:00Z'),
  );

  assert.equal(created.status, 'pending');
  assert.deepEqual(created.available_days, ['tue', 'thu', 'sat']);
  assert.deepEqual(created.preferred_shifts, ['lunch', 'dinner']);
  assert.deepEqual(created.preferred_hubs, ['Cubao']);

  const withPending = [created, ...INITIAL_MOCK_SCHEDULE_REQUESTS];
  assert.equal(hasPendingScheduleRequest(withPending), true);
  assert.equal(getPendingScheduleRequest(withPending)?.id, created.id);

  const afterCancel = cancelScheduleChangeRequest(
    withPending,
    created.id,
    new Date('2026-11-24T09:10:00Z'),
  );
  assert.equal(hasPendingScheduleRequest(afterCancel), false);
  assert.equal(afterCancel[0].status, 'cancelled');
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
