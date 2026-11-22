import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createServer } from 'vite';
import {
  mapBackendSettingsErrors,
  validateReservationSettings,
} from '../features/restaurant/utils/reservationSettingsHelpers.js';
import {
  getNotificationCategory,
  getNotificationTitle,
} from '../utils/notificationUtils.js';

const ROOT_DIR = fileURLToPath(new URL('../../', import.meta.url));

test('ownerService deposit methods, settings normalizer, and reservation fields work with mocked fetch', async () => {
  const vite = await createServer({
    root: ROOT_DIR,
    server: { middlewareMode: true, hmr: false },
    appType: 'custom',
  });

  const originalFetch = globalThis.fetch;
  const calls = [];

  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method || 'GET', body: init.body ? JSON.parse(init.body) : null });
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          reservation: {
            reservation_id: 55,
            reservation_reference: 'SALO-RES-055',
            reservation_status: 'cancelled',
            deposit_amount: '500.00',
            deposit_status: 'paid',
            deposit_display_status: 'paid',
            deposit_action_needed: true,
            allowed_deposit_actions: ['refund'],
            allowed_actions: [],
          },
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  };

  try {
    const mod = await vite.ssrLoadModule('/src/services/ownerService.js');
    const ownerService = mod.default;

    // recordReservationPayment sends POST /restaurant/reservations/{id}/deposit
    const paidRes = await ownerService.recordReservationPayment(10, 55, {
      action: 'mark_paid',
      note: 'Paid at counter',
    });
    const postCalls = calls.filter((c) => c.method === 'POST');
    assert.equal(postCalls.length, 1);
    assert.match(postCalls[0].url, /\/restaurant\/reservations\/55\/deposit$/);
    assert.deepEqual(postCalls[0].body, {
      restaurant_id: 10,
      deposit_status: 'paid',
      note: 'Paid at counter',
    });
    assert.deepEqual(paidRes.allowedDepositActions, ['refund']);
    assert.equal(paidRes.depositDisplayStatus, 'paid');
    assert.equal(paidRes.depositActionNeeded, true);

    // cancelReservation forwards refund_deposit
    await ownerService.cancelReservation(10, 55, 'Guest requested', { refundDeposit: true });
    const postCallsAfterCancel = calls.filter((c) => c.method === 'POST');
    assert.equal(postCallsAfterCancel.length, 2);
    assert.match(postCallsAfterCancel[1].url, /\/restaurant\/reservations\/55\/cancel$/);
    assert.deepEqual(postCallsAfterCancel[1].body, {
      restaurant_id: 10,
      reason: 'Guest requested',
      refund_deposit: true,
    });

    // Settings camelCase <-> snake_case round-trip
    const normalizedProfile = mod.normalizeOwnerSettingsProfile({
      reservation_duration_minutes: '120',
      reservation_max_advance_days: '60',
      reservation_cancellation_cutoff_minutes: '180',
      reservation_pending_expiry_minutes: '90',
      reservation_auto_confirm: 0,
      reservation_deposit_required: 1,
      reservation_deposit_amount: '500.50',
      reservation_service_fee: '25.00',
    });
    assert.equal(normalizedProfile.reservationDurationMinutes, 120);
    assert.equal(normalizedProfile.reservationDepositRequired, true);
    assert.equal(normalizedProfile.reservationDepositAmount, 500.5);

    const payload = mod.mapOwnerSettingsPayload({
      reservationDurationMinutes: 120,
      reservationDepositRequired: true,
      reservationDepositAmount: 500,
    });
    assert.equal(payload.reservation_duration_minutes, 120);
    assert.equal(payload.reservation_deposit_required, true);
    assert.equal(payload.reservation_deposit_amount, 500);
    assert.equal(payload.reservationDurationMinutes, undefined);

    // resolveReservationCancellation removed
    assert.equal(ownerService.resolveReservationCancellation, undefined);
  } finally {
    globalThis.fetch = originalFetch;
    await vite.close();
  }
});

test('validateReservationSettings enforces cross-field rules and maps 422 errors', () => {
  const err1 = validateReservationSettings({
    reservation_duration_minutes: 40,
    reservation_deposit_required: true,
    reservation_deposit_amount: 0,
    reservation_auto_confirm: true,
    reservation_max_advance_days: 1,
    reservation_min_notice_hours: 30,
  });

  assert.ok(err1.reservation_duration_minutes);
  assert.ok(err1.reservation_deposit_amount);
  assert.ok(err1.reservation_auto_confirm);
  assert.ok(err1.reservation_min_notice_hours);

  const mapped = mapBackendSettingsErrors({
    errors: {
      reservation_auto_confirm: ['Auto-confirm cannot be enabled while a deposit is required.'],
    },
  });
  assert.match(mapped.reservation_auto_confirm, /deposit is required/i);
});

test('notificationUtils maps the three new deposit notification types', () => {
  for (const type of [
    'reservation_deposit_received',
    'reservation_deposit_waived',
    'reservation_deposit_refunded',
  ]) {
    assert.equal(getNotificationCategory(type), 'reservation');
    assert.ok(getNotificationTitle(type).length > 0);
  }
});

test('no deposit notAvailable stubs remain and OwnerSettingsPage renders reservation settings', async () => {
  const ownerServiceSrc = await fs.readFile(`${ROOT_DIR}/src/services/ownerService.js`, 'utf8');
  assert.doesNotMatch(ownerServiceSrc, /notAvailable\(['"]Recording reservation payment/);
  assert.doesNotMatch(ownerServiceSrc, /notAvailable\(['"]Resolving reservation cancellation/);

  const settingsSrc = await fs.readFile(`${ROOT_DIR}/src/features/restaurant/pages/OwnerSettingsPage.jsx`, 'utf8');
  assert.match(settingsSrc, /Reservation settings/);
  assert.match(settingsSrc, /reservation_duration_minutes/);
  assert.match(settingsSrc, /reservation_deposit_required/);
});
