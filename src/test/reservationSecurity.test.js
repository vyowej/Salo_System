import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createServer } from 'vite';

const ROOT_DIR = fileURLToPath(new URL('../../', import.meta.url));

test('reservation frontend files contain no unsafe DOM sinks and sanitize tel/mailto links', async () => {
  const filesToScan = [
    'src/features/customer/pages/ReservationsPage.jsx',
    'src/features/customer/components/ReservationModal.jsx',
    'src/features/restaurant/pages/OwnerReservationsPage.jsx',
    'src/features/restaurant/pages/OwnerTablesPage.jsx',
    'src/features/admin/pages/AdminReservationsPage.jsx',
  ];

  for (const rel of filesToScan) {
    const content = await fs.readFile(`${ROOT_DIR}/${rel}`, 'utf8');
    assert.doesNotMatch(content, /dangerouslySetInnerHTML/, `${rel} must not use dangerouslySetInnerHTML`);
    assert.doesNotMatch(content, /\.innerHTML\s*=/, `${rel} must not assign innerHTML`);
    assert.doesNotMatch(content, /\beval\s*\(/, `${rel} must not call eval()`);
    assert.doesNotMatch(content, /localStorage|sessionStorage/, `${rel} must not store data in web storage`);
  }

  const ownerResSrc = await fs.readFile(`${ROOT_DIR}/src/features/restaurant/pages/OwnerReservationsPage.jsx`, 'utf8');
  assert.match(ownerResSrc, /sanitizeTelHref/);
  assert.match(ownerResSrc, /sanitizeMailtoHref/);
  assert.doesNotMatch(ownerResSrc, /href=\{`tel:/);
  assert.doesNotMatch(ownerResSrc, /href=\{`mailto:/);
});

test('src/App.jsx declares route guards for all five reservation routes', async () => {
  const appSrc = await fs.readFile(`${ROOT_DIR}/src/App.jsx`, 'utf8');
  assert.match(appSrc, /path="\/customer\/reservations"/);
  assert.match(appSrc, /<Route path="reservations" element=\{<RequireAccess itemId="reservations"><OwnerReservationsPage \/><\/RequireAccess>\}/);
  assert.match(appSrc, /<Route path="tables" element=\{<RequireAccess itemId="tables"><OwnerTablesPage \/><\/RequireAccess>\}/);
  assert.match(appSrc, /<Route path="reservations" element=\{<AdminPermissionRoute module="reservations" topic="reservations"><AdminReservationsPage \/><\/AdminPermissionRoute>\}/);
  assert.match(appSrc, /<Route path="reservations\/:id" element=\{<AdminPermissionRoute module="reservations" topic="reservations"><AdminReservationsPage \/><\/AdminPermissionRoute>\}/);
});

test('customerService propagates 401 and 409 IDEMPOTENCY_KEY_REUSED errors cleanly', async () => {
  const vite = await createServer({
    root: ROOT_DIR,
    server: { middlewareMode: true, hmr: false },
    appType: 'custom',
  });

  const originalFetch = globalThis.fetch;
  let nextStatus = 409;
  let nextPayload = {
    success: false,
    code: 'IDEMPOTENCY_KEY_REUSED',
    message: 'This idempotency key was already used for a different reservation request.',
  };

  globalThis.fetch = async (url) => {
    if (String(url).includes('/sanctum/csrf-cookie')) {
      return new Response('', { status: 204 });
    }
    return new Response(JSON.stringify(nextPayload), {
      status: nextStatus,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  try {
    const mod = await vite.ssrLoadModule('/src/services/customerService.js');
    const customerService = mod.default;

    await assert.rejects(
      () =>
        customerService.createReservation({
          restaurantId: 1,
          start: '2026-11-24T18:00',
          partySize: 2,
          idempotencyKey: 'reused-key-1234',
        }),
      (err) => err?.status === 409 && err?.code === 'IDEMPOTENCY_KEY_REUSED',
    );

    nextStatus = 401;
    nextPayload = { success: false, message: 'Unauthenticated.' };
    await assert.rejects(
      () => customerService.getReservations(),
      (err) => err?.status === 401,
    );
  } finally {
    globalThis.fetch = originalFetch;
    await vite.close();
  }
});
