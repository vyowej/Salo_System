import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createServer } from 'vite';

const ROOT_DIR = fileURLToPath(new URL('../../', import.meta.url));

test('getRiderActivationViewModel maps all supported backend rider and application states', async () => {
  const server = await createServer({
    configFile: false,
    root: ROOT_DIR,
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent',
  });

  try {
    const { getRiderActivationViewModel } = await server.ssrLoadModule(
      '/src/features/rider/utils/riderActivationStatus.js',
    );

    const empty = getRiderActivationViewModel(null, null);
    assert.equal(empty.state, 'empty');
    assert.equal(empty.statusKey, 'not_applied');
    assert.equal(empty.canGoOnline, false);

    const active = getRiderActivationViewModel({ rider_status: 'active' }, { application_status: 'approved' });
    assert.equal(active.state, 'ready');
    assert.equal(active.statusKey, 'active');
    assert.equal(active.badgeVariant, 'success');
    assert.equal(active.canGoOnline, true);

    const approved = getRiderActivationViewModel({ rider_status: 'approved' }, { application_status: 'approved' });
    assert.equal(approved.statusKey, 'approved');
    assert.equal(approved.badgeLabel, 'Approved · Awaiting Activation');
    assert.equal(approved.canGoOnline, false);

    const pending = getRiderActivationViewModel(null, { application_status: 'pending_review' });
    assert.equal(pending.statusKey, 'pending');
    assert.equal(pending.badgeLabel, 'Pending Review');
    assert.equal(pending.canGoOnline, false);

    const rejected = getRiderActivationViewModel(
      { rider_status: 'rejected' },
      { application_status: 'rejected', reviewer_note: 'Expired license' },
    );
    assert.equal(rejected.statusKey, 'rejected');
    assert.equal(rejected.badgeVariant, 'error');
    assert.equal(rejected.reviewerNote, 'Expired license');
    assert.equal(rejected.canGoOnline, false);

    const suspended = getRiderActivationViewModel({ rider_status: 'suspended' }, null);
    assert.equal(suspended.statusKey, 'suspended');
    assert.equal(suspended.badgeVariant, 'error');
    assert.equal(suspended.canGoOnline, false);

    const inactive = getRiderActivationViewModel({ rider_status: 'inactive' }, null);
    assert.equal(inactive.statusKey, 'inactive');
    assert.equal(inactive.canGoOnline, false);
  } finally {
    await server.close();
  }
});

test('RiderActivationPage loads real rider profile and application without fake self-activation', async () => {
  const source = await fs.readFile(
    new URL('../features/rider/pages/RiderActivationPage.jsx', import.meta.url),
    'utf8',
  );

  assert.match(source, /riderService\.getProfile/);
  assert.match(source, /applicationService\.getCurrentRiderApplication/);
  assert.match(source, /state="loading"/);
  assert.match(source, /state="error"/);
  assert.match(source, /state="empty"/);
  assert.doesNotMatch(source, /activateRider|selfActivate|\/rider\/activate/);
});
