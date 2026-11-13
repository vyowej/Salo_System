import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeSlotAvailability,
  computeDayAvailability,
  getMonthAvailabilityMap,
  getRestaurantSlotCapacity,
  computeReservationStats,
} from './reservationAvailability.js';
import { createDefaultOperatingHours } from './operatingHours.js';

test('reservationAvailability: computes slot capacity from tables or fallback', () => {
  const restaurantWithTables = {
    tables: [
      { id: 'T1', capacity: 4, status: 'Available' },
      { id: 'T2', capacity: 6, status: 'Available' },
      { id: 'T3', capacity: 2, status: 'Maintenance' },
    ],
  };
  assert.equal(getRestaurantSlotCapacity(restaurantWithTables), 10);

  const fallback = { slotCapacity: 20 };
  assert.equal(getRestaurantSlotCapacity(fallback), 20);
});

test('reservationAvailability: evaluates slot availability based on bookings and capacity', () => {
  const restaurant = {
    operatingSchedule: createDefaultOperatingHours(),
    slotCapacity: 10,
  };

  const futureDate = '2029-12-01';
  const time = '1:00 PM';

  // Empty bookings -> Available
  const emptyRes = computeSlotAvailability(time, futureDate, restaurant, [], 2);
  assert.equal(emptyRes.status, 'available');
  assert.equal(emptyRes.remainingSeats, 10);
  assert.equal(emptyRes.canAccommodate, true);

  // Partial bookings (6 seats booked of 10)
  const partialBookings = [
    { date: futureDate, time, guests: 6, status: 'Confirmed' },
  ];
  const partialRes = computeSlotAvailability(time, futureDate, restaurant, partialBookings, 2);
  assert.equal(partialRes.status, 'limited');
  assert.equal(partialRes.remainingSeats, 4);
  assert.equal(partialRes.canAccommodate, true);

  // Requesting 5 guests when only 4 remain
  const cannotFit = computeSlotAvailability(time, futureDate, restaurant, partialBookings, 5);
  assert.equal(cannotFit.canAccommodate, false);

  // Fully booked (10 of 10)
  const fullBookings = [
    { date: futureDate, time, guests: 6, status: 'Confirmed' },
    { date: futureDate, time, guests: 4, status: 'Pending' },
  ];
  const fullRes = computeSlotAvailability(time, futureDate, restaurant, fullBookings, 1);
  assert.equal(fullRes.status, 'fully_booked');
  assert.equal(fullRes.remainingSeats, 0);
  assert.equal(fullRes.canAccommodate, false);

  // Cancelled reservation does not count
  const withCancelled = [
    { date: futureDate, time, guests: 10, status: 'Cancelled' },
  ];
  const cancelledRes = computeSlotAvailability(time, futureDate, restaurant, withCancelled, 2);
  assert.equal(cancelledRes.status, 'available');
  assert.equal(cancelledRes.remainingSeats, 10);
});

test('reservationAvailability: respects blocked time slots', () => {
  const restaurant = {
    operatingSchedule: createDefaultOperatingHours(),
    slotCapacity: 10,
  };
  const futureDate = '2029-12-01';
  const time = '2:00 PM';
  const blocked = [{ date: futureDate, time, reason: 'Private Event' }];

  const res = computeSlotAvailability(time, futureDate, restaurant, [], 2, [], blocked);
  assert.equal(res.status, 'unavailable');
  assert.equal(res.statusLabel, 'Blocked');
  assert.equal(res.isBlocked, true);
  assert.equal(res.canAccommodate, false);
});

test('reservationAvailability: computes reservation statistics across ranges', () => {
  const sampleReservations = [
    { id: '1', date: '2026-11-20', time: '12:00 PM', guests: 4, status: 'Confirmed' },
    { id: '2', date: '2026-11-20', time: '1:00 PM', guests: 2, status: 'Pending' },
    { id: '3', date: '2026-11-22', time: '7:00 PM', guests: 6, status: 'Cancelled' },
    { id: '4', date: '2026-12-05', time: '6:00 PM', guests: 8, status: 'Approved' },
  ];

  const ref = new Date('2026-11-20T12:00:00');
  const todayStats = computeReservationStats(sampleReservations, 'today', ref);
  assert.equal(todayStats.total, 2);
  assert.equal(todayStats.confirmed, 1);
  assert.equal(todayStats.pending, 1);
  assert.equal(todayStats.totalGuests, 6);

  const monthStats = computeReservationStats(sampleReservations, 'month', ref);
  assert.equal(monthStats.total, 3);
  assert.equal(monthStats.cancelled, 1);

  const allStats = computeReservationStats(sampleReservations, 'all', ref);
  assert.equal(allStats.total, 4);
});

test('reservationAvailability: computes day and month availability', () => {
  const restaurant = {
    operatingSchedule: createDefaultOperatingHours(),
    slotCapacity: 10,
  };
  const futureDate = '2029-12-01';
  const day = computeDayAvailability(futureDate, restaurant, [], 2);
  assert.equal(day.isClosed, false);
  assert.ok(Array.isArray(day.slots));
  assert.ok(day.slots.length > 0);

  const monthMap = getMonthAvailabilityMap(2029, 11, restaurant, [], 2);
  assert.ok(monthMap && typeof monthMap === 'object');
  assert.ok(monthMap[futureDate]);
});
