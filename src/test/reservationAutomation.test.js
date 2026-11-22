import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createServer } from 'vite';
import { formatTimeUntilExpiry } from '../utils/reservationExpiryUtils.js';
import {
  getNotificationCategory,
  getNotificationRoute,
  getNotificationTitle,
} from '../utils/notificationUtils.js';

const ROOT_DIR = fileURLToPath(new URL('../../', import.meta.url));

test('formatTimeUntilExpiry formats minutes, hours, days, expired, and null cleanly', () => {
  const now = new Date('2026-11-23T12:00:00+08:00');

  assert.equal(formatTimeUntilExpiry(null, now), null);
  assert.deepEqual(formatTimeUntilExpiry('2026-11-23T11:59:00+08:00', now), { expired: true, label: 'Expired' });
  assert.deepEqual(formatTimeUntilExpiry('2026-11-23T12:45:00+08:00', now), { expired: false, label: '45m' });
  assert.deepEqual(formatTimeUntilExpiry('2026-11-23T13:20:00+08:00', now), { expired: false, label: '1h 20m' });
  assert.deepEqual(formatTimeUntilExpiry('2026-11-24T14:00:00+08:00', now), { expired: false, label: '1d 2h' });
});

test('expiresAt maps across customer, owner, and admin normalizers and RESERVATION_EXPIRED propagates', async () => {
  const vite = await createServer({
    root: ROOT_DIR,
    server: { middlewareMode: true, hmr: false },
    appType: 'custom',
  });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).includes('/sanctum/csrf-cookie')) {
      return new Response('', { status: 204 });
    }
    return new Response(
      JSON.stringify({
        success: false,
        code: 'RESERVATION_EXPIRED',
        message: 'This reservation request has expired and can no longer be approved or changed.',
      }),
      { status: 409, headers: { 'Content-Type': 'application/json' } },
    );
  };

  try {
    const custMod = await vite.ssrLoadModule('/src/services/customerService.js');
    const ownMod = await vite.ssrLoadModule('/src/services/ownerService.js');
    const admMod = await vite.ssrLoadModule('/src/services/adminApiService.js');

    const sample = {
      reservation_id: 99,
      reservation_status: 'pending',
      expires_at: '2026-11-23T14:00:00+08:00',
    };

    assert.equal(custMod.normalizeReservation(sample).expiresAt, '2026-11-23T14:00:00+08:00');
    assert.equal(ownMod.normalizeOwnerReservation(sample).expiresAt, '2026-11-23T14:00:00+08:00');
    assert.equal(admMod.normalizeAdminReservation(sample).expiresAt, '2026-11-23T14:00:00+08:00');

    await assert.rejects(
      () => ownMod.default.approveReservation(1, 99),
      (err) => err?.code === 'RESERVATION_EXPIRED' && /expired/i.test(err?.message || ''),
    );
  } finally {
    globalThis.fetch = originalFetch;
    await vite.close();
  }
});

test('notificationUtils maps reservation_expired, reservation_expiring_soon, and reservation_reminder', () => {
  for (const [type, workspace, expectedRoute] of [
    ['reservation_expired', 'customer', '/customer/reservations'],
    ['reservation_expiring_soon', 'restaurant', '/owner/reservations'],
    ['reservation_reminder', 'customer', '/customer/reservations'],
  ]) {
    assert.equal(getNotificationCategory(type), 'reservation');
    assert.ok(getNotificationTitle(type).length > 0);
    assert.equal(getNotificationRoute({ workspace, type, related_entity_type: 'reservation', related_entity_id: 5 }), expectedRoute);
  }
});

test('customer ReservationsPage renders expired label and Book another time link', async () => {
  const src = await fs.readFile(`${ROOT_DIR}/src/features/customer/pages/ReservationsPage.jsx`, 'utf8');
  assert.match(src, /Expired — the restaurant didn&apos;t confirm in time/);
  assert.match(src, /Book another time/);
});
