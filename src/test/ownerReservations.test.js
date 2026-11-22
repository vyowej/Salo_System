import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createServer } from 'vite';

const ROOT_DIR = fileURLToPath(new URL('../../', import.meta.url));

test('ownerService reservation methods normalize responses, dispatch updates, and propagate errors', async () => {
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
    const { ownerService, normalizeOwnerReservation } = await server.ssrLoadModule('/src/services/ownerService.js');

    clearCsrfCache();

    globalThis.fetch = async (url, init = {}) => {
      calls.push({ url, method: init.method || 'GET', body: init.body ? JSON.parse(init.body) : null });

      if (url.endsWith('/auth/csrf')) {
        return new Response(JSON.stringify({ success: true, data: { csrf_token: 'owner-res-csrf' } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.includes('/restaurant/reservations/calendar?')) {
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              restaurant_id: 3,
              month: '2026-11',
              days: [{ date: '2026-11-23', total: 2, pending: 1, confirmed: 1, in_house: 0, completed: 0, cancelled_or_missed: 0, covers: 6 }],
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      if (url.includes('/restaurant/reservations?')) {
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              items: [
                {
                  reservation_id: 42,
                  reservation_reference: 'SALO-RES-20261123-OW01',
                  restaurant_id: 3,
                  customer_id: 9,
                  contact_name: 'Maria Santos',
                  contact_phone: '09171234567',
                  customer_email: 'maria@example.com',
                  table_id: 5,
                  table: { table_id: 5, table_name: 'T-02', dining_area: 'Terrace', seating_capacity: 4 },
                  reservation_start: '2026-11-23T18:30:00+08:00',
                  reservation_end: '2026-11-23T20:00:00+08:00',
                  reservation_date: '2026-11-23',
                  reservation_time: '18:30',
                  number_of_guests: 4,
                  reservation_status: 'pending',
                  status_label: 'Pending',
                  guest_history: { visits: 3, no_shows: 1, cancellations: 0 },
                  allowed_actions: ['approve', 'reject', 'reassign_table', 'cancel'],
                  attention: 'pending_expiring',
                },
              ],
              pagination: { current_page: 1, last_page: 1, per_page: 20, total: 1 },
              summary: {
                total: 1,
                pending: 1,
                confirmed: 0,
                awaiting_payment: 0,
                in_house: 0,
                completed: 0,
                cancelled_or_missed: 0,
                expected_covers: 4,
                pending_total_upcoming: 2,
              },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      if (url.includes('/restaurant/reservations/42/approve')) {
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              reservation: {
                reservation_id: 42,
                reservation_reference: 'SALO-RES-20261123-OW01',
                reservation_status: 'confirmed',
                status_label: 'Confirmed',
                allowed_actions: ['arrived', 'seat', 'reassign_table', 'cancel'],
              },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      if (url.includes('/restaurant/reservations/42/table')) {
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              reservation: {
                reservation_id: 42,
                table_id: 8,
                table: { table_id: 8, table_name: 'T-05', dining_area: 'Indoor' },
              },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      if (url.includes('/restaurant/reservations/99/no-show')) {
        return new Response(
          JSON.stringify({
            success: false,
            code: 'NO_SHOW_TOO_EARLY',
            message: 'Cannot mark as no-show until after the 15-minute grace period.',
          }),
          { status: 409, headers: { 'Content-Type': 'application/json' } },
        );
      }

      return new Response(JSON.stringify({ success: false, message: 'Not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const list = await ownerService.getReservations(3, { date: '2026-11-23' });
    assert.equal(list.items.length, 1);
    assert.equal(list.items[0].reference, 'SALO-RES-20261123-OW01');
    assert.equal(list.items[0].attention, 'pending_expiring');
    assert.equal(list.items[0].guestHistory.visits, 3);
    assert.equal(list.items[0].guestHistory.noShows, 1);
    assert.deepEqual(list.items[0].allowedActions, ['approve', 'reject', 'reassign_table', 'cancel']);
    assert.equal(list.summary.pendingTotalUpcoming, 2);

    const cal = await ownerService.getReservationCalendar(3, '2026-11');
    assert.equal(cal.days[0].covers, 6);

    const approved = await ownerService.updateReservationStatus(3, 42, 'approve');
    assert.equal(approved.statusCode, 'confirmed');

    const reassigned = await ownerService.assignReservationTable(3, 42, 8);
    assert.equal(reassigned.tableId, 8);
    assert.equal(reassigned.tableName, 'T-05');

    await assert.rejects(
      () => ownerService.markReservationNoShow(3, 99),
      (err) => err.status === 409 && err.code === 'NO_SHOW_TOO_EARLY',
    );

    assert.equal(normalizeOwnerReservation(null), null);
  } finally {
    globalThis.fetch = previousFetch;
    await server.close();
  }
});

test('OwnerReservationsPage and OwnerDashboard are wired to real reservation APIs and CSS classes', async () => {
  const [pageSrc, dashSrc] = await Promise.all([
    fs.readFile(new URL('../features/restaurant/pages/OwnerReservationsPage.jsx', import.meta.url), 'utf8'),
    fs.readFile(new URL('../features/restaurant/pages/OwnerDashboard.jsx', import.meta.url), 'utf8'),
  ]);

  assert.equal(pageSrc.includes('not available yet'), false);
  assert.ok(pageSrc.includes('owner-reservations-page'));
  assert.ok(pageSrc.includes('owner-stat-grid--6'));
  assert.ok(pageSrc.includes('owner-cal-nav'));
  assert.ok(pageSrc.includes('owner-month-grid-card'));
  assert.ok(pageSrc.includes('owner-daily-schedule-card'));
  assert.ok(pageSrc.includes('owner-week-grid'));
  assert.ok(pageSrc.includes('ownerService.getReservations'));
  assert.ok(pageSrc.includes('ownerService.getReservationCalendar'));
  assert.ok(pageSrc.includes('allowedActions'));
  assert.ok(dashSrc.includes('await ownerService.getReservations'));
});
