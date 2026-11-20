import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createServer } from 'vite';
import { resolveUserWorkspaces } from '../config/workspaceConfig.js';

const ROOT_DIR = fileURLToPath(new URL('../../', import.meta.url));

test('getDefaultWorkspace and normalizeUser always default non-admin multi-role accounts to customer and admin to admin', async () => {
  const server = await createServer({
    configFile: false,
    root: ROOT_DIR,
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent',
  });

  try {
    const { getDefaultWorkspace, getWorkspaceHomePath, normalizeUser } = await server.ssrLoadModule(
      '/src/services/authService.js',
    );

    assert.equal(getDefaultWorkspace(['customer']), 'customer');
    assert.equal(getDefaultWorkspace(['customer', 'rider']), 'customer');
    assert.equal(getDefaultWorkspace(['customer', 'owner']), 'customer');
    assert.equal(getDefaultWorkspace(['customer', 'staff']), 'customer');
    assert.equal(getDefaultWorkspace(['customer', 'rider', 'owner']), 'customer');
    assert.equal(getDefaultWorkspace(['admin']), 'admin');
    assert.equal(getDefaultWorkspace(['customer', 'admin']), 'admin');

    const multiRole = normalizeUser({
      user_id: 10,
      username: 'multi',
      email: 'multi@example.com',
      roles: ['customer', 'rider', 'owner'],
    });
    assert.equal(multiRole.role, 'customer');
    assert.equal(getWorkspaceHomePath(multiRole.role), '/customer');

    const adminUser = normalizeUser({
      user_id: 1,
      username: 'admin',
      email: 'admin@example.com',
      roles: ['customer', 'admin'],
    });
    assert.equal(adminUser.role, 'admin');
    assert.equal(getWorkspaceHomePath(adminUser.role), '/admin');
  } finally {
    await server.close();
  }
});

test('resolveUserWorkspaces marks only the active side as current across Customer, Rider, Restaurant, and Admin', () => {
  const roles = ['customer', 'rider', 'owner'];

  const onCustomer = resolveUserWorkspaces('customer', roles);
  assert.equal(onCustomer.find((w) => w.id === 'customer')?.isCurrent, true);
  assert.equal(onCustomer.find((w) => w.id === 'rider')?.isCurrent, false);
  assert.equal(onCustomer.find((w) => w.id === 'restaurant')?.isCurrent, false);

  const onRider = resolveUserWorkspaces('rider', roles);
  assert.equal(onRider.find((w) => w.id === 'customer')?.isCurrent, false);
  assert.equal(onRider.find((w) => w.id === 'rider')?.isCurrent, true);
  assert.equal(onRider.find((w) => w.id === 'restaurant')?.isCurrent, false);

  const onRestaurant = resolveUserWorkspaces('restaurant', roles);
  assert.equal(onRestaurant.find((w) => w.id === 'customer')?.isCurrent, false);
  assert.equal(onRestaurant.find((w) => w.id === 'rider')?.isCurrent, false);
  assert.equal(onRestaurant.find((w) => w.id === 'restaurant')?.isCurrent, true);

  const onAdmin = resolveUserWorkspaces('admin', ['customer', 'admin']);
  assert.equal(onAdmin.find((w) => w.id === 'admin')?.isCurrent, true);
  assert.equal(onAdmin.find((w) => w.id === 'customer')?.isCurrent, false);
});

test('SwitchAccountModal prioritizes currentRole and AuthContext isolates persisted workspace per user', async () => {
  const modalSrc = await fs.readFile(
    new URL('../components/navigation/SwitchAccountModal.jsx', import.meta.url),
    'utf8',
  );
  const authCtxSrc = await fs.readFile(
    new URL('../contexts/AuthContext.jsx', import.meta.url),
    'utf8',
  );

  assert.match(modalSrc, /resolveUserWorkspaces\(currentRole \|\| activeWorkspace/);
  assert.match(authCtxSrc, /salo_active_workspace/);
  assert.match(authCtxSrc, /String\(parsed\?\.userId\) !== String\(userId\)/);
  assert.match(authCtxSrc, /writeStoredWorkspaceForUser\(null, null\)/);
});
