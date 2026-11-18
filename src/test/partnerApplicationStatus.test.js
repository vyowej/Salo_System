import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createServer } from 'vite';

const ROOT_DIR = fileURLToPath(new URL('../../', import.meta.url));

test('applicationService.getAccountApplications and mapBackendApplicationStatus handle AccountService status contract', async () => {
  const server = await createServer({
    configFile: false,
    root: ROOT_DIR,
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent',
  });

  const previousFetch = globalThis.fetch;

  try {
    const { applicationService, mapBackendApplicationStatus } = await server.ssrLoadModule(
      '/src/services/applicationService.js',
    );

    globalThis.fetch = async (url) => {
      assert.ok(url.endsWith('/account/applications'));
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            restaurant_application: {
              type: 'restaurant',
              status: 'approved',
              submitted_at: '2026-11-01T10:00:00+00:00',
              updated_at: '2026-11-02T10:00:00+00:00',
              reviewer_note: null,
            },
            rider_application: {
              type: 'rider',
              status: 'rejected',
              submitted_at: '2026-11-03T10:00:00+00:00',
              updated_at: '2026-11-04T10:00:00+00:00',
              reviewer_note: 'Blurry license photo',
            },
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    };

    const data = await applicationService.getAccountApplications();
    assert.equal(data.restaurant_application.status, 'approved');
    assert.equal(data.rider_application.status, 'rejected');

    assert.equal(mapBackendApplicationStatus(null), null);
    assert.equal(mapBackendApplicationStatus('submitted'), 'Submitted');
    assert.equal(mapBackendApplicationStatus('pending_review'), 'Pending Review');
    assert.equal(mapBackendApplicationStatus('under_review'), 'Under Review');
    assert.equal(
      mapBackendApplicationStatus('additional_documents_required'),
      'Additional Documents Required',
    );
    assert.equal(mapBackendApplicationStatus('needs_correction'), 'Needs Correction');
    assert.equal(mapBackendApplicationStatus('resubmitted'), 'Resubmitted');
    assert.equal(mapBackendApplicationStatus('approved'), 'Approved');
    assert.equal(mapBackendApplicationStatus('rejected'), 'Rejected');
  } finally {
    globalThis.fetch = previousFetch;
    await server.close();
  }
});

test('PartnerApplicationPage reads backend status field consistently without mock fallbacks', async () => {
  const source = await fs.readFile(
    new URL('../features/customer/pages/PartnerApplicationPage.jsx', import.meta.url),
    'utf8',
  );

  assert.match(source, /application\.status/);
  assert.match(source, /applications\.restaurant\?\.status/);
  assert.match(source, /applications\.rider\?\.status/);
  assert.doesNotMatch(source, /application_status/);
  assert.doesNotMatch(source, /applicationStatus/);
  assert.doesNotMatch(source, /SALO-REST-/);
});
