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

    const html = renderToStaticMarkup(React.createElement(
      AuthContext.Provider,
      { value: { user: { id: 2, email: 'owner@salo.ph' } } },
      React.createElement(RestaurantAccessProvider, null, React.createElement(Probe)),
    ));

    assert.match(html, />true:2:true</);
    const fallbackHtml = renderToStaticMarkup(React.createElement(
      AuthContext.Provider,
      { value: { user: { id: 2, email: 'owner@salo.ph' } } },
      React.createElement(Probe),
    ));
    assert.match(fallbackHtml, />true:2:true</);
  } finally {
    await server.close();
  }
});
