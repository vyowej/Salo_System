import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import reactPlugin from '@vitejs/plugin-react';
import { createServer } from 'vite';

test('permission map grants owners all access and filters staff navigation', async () => {
  const server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL('../../../../', import.meta.url)),
    plugins: [reactPlugin()],
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent',
  });

  try {
    const { buildRestaurantAccess, canAccessNavigationItem } = await server.ssrLoadModule(
      '/src/features/restaurant/access/permissionMap.js',
    );
    const restaurant = { id: 'restaurant-1' };
    const owner = buildRestaurantAccess(
      { id: 1 },
      { ownershipMemberships: [{ restaurantId: restaurant.id, status: 'approved' }], staffMemberships: [] },
      [restaurant],
      restaurant.id,
    );
    const staff = buildRestaurantAccess(
      { id: 2 },
      {
        ownershipMemberships: [],
        staffMemberships: [{
          restaurantId: restaurant.id,
          status: 'active',
          permissions: ['menu.view'],
        }],
      },
      [restaurant],
      restaurant.id,
    );

    assert.equal(owner.isOwner, true);
    assert.equal(owner.canAccess(['team.permissions.manage']), true);
    assert.equal(canAccessNavigationItem(staff, 'menu'), true);
    assert.equal(canAccessNavigationItem(staff, 'orders'), false);
    assert.equal(canAccessNavigationItem(staff, 'overview'), false);
    assert.equal(canAccessNavigationItem(staff, 'activity'), false);
    const hoursManager = buildRestaurantAccess(
      { id: 8 },
      {
        ownershipMemberships: [],
        staffMemberships: [{
          restaurantId: restaurant.id,
          status: 'active',
          permissions: ['business.hours.manage'],
        }],
      },
      [restaurant],
      restaurant.id,
    );
    assert.equal(canAccessNavigationItem(hoursManager, 'profile'), true);
    const reservationHandler = buildRestaurantAccess(
      { id: 6 },
      {
        ownershipMemberships: [],
        staffMemberships: [{
          restaurantId: restaurant.id,
          status: 'active',
          permissions: ['reservations.view', 'reservations.assignTables', 'tables.view'],
        }],
      },
      [restaurant],
      restaurant.id,
    );
    assert.equal(canAccessNavigationItem(reservationHandler, 'tables'), true);
    assert.equal(canAccessNavigationItem(reservationHandler, 'inventory'), false);
    const inventoryManager = buildRestaurantAccess(
      { id: 7 },
      {
        ownershipMemberships: [],
        staffMemberships: [{
          restaurantId: restaurant.id,
          status: 'active',
          permissions: ['inventory.view', 'inventory.addStock'],
        }],
      },
      [restaurant],
      restaurant.id,
    );
    assert.equal(canAccessNavigationItem(inventoryManager, 'inventory'), true);
    assert.equal(canAccessNavigationItem(inventoryManager, 'tables'), false);
    const pricingStaff = buildRestaurantAccess(
      { id: 3 },
      {
        ownershipMemberships: [],
        staffMemberships: [{
          restaurantId: restaurant.id,
          status: 'active',
          permissions: ['menu.pricing.manage'],
        }],
      },
      [restaurant],
      restaurant.id,
    );
    assert.equal(canAccessNavigationItem(pricingStaff, 'menu'), true);
  } finally {
    await server.close();
  }
});

test('route guard distinguishes loading, login, forbidden, and allowed states', async () => {
  const server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL('../../../../', import.meta.url)),
    plugins: [reactPlugin()],
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent',
  });

  try {
    const { resolveAccessDecision } = await server.ssrLoadModule('/src/routes/accessDecision.js');
    assert.equal(resolveAccessDecision({ loading: true }), 'loading');
    assert.equal(resolveAccessDecision({ loading: false, authenticated: false }), 'unauthenticated');
    assert.equal(resolveAccessDecision({ loading: false, authenticated: true, hasRestaurantAccess: false }), 'forbidden');
    assert.equal(resolveAccessDecision({ loading: false, authenticated: true, hasRestaurantAccess: true, canAccess: true }), 'allowed');
  } finally {
    await server.close();
  }
});

test('useRestaurantAccess exposes ownership and restaurant memberships', async () => {
  const server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL('../../../../', import.meta.url)),
    plugins: [reactPlugin()],
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent',
  });

  try {
    const { default: AuthContext } = await server.ssrLoadModule('/src/contexts/AuthContext.jsx');
    const { RestaurantAccessProvider } = await server.ssrLoadModule(
      '/src/features/restaurant/access/RestaurantAccessContext.jsx',
    );
    const { useRestaurantAccess } = await server.ssrLoadModule(
      '/src/features/restaurant/access/useRestaurantAccess.js',
    );
    function Probe() {
      const access = useRestaurantAccess();
      return React.createElement('span', null, `${access.isOwner}:${access.restaurants.length}:${access.canAccessNavigationItem('menu')}`);
    }

    const ownerUser = {
      id: 2,
      user_id: 2,
      email: 'owner@salo.ph',
      restaurant_ownerships: [
        { restaurant_id: 1, restaurant_name: 'Kitchen One', restaurant_status: 'active' },
        { restaurant_id: 2, restaurant_name: 'Kitchen Two', restaurant_status: 'active' },
      ],
      restaurant_staff_assignments: [],
    };

    const html = renderToStaticMarkup(React.createElement(
      AuthContext.Provider,
      { value: { user: ownerUser } },
      React.createElement(RestaurantAccessProvider, null, React.createElement(Probe)),
    ));

    assert.match(html, />true:2:true</);
    const fallbackHtml = renderToStaticMarkup(React.createElement(
      AuthContext.Provider,
      { value: { user: ownerUser } },
      React.createElement(Probe),
    ));
    assert.match(fallbackHtml, />true:2:true</);
  } finally {
    await server.close();
  }
});

test('multi-branch access: single branch vs multi-branch, staff switching, and invalid stored id fallback', async () => {
  const server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL('../../../../', import.meta.url)),
    plugins: [reactPlugin()],
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent',
  });

  try {
    const { buildRestaurantAccess, canAccessNavigationItem } = await server.ssrLoadModule(
      '/src/features/restaurant/access/permissionMap.js',
    );
    const {
      getSelectedRestaurantStorageKey,
      setActiveRestaurantIdHeader,
      getActiveRestaurantIdHeader,
    } = await server.ssrLoadModule('/src/features/restaurant/access/branchContextStorage.js');

    assert.equal(getSelectedRestaurantStorageKey({ user_id: 42 }), 'salo_selected_restaurant_42');
    assert.equal(getSelectedRestaurantStorageKey({ id: 9 }), 'salo_selected_restaurant_9');
    assert.equal(getSelectedRestaurantStorageKey(null), null);

    setActiveRestaurantIdHeader('15');
    assert.equal(getActiveRestaurantIdHeader(), '15');
    setActiveRestaurantIdHeader(null);
    assert.equal(getActiveRestaurantIdHeader(), null);

    const singleRestaurant = [
      {
        id: '10',
        name: 'Salo Grill',
        branchName: null,
        displayName: 'Salo Grill',
        isMainBranch: true,
        shortAddress: 'Quezon City',
        status: 'active',
      },
    ];
    const singleOwner = buildRestaurantAccess(
      { id: 1 },
      { ownershipMemberships: [{ restaurantId: '10', status: 'approved' }], staffMemberships: [] },
      singleRestaurant,
      '999', // invalid stored id falls back to main
    );
    assert.equal(singleOwner.restaurants.length, 1);
    assert.equal(singleOwner.selectedRestaurantId, '10');
    assert.equal(singleOwner.isOwner, true);

    const twoBranches = [
      {
        id: '11',
        name: 'Salo Grill',
        branchName: 'BGC',
        displayName: 'Salo Grill — BGC',
        isMainBranch: false,
        shortAddress: 'Taguig',
        status: 'active',
      },
      {
        id: '10',
        name: 'Salo Grill',
        branchName: 'Main',
        displayName: 'Salo Grill — Main',
        isMainBranch: true,
        shortAddress: 'Quezon City',
        status: 'active',
      },
    ];
    // Owner with invalid stored id falls back to main branch ('10'), not array[0] ('11')
    const ownerFallback = buildRestaurantAccess(
      { id: 1 },
      {
        ownershipMemberships: [
          { restaurantId: '11', status: 'approved' },
          { restaurantId: '10', status: 'approved' },
        ],
        staffMemberships: [],
      },
      twoBranches,
      'invalid-branch-id',
    );
    assert.equal(ownerFallback.selectedRestaurantId, '10');
    assert.equal(ownerFallback.selectedRestaurant.displayName, 'Salo Grill — Main');
    assert.equal(ownerFallback.selectedRestaurant.shortAddress, 'Quezon City');

    // Staff with 2 branches: permissions follow selected branch and isOwner is false
    const staffProfile = {
      ownershipMemberships: [],
      staffMemberships: [
        { restaurantId: '10', status: 'active', permissions: ['menu.view'] },
        { restaurantId: '11', status: 'active', permissions: ['orders.view'] },
      ],
    };
    const staffBranch10 = buildRestaurantAccess({ id: 5 }, staffProfile, twoBranches, '10');
    assert.equal(staffBranch10.isOwner, false);
    assert.equal(canAccessNavigationItem(staffBranch10, 'menu'), true);
    assert.equal(canAccessNavigationItem(staffBranch10, 'orders'), false);

    const staffBranch11 = buildRestaurantAccess({ id: 5 }, staffProfile, twoBranches, '11');
    assert.equal(staffBranch11.isOwner, false);
    assert.equal(canAccessNavigationItem(staffBranch11, 'menu'), false);
    assert.equal(canAccessNavigationItem(staffBranch11, 'orders'), true);

    // Staff with invalid stored id falls back to main if assigned, or first assigned sibling branch
    const staffFallback = buildRestaurantAccess({ id: 5 }, staffProfile, twoBranches, '9999');
    assert.equal(staffFallback.selectedRestaurantId, '10');
    const siblingOnlyStaff = buildRestaurantAccess(
      { id: 6 },
      {
        ownershipMemberships: [],
        staffMemberships: [{ restaurantId: '11', status: 'active', permissions: ['orders.view'] }],
      },
      twoBranches,
      '9999',
    );
    assert.equal(siblingOnlyStaff.selectedRestaurantId, '11');
  } finally {
    await server.close();
  }
});

test('apiClient injects X-Restaurant-Id on /restaurant/* (except /restaurant/applications) and locationApiService passes restaurant_id', async () => {
  const server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL('../../../../', import.meta.url)),
    plugins: [reactPlugin()],
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent',
  });

  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), headers: options.headers || {} });
    return {
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({ success: true, data: {} }),
    };
  };

  try {
    const { setActiveRestaurantIdHeader } = await server.ssrLoadModule(
      '/src/features/restaurant/access/branchContextStorage.js',
    );
    const { default: apiClient } = await server.ssrLoadModule('/src/services/apiClient.js');
    const { default: locationApiService } = await server.ssrLoadModule('/src/services/locationApiService.js');
    const { default: ownerService } = await server.ssrLoadModule('/src/services/ownerService.js');

    setActiveRestaurantIdHeader('25');
    await ownerService.getBranches();
    await apiClient.get('/restaurant/applications');
    await locationApiService.getRestaurantLocationAndCoverage('25');

    assert.equal(calls.length, 3);
    assert.equal(calls[0].headers['X-Restaurant-Id'], '25');
    assert.equal(calls[1].headers['X-Restaurant-Id'], undefined);
    assert.match(calls[2].url, /\/restaurant\/location\?restaurant_id=25$/);
    assert.equal(calls[2].headers['X-Restaurant-Id'], '25');

    setActiveRestaurantIdHeader(null);
  } finally {
    globalThis.fetch = originalFetch;
    await server.close();
  }
});

test('Add Branch validation, payload builder, backend 422 mapping, and delivery coverage checklist', async () => {
  const server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL('../../../../', import.meta.url)),
    plugins: [reactPlugin()],
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent',
  });

  try {
    const {
      createInitialAddBranchForm,
      validateAddBranchForm,
      buildCreateBranchPayload,
      mapAddBranchBackendErrors,
    } = await server.ssrLoadModule('/src/features/restaurant/utils/branchWorkspaceUtils.js');
    const { deriveBusinessSetupChecklist } = await server.ssrLoadModule('/src/services/onboardingService.js');

    const form = createInitialAddBranchForm();
    form.branch_name = 'Makati';
    form.offers_delivery = false;
    form.offers_pickup = false;
    form.offers_dine_in = false;
    form.latitude = 14.55;
    form.longitude = null;

    const errors = validateAddBranchForm(form, { rootHasNoBranchName: true });
    assert.ok(errors.main_branch_name);
    assert.ok(errors.offers_delivery);
    assert.ok(errors.longitude);

    const mapped = mapAddBranchBackendErrors({
      errors: {
        offers_delivery: ['At least one service option is required.'],
        latitude: ['Latitude and longitude must be provided together.'],
      },
    });
    assert.equal(mapped.fieldErrors.offers_delivery, 'At least one service option is required.');
    assert.equal(mapped.fieldErrors.latitude, 'Latitude and longitude must be provided together.');

    form.main_branch_name = 'Main';
    form.offers_delivery = true;
    form.longitude = 121.02;
    const payload = buildCreateBranchPayload(form, { rootHasNoBranchName: true });
    assert.equal(payload.main_branch_name, 'Main');
    assert.equal(payload.branch_name, 'Makati');
    assert.equal(payload.offers_delivery, true);
    assert.equal(payload.latitude, 14.55);
    assert.equal(payload.longitude, 121.02);

    const checklist = deriveBusinessSetupChecklist({
      backendStatus: {
        menu: { complete: true },
        operating_hours: { complete: true },
        business_profile: { complete: true },
        publish: {
          complete: false,
          is_published: false,
          blockers: ['At least one delivery service area is required before publishing.'],
        },
      },
    });
    const coverageItem = checklist.items.find((item) => item.id === 'delivery_coverage');
    assert.ok(coverageItem);
    assert.equal(coverageItem.label, 'Set delivery coverage');
    assert.equal(coverageItem.done, false);
    assert.equal(coverageItem.href, '/owner/profile');
  } finally {
    await server.close();
  }
});

test('RestaurantAccessContext consumes server-provided permissions directly for staff positions (CLEAN-1(d))', async () => {
  const server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL('../../../../', import.meta.url)),
    plugins: [reactPlugin()],
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent',
  });

  try {
    const { resolveBackendAccessData } = await server.ssrLoadModule(
      '/src/features/restaurant/access/RestaurantAccessContext.jsx',
    );
    const { buildRestaurantAccess, canAccessNavigationItem } = await server.ssrLoadModule(
      '/src/features/restaurant/access/permissionMap.js',
    );

    const makeStaffUser = (position, permissions) => ({
      id: 77,
      user_id: 77,
      restaurant_ownerships: [],
      restaurant_staff_assignments: [
        {
          staff_id: 1,
          restaurant_id: 50,
          restaurant_name: 'Salo',
          restaurant_status: 'active',
          staff_position: position,
          staff_status: 'active',
          permissions,
        },
      ],
    });

    const menuMgrData = resolveBackendAccessData(
      makeStaffUser('Menu Manager', ['menu.view', 'menu.categories.manage', 'menu.items.create']),
    );
    const menuMgrAccess = buildRestaurantAccess({ id: 77 }, menuMgrData.memberships, menuMgrData.restaurants, '50');
    assert.equal(canAccessNavigationItem(menuMgrAccess, 'menu'), true);
    assert.equal(menuMgrAccess.canAccess(['menu.publish']), false);
    assert.equal(canAccessNavigationItem(menuMgrAccess, 'orders'), false);
    assert.equal(canAccessNavigationItem(menuMgrAccess, 'inventory'), false);
    assert.equal(canAccessNavigationItem(menuMgrAccess, 'profile'), false);

    const invMgrData = resolveBackendAccessData(
      makeStaffUser('Inventory Manager', ['inventory.view', 'inventory.addStock', 'menu.view']),
    );
    const invMgrAccess = buildRestaurantAccess({ id: 77 }, invMgrData.memberships, invMgrData.restaurants, '50');
    assert.equal(canAccessNavigationItem(invMgrAccess, 'inventory'), true);
    assert.equal(canAccessNavigationItem(invMgrAccess, 'menu'), true);
    assert.equal(canAccessNavigationItem(invMgrAccess, 'orders'), false);
  } finally {
    await server.close();
  }
});

test('Phase 5: deactivated branch fallback for staff, inbox branch display_name, and TeamAndStaffPage states', async () => {
  const server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL('../../../../', import.meta.url)),
    plugins: [reactPlugin()],
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent',
  });

  try {
    const { resolveBackendAccessData } = await server.ssrLoadModule(
      '/src/features/restaurant/access/RestaurantAccessContext.jsx',
    );
    const { buildRestaurantAccess } = await server.ssrLoadModule(
      '/src/features/restaurant/access/permissionMap.js',
    );
    const { normalizeStaffInvitation } = await server.ssrLoadModule(
      '/src/services/staffInvitationService.js',
    );
    const { default: AuthContext } = await server.ssrLoadModule('/src/contexts/AuthContext.jsx');
    const { default: ThemeContext } = await server.ssrLoadModule('/src/contexts/ThemeContext.jsx');
    const { RestaurantAccessProvider } = await server.ssrLoadModule(
      '/src/features/restaurant/access/RestaurantAccessContext.jsx',
    );
    const { default: TeamAndStaffPage } = await server.ssrLoadModule(
      '/src/features/restaurant/pages/TeamAndStaffPage.jsx',
    );
    const { MemoryRouter } = await import('react-router-dom');

    // 1. Staff with 1 inactive branch and 1 active branch lands on the active branch (inactive omitted from switcher)
    const staffTwoBranches = {
      id: 88,
      user_id: 88,
      restaurant_ownerships: [],
      restaurant_staff_assignments: [
        {
          staff_id: 1,
          restaurant_id: 61,
          restaurant_name: 'Salo Kitchen',
          branch_name: 'Makati',
          display_name: 'Salo Kitchen — Makati',
          restaurant_status: 'inactive',
          staff_position: 'Order Handler',
          staff_status: 'active',
          permissions: ['orders.view'],
        },
        {
          staff_id: 2,
          restaurant_id: 60,
          restaurant_name: 'Salo Kitchen',
          branch_name: 'Main',
          display_name: 'Salo Kitchen — Main',
          restaurant_status: 'active',
          staff_position: 'Manager',
          staff_status: 'active',
          permissions: ['orders.view', 'menu.view', 'menu.publish'],
        },
      ],
    };
    const resolved = resolveBackendAccessData(staffTwoBranches);
    assert.equal(resolved.restaurants.length, 1);
    assert.equal(resolved.restaurants[0].id, '60');
    const accessActive = buildRestaurantAccess({ id: 88 }, resolved.memberships, resolved.restaurants, '61');
    assert.equal(accessActive.selectedRestaurantId, '60');

    // 2. Staff with NO active branch keeps the inactive entry so OwnerLayout renders a clear unavailable message
    const staffOnlyInactive = {
      ...staffTwoBranches,
      restaurant_staff_assignments: [staffTwoBranches.restaurant_staff_assignments[0]],
    };
    const resolvedInactive = resolveBackendAccessData(staffOnlyInactive);
    assert.equal(resolvedInactive.restaurants.length, 1);
    assert.equal(resolvedInactive.restaurants[0].status, 'inactive');

    // 3. Invitation normalization preserves display_name with branch name
    const normalizedInv = normalizeStaffInvitation({
      staff_id: 5,
      restaurant_id: 61,
      restaurant_name: 'Salo Kitchen',
      branch_name: 'Makati',
      display_name: 'Salo Kitchen — Makati',
      staff_position: 'Order Handler',
      status: 'pending',
    });
    assert.equal(normalizedInv.display_name, 'Salo Kitchen — Makati');

    // 4. TeamAndStaffPage renders target branch label and All branches toggle for multi-branch owner
    const multiBranchOwner = {
      id: 99,
      user_id: 99,
      staff_positions: ['Manager', 'Order Handler', 'Menu Manager'],
      restaurant_ownerships: [
        { restaurant_id: 60, restaurant_name: 'Salo Kitchen', branch_name: 'Main', display_name: 'Salo Kitchen — Main', restaurant_status: 'active' },
        { restaurant_id: 61, restaurant_name: 'Salo Kitchen', branch_name: 'Makati', display_name: 'Salo Kitchen — Makati', restaurant_status: 'active' },
      ],
      restaurant_staff_assignments: [],
    };
    const teamHtml = renderToStaticMarkup(React.createElement(
      MemoryRouter,
      { initialEntries: ['/owner/team'] },
      React.createElement(
        ThemeContext.Provider,
        { value: { theme: 'light', setTheme: () => {}, toggleTheme: () => {} } },
        React.createElement(
          AuthContext.Provider,
          {
            value: {
              user: multiBranchOwner,
              isAuthenticated: true,
              loading: false,
              roles: ['customer', 'owner'],
              activeWorkspace: 'restaurant',
              availableWorkspaces: ['restaurant'],
              currentRole: 'restaurant',
            },
          },
          React.createElement(
            RestaurantAccessProvider,
            null,
            React.createElement(TeamAndStaffPage),
          ),
        ),
      ),
    ));
    assert.match(teamHtml, /Inviting to: Salo Kitchen — Main/);
    assert.match(teamHtml, /All branches/);
  } finally {
    await server.close();
  }
});
