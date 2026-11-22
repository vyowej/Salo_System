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

test('normalizeAdminReservation and normalizeReservationStats map full API payloads and zero-safe defaults', async () => {
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
      status_history: [{ history_id: 1, to_status: 'confirmed', actor_name: 'Ana Staff' }],
      customer_history: { visits: 3, no_shows: 0, cancellations: 1, total_reservations: 4 },
      restaurant_settings: { duration_minutes: 90, min_notice_hours: 2 },
    });

    assert.equal(normalized.id, 42);
    assert.equal(normalized.can_admin_cancel, false);
    assert.equal(normalized.customer_history.visits, 3);
    assert.equal(normalized.restaurant_settings.duration_minutes, 90);
    assert.equal(normalized.status_history[0].actor_name, 'Ana Staff');

    // Full stats payload
    const stats = normalizeReservationStats({
      date_from: '2026-11-01',
      date_to: '2026-11-22',
      totals: {
        total: 25,
        by_status: { completed: 16, no_show: 2 },
        completed: 16,
        no_show: 2,
        cancelled_total: 3,
        covers_total: 80,
        average_party_size: 3.2,
      },
      rates: {
        no_show_rate: 11.1,
        cancellation_rate: 12.0,
        completion_rate: 76.2,
        confirmation_rate: 84.0,
        definitions: { no_show_rate: 'no_show / (completed + no_show) * 100' },
      },
      by_day: [{ date: '2026-11-22', total: 5, completed: 4, cancelled_or_missed: 1, covers: 16 }],
      by_cancelled_by: { customer: 2, restaurant: 1, admin: 0, system: 0 },
      by_hour: [{ hour: 18, label: '18:00', total: 10 }],
      top_restaurants: [{ restaurant_id: 9, name: 'Casa Manila', total: 10, completed: 8, no_show_rate: 11.1 }],
      deposits: {
        required_count: 5,
        paid_count: 4,
        pending_count: 1,
        waived_count: 0,
        refunded_count: 0,
        total_deposit_amount_paid: 2000,
      },
      service_fee_total: 400,
      attention_count: 4,
      attention_counts: { pending_expiring: 1, no_show_candidate: 2, overdue_seated: 1, total: 4 },
      active_upcoming: 6,
    });

    assert.equal(stats.totals.total, 25);
    assert.equal(stats.totals.average_party_size, 3.2);
    assert.equal(stats.rates.confirmation_rate, 84);
    assert.equal(stats.by_cancelled_by.customer, 2);
    assert.equal(stats.by_hour[0].total, 10);
    assert.equal(stats.deposits.total_deposit_amount_paid, 2000);
    assert.equal(stats.service_fee_total, 400);
    assert.equal(stats.attention_count, 4);

    // All-zero / missing-field defaults (no NaN / Infinity)
    const emptyStats = normalizeReservationStats({});
    assert.equal(emptyStats.totals.total, 0);
    assert.equal(emptyStats.totals.average_party_size, 0);
    assert.equal(emptyStats.rates.no_show_rate, 0);
    assert.equal(emptyStats.rates.cancellation_rate, 0);
    assert.equal(emptyStats.rates.completion_rate, 0);
    assert.equal(emptyStats.rates.confirmation_rate, 0);
    assert.equal(emptyStats.deposits.total_deposit_amount_paid, 0);
    assert.equal(emptyStats.service_fee_total, 0);
    assert.equal(emptyStats.attention_count, 0);
    assert.deepEqual(emptyStats.by_day, []);
    assert.deepEqual(emptyStats.by_hour, []);
    assert.deepEqual(emptyStats.top_restaurants, []);
  } finally {
    await vite.close();
  }
});

test('buildAdminReservationsQuery and helpers format group, deposit_status, and attention filters cleanly', () => {
  assert.equal(validateDateRange('2026-11-01', '2026-11-10'), '');
  assert.match(validateDateRange('2026-11-20', '2026-11-10'), /on or after/i);

  assert.equal(formatAttentionLabel('pending_expiring'), 'Pending expiring');
  assert.equal(getAttentionTone('pending_expiring'), 'warning');
  assert.equal(getAttentionTone('no_show_candidate'), 'danger');

  assert.deepEqual(
    buildAdminReservationsQuery({
      search: '  Casa  ',
      status: 'confirmed',
      group: 'active',
      attention: 'any',
      depositStatus: 'paid',
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
      group: 'active',
      attention: 'any',
      deposit_status: 'paid',
      restaurant_id: 9,
      date_from: '2026-11-01',
      date_to: '2026-11-22',
    },
  );
});

test('AdminReservationsPage is wired to adminApiService and includes peak hours, rates, and deposits', async () => {
  const source = await fs.readFile(`${ROOT_DIR}/src/features/admin/pages/AdminReservationsPage.jsx`, 'utf8');
  assert.match(source, /adminApiService\.getReservations/);
  assert.match(source, /adminApiService\.getReservationStats/);
  assert.match(source, /adminApiService\.getReservationDetail/);
  assert.match(source, /Peak start hours/);
  assert.match(source, /Deposits paid/);
  assert.doesNotMatch(source, /not available yet/i);
});
