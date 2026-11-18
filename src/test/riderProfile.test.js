import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createServer } from 'vite';
import {
  buildRiderProfileFormState,
  buildRiderProfilePayload,
  validateRiderProfileForm,
} from '../features/rider/utils/riderProfileForm.js';

const ROOT_DIR = fileURLToPath(new URL('../../', import.meta.url));

test('riderProfileForm helpers map backend profile, validate fields, and build PATCH payload', () => {
  const backendProfile = {
    rider_id: 3,
    vehicle_type: 'motorcycle',
    plate_number: 'ABC-1234',
    base_city: 'Quezon City',
    emergency_contact_name: 'Maria Santos',
    emergency_contact_relationship: 'parent',
    emergency_contact_phone: '09171234567',
    preferred_hubs: 'Cubao, Katipunan',
    preferred_shifts: ['lunch', 'dinner'],
    available_days: ['mon', 'wed', 'fri'],
  };

  const form = buildRiderProfileFormState(backendProfile);
  assert.equal(form.emergency_contact_name, 'Maria Santos');
  assert.equal(form.emergency_contact_relationship, 'parent');
  assert.deepEqual(form.preferred_shifts, ['lunch', 'dinner']);
  assert.deepEqual(form.available_days, ['mon', 'wed', 'fri']);

  const invalid = validateRiderProfileForm({
    ...form,
    emergency_contact_name: '   ',
    emergency_contact_phone: '',
    emergency_contact_relationship: 'boss',
  });
  assert.equal(invalid.isValid, false);
  assert.ok(invalid.errors.emergency_contact_name);
  assert.ok(invalid.errors.emergency_contact_phone);
  assert.ok(invalid.errors.emergency_contact_relationship);

  const valid = validateRiderProfileForm(form);
  assert.equal(valid.isValid, true);

  const payload = buildRiderProfilePayload({
    ...form,
    emergency_contact_name: '  Maria Santos  ',
    preferred_hubs: '  ',
  });
  assert.deepEqual(payload, {
    emergency_contact_name: 'Maria Santos',
    emergency_contact_relationship: 'parent',
    emergency_contact_phone: '09171234567',
    emergency_contact_alt_phone: null,
    preferred_hubs: null,
    preferred_shifts: ['lunch', 'dinner'],
    available_days: ['mon', 'wed', 'fri'],
  });
});

test('riderService.getProfile and updateProfile communicate with /rider/profile and surface errors', async () => {
  const server = await createServer({
    configFile: false,
    root: ROOT_DIR,
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent',
  });

  const previousFetch = globalThis.fetch;
  let storedProfile = {
    rider_id: 9,
    rider_status: 'active',
    emergency_contact_name: 'Ana Cruz',
    emergency_contact_relationship: 'sibling',
    emergency_contact_phone: '09170001111',
    preferred_hubs: 'Makati',
    preferred_shifts: ['lunch'],
    available_days: ['mon', 'tue'],
  };

  try {
    const { clearCsrfCache } = await server.ssrLoadModule('/src/services/apiClient.js');
    const { default: riderService } = await server.ssrLoadModule('/src/services/riderService.js');

    clearCsrfCache();

    globalThis.fetch = async (url, init = {}) => {
      if (url.endsWith('/auth/csrf')) {
        return new Response(
          JSON.stringify({ success: true, data: { csrf_token: 'rider-profile-csrf' } }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      if (url.endsWith('/rider/profile') && (init.method || 'GET') === 'GET') {
        return new Response(
          JSON.stringify({ success: true, data: { profile: storedProfile } }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      if (url.endsWith('/rider/profile') && init.method === 'PATCH') {
        const body = JSON.parse(init.body);
        if (!body.emergency_contact_name) {
          return new Response(
            JSON.stringify({
              success: false,
              message: 'Validation failed.',
              errors: { emergency_contact_name: ['The emergency contact name field is required.'] },
            }),
            { status: 422, headers: { 'Content-Type': 'application/json' } },
          );
        }

        storedProfile = { ...storedProfile, ...body };
        return new Response(
          JSON.stringify({ success: true, data: { profile: storedProfile } }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      return new Response(JSON.stringify({ success: false, message: 'Not found' }), { status: 404 });
    };

    const initial = await riderService.getProfile();
    assert.equal(initial.emergency_contact_name, 'Ana Cruz');

    const updated = await riderService.updateProfile({
      emergency_contact_name: 'Jose Cruz',
      emergency_contact_relationship: 'parent',
      emergency_contact_phone: '09179998888',
      preferred_shifts: ['dinner', 'late_night'],
      available_days: ['fri', 'sat'],
    });
    assert.equal(updated.emergency_contact_name, 'Jose Cruz');
    assert.deepEqual(updated.preferred_shifts, ['dinner', 'late_night']);

    // Verify persistence on subsequent GET
    const reloaded = await riderService.getProfile();
    assert.equal(reloaded.emergency_contact_name, 'Jose Cruz');

    // Verify 422 validation error propagation
    await assert.rejects(
      () => riderService.updateProfile({ emergency_contact_name: '' }),
      (err) => err?.status === 422 && Boolean(err?.errors?.emergency_contact_name),
    );
  } finally {
    globalThis.fetch = previousFetch;
    await server.close();
  }
});

test('RiderProfilePage connects edit form to riderService.updateProfile and syncs AuthContext', async () => {
  const source = await fs.readFile(
    new URL('../features/rider/pages/RiderProfilePage.jsx', import.meta.url),
    'utf8',
  );

  assert.match(source, /riderService\.getProfile/);
  assert.match(source, /riderService\.updateProfile/);
  assert.match(source, /updateUser\?\.\(\{\s*rider_profile:\s*updated\s*\}\)/);
  assert.match(source, /if \(saving\) return;/);

  const updateIdx = source.indexOf('await riderService.updateProfile');
  const successIdx = source.lastIndexOf('setSaveSuccess(');
  assert.ok(updateIdx > 0 && successIdx > updateIdx);
});
