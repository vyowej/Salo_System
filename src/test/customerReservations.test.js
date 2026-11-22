import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createServer } from 'vite';

const ROOT_DIR = fileURLToPath(new URL('../../', import.meta.url));

test('customerService reservation booking, list, detail, cancel, and error codes/suggestedAlternatives work', async () => {
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
    const { clearCsrfCache } = await server.ssrLoadModule('/src/services/apiClient.js');
    const { customerService, normalizeReservation } = await server.ssrLoadModule('/src/services/customerService.js');

    clearCsrfCache();

    globalThis.fetch = async (url, init = {}) => {
      calls.push({
        url,
        method: init.method || 'GET',
        body: init.body ? JSON.parse(init.body) : null,
      });

      if (url.endsWith('/auth/csrf')) {
        return new Response(JSON.stringify({ success: true, data: { csrf_token: 'cust-res-csrf' } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.endsWith('/customer/reservations') && init.method === 'POST') {
        const body = JSON.parse(init.body);
        if (body.start === '2026-11-24T18:00') {
          return new Response(
            JSON.stringify({
              success: false,
              code: 'FULLY_BOOKED',
              reason_code: 'FULLY_BOOKED',
              message: 'All suitable tables are already reserved for this time slot.',
              suggested_alternatives: [
                {
                  start: '2026-11-24T18:30:00+08:00',
                  end: '2026-11-24T20:00:00+08:00',
                  time: '18:30',
                  time_label: '6:30 PM',
                  available_table_count: 2,
                },
              ],
            }),
            { status: 409, headers: { 'Content-Type': 'application/json' } },
          );
        }

        return new Response(
          JSON.stringify({
            success: true,
            data: {
              reservation: {
                reservation_id: 101,
                reservation_reference: 'SALO-RES-20261123-BK01',
                restaurant_id: body.restaurant_id,
                restaurant_name: 'Dalisay Heritage Grill',
                customer_id: 5,
                contact_name: body.contact_name || 'Maria Santos',
                contact_phone: body.contact_phone || '09171234567',
                table_id: 9,
                table: {
                  table_id: 9,
                  table_name: 'T-04',
                  dining_area: 'Terrace',
                  seating_capacity: 4,
                  min_party_size: 2,
                },
                reservation_start: '2026-11-24T19:00:00+08:00',
                reservation_end: '2026-11-24T20:30:00+08:00',
                reservation_date: '2026-11-24',
                reservation_time: '19:00',
                number_of_guests: body.party_size,
                reservation_status: 'pending',
                deposit_amount: '0.00',
                deposit_status: 'none',
                service_fee: '25.00',
                special_requests: body.special_requests,
                can_cancel: true,
                is_upcoming: true,
                assigned_dining_area_differs: false,
              },
            },
          }),
          { status: 201, headers: { 'Content-Type': 'application/json' } },
        );
      }

      if (url.includes('/customer/reservations') && (init.method || 'GET') === 'GET' && !url.endsWith('/101')) {
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              items: [
                {
                  reservation_id: 101,
                  reservation_reference: 'SALO-RES-20261123-BK01',
                  restaurant_id: 7,
                  restaurant_name: 'Dalisay Heritage Grill',
                  table_id: 9,
                  table: { table_id: 9, table_name: 'T-04', dining_area: 'Terrace', seating_capacity: 4 },
                  reservation_start: '2026-11-24T19:00:00+08:00',
                  reservation_end: '2026-11-24T20:30:00+08:00',
                  reservation_date: '2026-11-24',
                  reservation_time: '19:00',
                  number_of_guests: 4,
                  reservation_status: 'pending',
                  deposit_amount: '0.00',
                  deposit_status: 'none',
                  service_fee: '25.00',
                  can_cancel: true,
                  is_upcoming: true,
                },
              ],
              pagination: { current_page: 1, per_page: 15, total: 1, last_page: 1 },
              summary: {
                total: 1,
                upcoming: 1,
                pending: 1,
                completed: 0,
                cancelled_or_declined: 0,
              },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      if (url.endsWith('/customer/reservations/101') && (init.method || 'GET') === 'GET') {
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              reservation: {
                reservation_id: 101,
                reservation_reference: 'SALO-RES-20261123-BK01',
                restaurant_id: 7,
                restaurant_name: 'Dalisay Heritage Grill',
                restaurant_address: '42 Scout Gandia St., Brgy. Laging Handa, Quezon City',
                restaurant_phone: '+63 917 555 0101',
                table_id: 9,
                table: { table_id: 9, table_name: 'T-04', dining_area: 'Terrace', seating_capacity: 4 },
                reservation_start: '2026-11-24T19:00:00+08:00',
                reservation_end: '2026-11-24T20:30:00+08:00',
                reservation_date: '2026-11-24',
                reservation_time: '19:00',
                number_of_guests: 4,
                reservation_status: 'pending',
                can_cancel: true,
                is_upcoming: true,
                status_history: [
                  {
                    history_id: 1,
                    reservation_id: 101,
                    from_status: null,
                    to_status: 'pending',
                    changed_by_role: 'customer',
                    note: 'Reservation request submitted by customer.',
                    created_at: '2026-11-23T10:00:00+08:00',
                  },
                ],
              },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      if (url.endsWith('/customer/reservations/101/cancel') && init.method === 'POST') {
        const body = JSON.parse(init.body);
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              reservation: {
                reservation_id: 101,
                reservation_reference: 'SALO-RES-20261123-BK01',
                restaurant_id: 7,
                restaurant_name: 'Dalisay Heritage Grill',
                reservation_start: '2026-11-24T19:00:00+08:00',
                reservation_end: '2026-11-24T20:30:00+08:00',
                reservation_date: '2026-11-24',
                reservation_time: '19:00',
                number_of_guests: 4,
                reservation_status: 'cancelled',
                cancelled_by: 'customer',
                cancellation_reason: body.reason || null,
                can_cancel: false,
                is_upcoming: false,
              },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      return new Response(JSON.stringify({ success: false, message: 'Not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    // 1. Create reservation
    const created = await customerService.createReservation({
      restaurantId: 7,
      start: '2026-11-24T19:00',
      partySize: 4,
      diningArea: 'Terrace',
      contactName: 'Maria Santos',
      contactPhone: '09171234567',
      specialRequests: 'Anniversary',
      idempotencyKey: 'idem-test-001',
    });

    assert.equal(created.reservationId, 101);
    assert.equal(created.reference, 'SALO-RES-20261123-BK01');
    assert.equal(created.status, 'Pending');
    assert.equal(created.statusCode, 'pending');
    assert.equal(created.tableName, 'T-04');
    assert.equal(created.seatingArea, 'Terrace');
    assert.equal(created.canCancel, true);

    // 2. 409 FULLY_BOOKED carries code & suggestedAlternatives
    await assert.rejects(
      () =>
        customerService.createReservation({
          restaurantId: 7,
          start: '2026-11-24T18:00',
          partySize: 4,
          idempotencyKey: 'idem-test-full',
        }),
      (err) =>
        err.status === 409 &&
        err.code === 'FULLY_BOOKED' &&
        Array.isArray(err.suggestedAlternatives) &&
        err.suggestedAlternatives[0].time === '18:30',
    );

    // 3. List reservations
    const list = await customerService.getReservations({ tab: 'upcoming', page: 1 });
    assert.equal(list.items.length, 1);
    assert.equal(list.summary.upcoming, 1);
    assert.equal(list.summary.pending, 1);

    // 4. Detail with status_history
    const detail = await customerService.getReservation(101);
    assert.equal(detail.restaurantPhone, '+63 917 555 0101');
    assert.equal(detail.history.length, 1);
    assert.equal(detail.history[0].toStatusLabel, 'Pending');

    // 5. Cancel reservation
    const cancelled = await customerService.cancelReservation(101, 'Change of plans');
    assert.equal(cancelled.status, 'Cancelled');
    assert.equal(cancelled.statusCode, 'cancelled');
    assert.equal(cancelled.cancellationReason, 'Change of plans');
    assert.equal(cancelled.canCancel, false);

    assert.equal(normalizeReservation(null), null);
  } finally {
    globalThis.fetch = previousFetch;
    await server.close();
  }
});

test('notificationUtils maps reservation_* notifications to category reservation and workspace routes', async () => {
  const server = await createServer({
    configFile: false,
    root: ROOT_DIR,
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent',
  });

  try {
    const {
      getNotificationCategory,
      getNotificationCategoryLabel,
      getNotificationRoute,
      normalizeNotification,
    } = await server.ssrLoadModule('/src/utils/notificationUtils.js');

    assert.equal(getNotificationCategory('reservation_requested'), 'reservation');
    assert.equal(getNotificationCategory('reservation_confirmed'), 'reservation');
    assert.equal(getNotificationCategoryLabel('reservation_cancelled_by_customer'), 'Reservation update');

    assert.equal(
      getNotificationRoute({
        workspace: 'customer',
        type: 'reservation_confirmed',
        related_entity_type: 'reservation',
        related_entity_id: 55,
      }),
      '/customer/reservations',
    );

    assert.equal(
      getNotificationRoute({
        workspace: 'restaurant',
        type: 'reservation_requested',
        related_entity_type: 'reservation',
        related_entity_id: 55,
      }),
      '/owner/reservations',
    );

    assert.equal(
      getNotificationRoute({
        workspace: 'admin',
        type: 'reservation_cancelled',
        related_entity_type: 'reservation',
        related_entity_id: 55,
      }),
      '/admin/reservations/55',
    );

    const normalized = normalizeNotification({
      notification_id: 9,
      workspace: 'customer',
      type: 'reservation_confirmed',
      title: 'Reservation Confirmed',
      body: 'Table confirmed.',
      related_entity_type: 'reservation',
      related_entity_id: 55,
    });
    assert.equal(normalized.category, 'reservation');
    assert.equal(normalized.categoryLabel, 'Reservation update');
    assert.equal(normalized.href, '/customer/reservations');
  } finally {
    await server.close();
  }
});

test('ReservationModal and ReservationsPage are wired to real APIs without not-available placeholders', async () => {
  const [modalSrc, pageSrc] = await Promise.all([
    fs.readFile(new URL('../features/customer/components/ReservationModal.jsx', import.meta.url), 'utf8'),
    fs.readFile(new URL('../features/customer/pages/ReservationsPage.jsx', import.meta.url), 'utf8'),
  ]);

  assert.equal(modalSrc.includes('not available yet'), false);
  assert.ok(modalSrc.includes('customerService.getReservationInfo'));
  assert.ok(modalSrc.includes('customerService.getReservationMonthOverview'));
  assert.ok(modalSrc.includes('customerService.getReservationAvailability'));
  assert.ok(modalSrc.includes('customerService.getReservationTables'));
  assert.ok(modalSrc.includes('customerService.createReservation'));

  assert.equal(pageSrc.includes('not available yet'), false);
  assert.equal(pageSrc.includes('/customer/restaurant/'), false);
  assert.ok(pageSrc.includes('/customer/restaurants/'));
  assert.ok(pageSrc.includes('customerService.getReservations'));
  assert.ok(pageSrc.includes('customerService.getReservation'));
  assert.ok(pageSrc.includes('customerService.cancelReservation'));
});
