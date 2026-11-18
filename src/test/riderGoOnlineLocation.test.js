import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createServer } from 'vite';

const ROOT_DIR = fileURLToPath(new URL('../../', import.meta.url));

test('riderService.postRiderLocation posts exact /rider/location payload and propagates API errors', async () => {
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
    const { default: riderService } = await server.ssrLoadModule('/src/services/riderService.js');

    clearCsrfCache();

    globalThis.fetch = async (url, init = {}) => {
      calls.push({ url, method: init.method || 'GET', body: init.body });

      if (url.endsWith('/auth/csrf')) {
        return new Response(
          JSON.stringify({ success: true, data: { csrf_token: 'rider-csrf' } }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      if (url.endsWith('/rider/location')) {
        const parsed = JSON.parse(init.body);
        if (parsed.latitude > 90) {
          return new Response(
            JSON.stringify({ success: false, message: 'The latitude field must be between -90 and 90.' }),
            { status: 422, headers: { 'Content-Type': 'application/json' } },
          );
        }
        return new Response(
          JSON.stringify({
            success: true,
            message: 'Rider GPS location recorded.',
            data: {
              recorded: true,
              rider_location_id: 55,
              latitude: parsed.latitude,
              longitude: parsed.longitude,
              accuracy_meters: parsed.accuracy_meters,
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      return new Response(JSON.stringify({ success: false, message: 'Not found' }), { status: 404 });
    };

    const result = await riderService.postRiderLocation({
      latitude: 14.5995,
      longitude: 120.9842,
      accuracy_meters: 12.5,
    });

    const locationCall = calls.find((c) => c.url.endsWith('/rider/location'));
    assert.ok(locationCall);
    assert.equal(locationCall.method, 'POST');
    assert.deepEqual(JSON.parse(locationCall.body), {
      latitude: 14.5995,
      longitude: 120.9842,
      accuracy_meters: 12.5,
    });
    assert.equal(result.recorded, true);
    assert.equal(result.accuracy_meters, 12.5);

    await assert.rejects(
      () => riderService.postRiderLocation({ latitude: 999, longitude: 120.9842 }),
      (err) => err?.status === 422 && /latitude/i.test(err.message),
    );
  } finally {
    globalThis.fetch = previousFetch;
    await server.close();
  }
});

test('RiderGoOnlinePage uses riderService.postRiderLocation before going online and handles GPS/API errors', async () => {
  const source = await fs.readFile(
    new URL('../features/rider/pages/RiderGoOnlinePage.jsx', import.meta.url),
    'utf8',
  );

  assert.match(source, /riderService\.postRiderLocation/);
  assert.doesNotMatch(source, /recordRiderLocation/);
  assert.match(source, /accuracy_meters/);
  assert.match(source, /geoError\?\.code === 1/);
  assert.match(source, /if \(saving\) return;/);

  const postIdx = source.indexOf('await riderService.postRiderLocation');
  const availIdx = source.indexOf('await riderService.updateAvailability(nextStatus)');
  const noticeIdx = source.lastIndexOf('setNotice(');
  assert.ok(postIdx > 0 && availIdx > postIdx && noticeIdx > availIdx);
});
