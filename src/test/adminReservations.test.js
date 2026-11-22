import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createServer } from 'vite';
import {
  buildAdminReservationsQuery,
  formatAttentionLabel,
  getAttentionTone,
  validateDateRange,
} from '../features/admin/utils/adminReservationsHelpers.js';

const ROOT_DIR = fileURLToPath(new URL('../../', import.meta.url));

test('normalizeAdminReservation and normalizeReservationStats map API payloads accurately', async () => {
  const vite = await createServer({
    root: ROOT_DIR,
    server: { middlewareMode: true, hmr: false },
    appType: 'custom',
  });

  try {
    const { normalizeAdminReservation, normalizeReservationStats } = await vite.ssrLoadModule(
      '/src/services/adminApiService.js',
    );

    const normalized = normalizeAdminReservation({
      reservation_id: 42,
      reservation_reference: 'SALO-RES-042',
      contact_name: 'Maria Clara',
      contact_phone: '09171234567',
      customer_email: 'maria@example.com',
      restaurant: { restaurant_id: 9, name: 'Casa Manila' },
      table: { table_id: 3, table_name: 'T3', dining_area: 'Patio' },
      reservation_start: '2026-11-22T18:00:00+08:00',
      reservation_end: '2026-11-22T19:30:00+08:00',
      party_size: 4,
      status: 'confirmed',
      status_label: 'Confirmed',
      attention: 'no_show_candidate',
      can_admin_cancel: false,
      deposit_amount: 500,
      deposit_status: 'paid',
      service_fee: 50,
      status_history: [{ history_id: 1, to_status: 'confirmed' }],
    });

    assert.equal(normalized.id, 42);
    assert.equal(normalized.reservation_reference, 'SALO-RES-042');
    assert.equal(normalized.restaurant_name, 'Casa Manila');
    assert.equal(normalized.table.table_name, 'T3');
    assert.equal(normalized.party_size, 4);
    assert.equal(normalized.status_label, 'Confirmed');
    assert.equal(normalized.attention, 'no_show_candidate');
    assert.equal(normalized.can_admin_cancel, false);
    assert.equal(normalized.deposit_amount, 500);
    assert.equal(normalized.status_history.length, 1);

    const stats = normalizeReservationStats({
      date_from: '2026-11-01',
      date_to: '2026-11-22',
      total_reservations: 25,
      active_upcoming: 6,
      total_guests: 80,
      no_show_rate: 12.5,
      cancellation_rate: 8,
      completion_rate: 64,
      status_counts: { completed: 16, no_show: 2 },
      attention_counts: {
        pending_expiring: 1,
        no_show_candidate: 2,
        overdue_seated: 1,
        total: 4,
      },
      daily_trend: [{ date: '2026-11-22', total: 5 }],
      top_restaurants: [{ restaurant_id: 9, restaurant_name: 'Casa Manila', total_reservations: 10 }],
    });

    assert.equal(stats.total_reservations, 25);
    assert.equal(stats.active_upcoming, 6);
    assert.equal(stats.no_show_rate, 12.5);
    assert.equal(stats.attention_counts.total, 4);
    assert.equal(stats.daily_trend.length, 1);
    assert.equal(stats.top_restaurants[0].restaurant_name, 'Casa Manila');
  } finally {
    await vite.close();
  }
});

test('buildAdminReservationsQuery and helpers format filters and attention labels cleanly', () => {
  assert.equal(validateDateRange('2026-11-01', '2026-11-10'), '');
  assert.match(validateDateRange('2026-11-20', '2026-11-10'), /on or after/i);

  assert.equal(formatAttentionLabel('pending_expiring'), 'Pending expiring');
  assert.equal(getAttentionTone('pending_expiring'), 'warning');
  assert.equal(getAttentionTone('no_show_candidate'), 'danger');

  assert.deepEqual(
    buildAdminReservationsQuery({
      search: '  Casa  ',
      status: 'confirmed',
      attention: 'any',
      restaurantId: '9',
      dateFrom: '2026-11-01',
      dateTo: '2026-11-22',
      page: 2,
      perPage: 25,
      direction: 'asc',
    }),
    {
      page: 2,
      per_page: 25,
      direction: 'asc',
      search: 'Casa',
      status: 'confirmed',
      attention: 'any',
      restaurant_id: 9,
      date_from: '2026-11-01',
      date_to: '2026-11-22',
    },
  );
});

test('AdminReservationsPage is wired to adminApiService without placeholder empty text', async () => {
  const source = await fs.readFile(`${ROOT_DIR}/src/features/admin/pages/AdminReservationsPage.jsx`, 'utf8');
  assert.match(source, /adminApiService\.getReservations/);
  assert.match(source, /adminApiService\.getReservationStats/);
  assert.match(source, /adminApiService\.getReservationDetail/);
  assert.doesNotMatch(source, /not available yet/i);
});
