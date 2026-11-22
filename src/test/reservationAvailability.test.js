import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createServer } from 'vite';

const ROOT_DIR = fileURLToPath(new URL('../../', import.meta.url));

test('publicRestaurantService maps new reservation policy fields and canReserve from GET /api/restaurants/{id}', async () => {
  const server = await createServer({
    configFile: false,
    root: ROOT_DIR,
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent',
  });

  const previousFetch = globalThis.fetch;

  try {
    const { publicRestaurantService } = await server.ssrLoadModule('/src/services/publicRestaurantService.js');

    globalThis.fetch = async (url) => {
      if (url.endsWith('/restaurants/7')) {
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              restaurant: {
                id: 7,
                name: 'Dalisay Grill',
                business_type: 'restaurant',
                offers: { delivery: true, pickup: true, dine_in: true, reservations: true },
                can_reserve: true,
                reservation_min_notice_hours: 3,
                reservation_max_party_size: 10,
                reservation_notes: 'Smart casual required.',
                reservation_duration_minutes: 120,
                reservation_max_advance_days: 45,
                reservation_cancellation_cutoff_minutes: 180,
                reservation_deposit_required: true,
                reservation_deposit_amount: '250.00',
                reservation_service_fee: '35.00',
                availability: {
                  is_open: true,
                  status_label: 'Open',
                  accepting_orders: true,
                  accepting_reservations: true,
                  can_reserve: true,
                },
                operating_hours: [],
              },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      if (url.endsWith('/restaurants/7/menu')) {
        return new Response(
          JSON.stringify({
            success: true,
            data: { restaurant_id: 7, categories: [] },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      return new Response(JSON.stringify({ success: false, message: 'Not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const detail = await publicRestaurantService.getRestaurantWithMenu(7);
    assert.equal(detail.canReserve, true);
    assert.equal(detail.reservationMinNoticeHours, 3);
    assert.equal(detail.reservationMaxPartySize, 10);
    assert.equal(detail.reservationNotes, 'Smart casual required.');
    assert.equal(detail.reservationDurationMinutes, 120);
    assert.equal(detail.reservationMaxAdvanceDays, 45);
    assert.equal(detail.reservationCancellationCutoffMinutes, 180);
    assert.equal(detail.reservationDepositRequired, true);
    assert.equal(detail.reservationDepositAmount, 250);
    assert.equal(detail.reservationServiceFee, 35);
    assert.equal(detail.fulfillment.reservations, true);
  } finally {
    globalThis.fetch = previousFetch;
    await server.close();
  }
});

test('customerService reservation availability methods call public endpoints, normalize responses, and propagate errors', async () => {
  const server = await createServer({
    configFile: false,
    root: ROOT_DIR,
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent',
  });

  const previousFetch = globalThis.fetch;
  const calls = [];

  try {
    const { customerService } = await server.ssrLoadModule('/src/services/customerService.js');

    globalThis.fetch = async (url) => {
      calls.push(url);

      if (url.endsWith('/restaurants/7/reservation-info')) {
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              restaurant_id: 7,
              restaurant_name: 'Dalisay Grill',
              bookable: true,
              can_reserve: true,
              reason_code: null,
              message: 'Restaurant accepts table reservations.',
              offers_dine_in: true,
              accepts_reservations: true,
              accepting_reservations: true,
              is_open: true,
              status_label: 'Open',
              reservation_min_notice_hours: 2,
              reservation_max_party_size: 8,
              effective_max_party_size: 8,
              smallest_min_party_size: 1,
              reservation_notes: 'Patio open.',
              reservation_duration_minutes: 90,
              reservation_max_advance_days: 30,
              reservation_cancellation_cutoff_minutes: 120,
              reservation_auto_confirm: true,
              reservation_deposit_required: false,
              reservation_deposit_amount: '0.00',
              reservation_service_fee: '20.00',
              slot_interval_minutes: 30,
              dining_areas: ['Indoor', 'Terrace'],
              active_table_count: 5,
              largest_table_capacity: 8,
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      if (url.includes('/restaurants/7/reservation-availability/month?')) {
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              restaurant_id: 7,
              month: '2026-11',
              party_size: 4,
              bookable: true,
              reason_code: null,
              message: 'Monthly reservation availability retrieved.',
              days: [
                { date: '2026-11-23', status: 'available', available_slots: 6, total_slots: 8, reason_code: null },
                { date: '2026-11-24', status: 'limited', available_slots: 2, total_slots: 8, reason_code: null },
                { date: '2026-11-25', status: 'full', available_slots: 0, total_slots: 8, reason_code: 'FULLY_BOOKED' },
              ],
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      if (url.includes('/restaurants/7/reservation-availability/tables?')) {
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              restaurant_id: 7,
              start: '2026-11-24T19:00:00+08:00',
              end: '2026-11-24T20:30:00+08:00',
              party_size: 4,
              dining_area: 'Terrace',
              duration_minutes: 90,
              bookable: true,
              reason_code: null,
              message: 'Available tables retrieved.',
              available_tables: [
                {
                  table_id: 21,
                  table_name: 'T-03',
                  seating_capacity: 4,
                  min_party_size: 2,
                  dining_area: 'Terrace',
                  description: 'Sunset table',
                },
              ],
              suggested_alternatives: [],
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      if (url.includes('/restaurants/7/reservation-availability?')) {
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              restaurant_id: 7,
              date: '2026-11-24',
              party_size: 4,
              dining_area: 'Terrace',
              duration_minutes: 90,
              bookable: true,
              is_closed: false,
              closure_reason: null,
              total_slots: 2,
              available_slots: 1,
              first_available_slot: '2026-11-24T19:00:00+08:00',
              reason_code: null,
              message: 'Available reservation times retrieved.',
              slots: [
                {
                  start: '2026-11-24T18:30:00+08:00',
                  end: '2026-11-24T20:00:00+08:00',
                  time: '18:30',
                  time_label: '6:30 PM',
                  available: false,
                  available_table_count: 0,
                  reason_code: 'FULLY_BOOKED',
                  dining_areas_available: [],
                },
                {
                  start: '2026-11-24T19:00:00+08:00',
                  end: '2026-11-24T20:30:00+08:00',
                  time: '19:00',
                  time_label: '7:00 PM',
                  available: true,
                  available_table_count: 2,
                  reason_code: null,
                  dining_areas_available: ['Terrace'],
                },
              ],
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      if (url.includes('/restaurants/404/')) {
        return new Response(
          JSON.stringify({ success: false, message: 'Restaurant not found.' }),
          { status: 404, headers: { 'Content-Type': 'application/json' } },
        );
      }

      return new Response(
        JSON.stringify({
          success: false,
          message: 'The given data was invalid.',
          errors: { party_size: ['The party size field must be at least 1.'] },
        }),
        { status: 422, headers: { 'Content-Type': 'application/json' } },
      );
    };

    const info = await customerService.getReservationInfo(7);
    assert.equal(info.restaurantId, 7);
    assert.equal(info.canReserve, true);
    assert.equal(info.reservationAutoConfirm, true);
    assert.equal(info.reservationServiceFee, 20);
    assert.deepEqual(info.diningAreas, ['Indoor', 'Terrace']);

    const month = await customerService.getReservationMonthOverview(7, '2026-11', 4);
    assert.equal(month.month, '2026-11');
    assert.equal(month.days.length, 3);
    assert.equal(month.days[0].status, 'available');
    assert.equal(month.days[0].availableSlots, 6);
    assert.equal(month.days[2].reasonCode, 'FULLY_BOOKED');

    const day = await customerService.getReservationAvailability(7, '2026-11-24', 4, 'Terrace');
    assert.equal(day.bookable, true);
    assert.equal(day.availableSlots, 1);
    assert.equal(day.slots[0].available, false);
    assert.equal(day.slots[0].reasonCode, 'FULLY_BOOKED');
    assert.equal(day.slots[1].timeLabel, '7:00 PM');
    assert.equal(day.slots[1].availableTableCount, 2);
    assert.deepEqual(day.slots[1].diningAreasAvailable, ['Terrace']);

    const slotTables = await customerService.getReservationTables(7, '2026-11-24T19:00', 4, 'Terrace');
    assert.equal(slotTables.bookable, true);
    assert.equal(slotTables.availableTables.length, 1);
    assert.equal(slotTables.availableTables[0].tableId, 21);
    assert.equal(slotTables.availableTables[0].tableName, 'T-03');
    assert.equal(slotTables.availableTables[0].capacity, 4);
    assert.equal(slotTables.availableTables[0].minPartySize, 2);

    // 404 propagation
    await assert.rejects(
      () => customerService.getReservationInfo(404),
      (err) => err.status === 404 && err.message === 'Restaurant not found.',
    );

    // 422 propagation
    await assert.rejects(
      () => customerService.getReservationAvailability(99, '2026-11-24', 0),
      (err) => err.status === 422 && err.message.includes('party size'),
    );
  } finally {
    globalThis.fetch = previousFetch;
    await server.close();
  }
});
