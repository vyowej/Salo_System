import assert from 'node:assert/strict';
import test from 'node:test';
import { DEMO_SEED } from './seedData.js';
import { demoAdapter } from './demoAdapter.js';
import {
  createDefaultOperatingHours,
  isRestaurantOpen,
  validateOperatingHours,
} from './operatingHours.js';

function setPeriods(hours, day, periods) {
  hours.weeklySchedule[day] = { closed: false, periods };
  return hours;
}

test('opening checks handle multiple daily periods and their boundaries', () => {
  const hours = createDefaultOperatingHours();
  setPeriods(hours, 'monday', [
    { open: '09:00', close: '12:00' },
    { open: '14:00', close: '18:00' },
  ]);
  assert.equal(isRestaurantOpen(hours, [], new Date(2026, 10, 9, 10, 0)), true);
  assert.equal(isRestaurantOpen(hours, [], new Date(2026, 10, 9, 13, 0)), false);
  assert.equal(isRestaurantOpen(hours, [], new Date(2026, 10, 9, 18, 0)), false);
});

test('overnight periods stay open after midnight on the following day', () => {
  const hours = createDefaultOperatingHours();
  setPeriods(hours, 'monday', [{ open: '18:00', close: '02:00' }]);
  assert.equal(isRestaurantOpen(hours, [], new Date(2026, 10, 9, 23, 0)), true);
  assert.equal(isRestaurantOpen(hours, [], new Date(2026, 10, 10, 1, 30)), true);
  assert.equal(isRestaurantOpen(hours, [], new Date(2026, 10, 10, 2, 0)), false);
});

test('Monday overnight spillover is attributed to Monday even when Tuesday is closed', () => {
  const hours = createDefaultOperatingHours();
  setPeriods(hours, 'monday', [{ open: '18:00', close: '02:00' }]);
  hours.weeklySchedule.tuesday = { closed: true, periods: [] };
  assert.equal(isRestaurantOpen(hours, [], new Date(2026, 10, 10, 1, 30)), true);
});

test('temporary closures override weekly hours for every date in their range', () => {
  const hours = createDefaultOperatingHours();
  const closures = [{
    type: 'Holiday',
    startDate: '2026-11-09',
    endDate: '2026-11-10',
    reason: 'Holiday closure',
  }];
  assert.equal(isRestaurantOpen(hours, closures, new Date(2026, 10, 9, 11, 0)), false);
  assert.equal(isRestaurantOpen(hours, closures, new Date(2026, 10, 11, 11, 0)), true);
});

test('schedule validation allows overnight periods and rejects same-day or cross-day overlaps', () => {
  const hours = createDefaultOperatingHours();
  setPeriods(hours, 'monday', [
    { open: '09:00', close: '12:00' },
    { open: '14:00', close: '18:00' },
  ]);
  assert.equal(validateOperatingHours(hours), '');

  setPeriods(hours, 'monday', [
    { open: '09:00', close: '15:00' },
    { open: '14:00', close: '18:00' },
  ]);
  assert.match(validateOperatingHours(hours), /overlap/i);

  setPeriods(hours, 'monday', [{ open: '18:00', close: '02:00' }]);
  setPeriods(hours, 'tuesday', [{ open: '01:00', close: '03:00' }]);
  assert.match(validateOperatingHours(hours), /overlap/i);

  setPeriods(hours, 'tuesday', [{ open: '02:00', close: '05:00' }]);
  assert.equal(validateOperatingHours(hours), '');
});

test('schedule validation rejects invalid times and invalid temporary closure ranges', () => {
  const hours = createDefaultOperatingHours();
  setPeriods(hours, 'monday', [{ open: '09:00', close: '09:00' }]);
  assert.match(validateOperatingHours(hours), /same opening and closing/i);

  setPeriods(hours, 'monday', [{ open: '25:00', close: '09:00' }]);
  assert.match(validateOperatingHours(hours), /valid opening and closing/i);

  const withClosure = createDefaultOperatingHours();
  withClosure.temporaryClosures.push({
    type: 'Holiday',
    startDate: '2026-11-10',
    endDate: '2026-11-09',
    reason: 'Invalid range',
  });
  assert.match(validateOperatingHours(withClosure), /valid date range/i);
});

test('operating hours persist to the shared demo restaurant and activity log with before and after', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const storage = new Map([
    ['salo_demo_store_v1', JSON.stringify(DEMO_SEED)],
    ['salo_user', JSON.stringify({ id: 2, email: 'owner@salo.ph', role: 'owner' })],
  ]);
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: (key) => storage.delete(key),
    },
  });
  try {
    const current = demoAdapter.getOperatingHours('dalisay-heritage');
    current.acceptingOrders = false;
    const saved = demoAdapter.updateOperatingHours(current, 'dalisay-heritage');
    assert.equal(demoAdapter.getOperatingHours('dalisay-heritage').acceptingOrders, false);
    const activity = demoAdapter.getActivityLog('dalisay-heritage').at(-1);
    assert.equal(activity.action, 'operating-hours-updated');
    assert.equal(activity.before.acceptingOrders, true);
    assert.equal(activity.after.acceptingOrders, false);
    assert.throws(() => demoAdapter.createCustomerOrder({
      subOrders: [{ restaurantId: 'dalisay-heritage', items: [] }],
    }), /not accepting orders/i);
    current.acceptingReservations = false;
    demoAdapter.updateOperatingHours(current, 'dalisay-heritage');
    assert.throws(() => demoAdapter.createCustomerReservation({
      restaurantId: 'dalisay-heritage',
      date: '2026-12-19',
      time: '7:00 PM',
    }), /not accepting reservations/i);
    assert.equal(saved.acceptingOrders, false);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else delete globalThis.localStorage;
  }
});

test('only members with business.hours.manage may update the schedule', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key) => ({
        salo_demo_store_v1: JSON.stringify(DEMO_SEED),
        salo_user: JSON.stringify({ id: 6, email: 'reservation.staff@salo.ph', role: 'customer' }),
      })[key] ?? null,
      setItem() {},
      removeItem() {},
    },
  });
  try {
    assert.throws(
      () => demoAdapter.updateOperatingHours(demoAdapter.getOperatingHours('dalisay-heritage'), 'dalisay-heritage'),
      /do not have permission/i,
    );
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else delete globalThis.localStorage;
  }
});
