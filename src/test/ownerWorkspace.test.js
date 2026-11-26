import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createServer } from 'vite';

const ROOT_DIR = fileURLToPath(new URL('../../', import.meta.url));

test('ownerService calls Step 7 backend APIs with FormData for media and surfaces 403/409/422 errors', async () => {
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
    const { ownerService } = await server.ssrLoadModule('/src/services/ownerService.js');

    clearCsrfCache();

    globalThis.fetch = async (url, init = {}) => {
      calls.push({ url, init });

      if (url.endsWith('/auth/csrf')) {
        return new Response(
          JSON.stringify({ success: true, data: { csrf_token: 'owner-csrf' } }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      if (url.includes('/restaurant/profile/media')) {
        return new Response(
          JSON.stringify({ success: true, data: { profile: { restaurant_id: 5, logo_image: 'http://localhost:8000/storage/restaurants/5/logo.png' } } }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      if (url.includes('/restaurant/profile')) {
        if (init.method === 'PATCH') {
          return new Response(
            JSON.stringify({
              success: false,
              message: 'The given data was invalid.',
              errors: { offers_delivery: ['At least one ordering service must remain enabled.'] },
            }),
            { status: 422, headers: { 'Content-Type': 'application/json' } },
          );
        }
        return new Response(
          JSON.stringify({ success: true, data: { profile: { restaurant_id: 5, restaurant_name: 'Active Spot' } } }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      if (url.includes('/restaurant/menu/items/99')) {
        if (init.method === 'DELETE') {
          return new Response(
            JSON.stringify({
              success: false,
              message: 'This menu item cannot be deleted because it is referenced by existing orders. Set its availability to Hidden instead.',
            }),
            { status: 409, headers: { 'Content-Type': 'application/json' } },
          );
        }
      }

      if (url.endsWith('/restaurant/menu/items') && init.method === 'POST') {
        return new Response(
          JSON.stringify({ success: true, data: { item: { id: 101, name: 'Adobo', approval_status: 'approved' } } }),
          { status: 201, headers: { 'Content-Type': 'application/json' } },
        );
      }

      return new Response('{}', { status: 404 });
    };

    const profile = await ownerService.getProfile(5);
    assert.equal(profile.restaurant_name, 'Active Spot');

    await assert.rejects(
      () => ownerService.updateProfile(5, { offers_delivery: false, offers_pickup: false }),
      (err) => err.status === 422 && Boolean(err.errors?.offers_delivery),
    );

    const logoFile = new File(['png'], 'logo.png', { type: 'image/png' });
    const branded = await ownerService.updateBranding(5, { logoFile });
    assert.ok(branded.logo_image.includes('/storage/restaurants/5/'));

    const mediaCall = calls.find((c) => c.url.includes('/restaurant/profile/media'));
    assert.ok(mediaCall.init.body instanceof FormData);
    assert.equal(mediaCall.init.headers['Content-Type'], undefined);

    const createdItem = await ownerService.createMenuItem(5, {
      menu_category_id: 1,
      item_name: 'Adobo',
      base_price: 180,
      availability_status: 'available',
    }, logoFile);
    assert.equal(createdItem.approval_status, 'approved');

    await assert.rejects(
      () => ownerService.deleteMenuItemApi(5, 99),
      (err) => err.status === 409 && err.message.includes('Hidden'),
    );
  } finally {
    globalThis.fetch = previousFetch;
    await server.close();
  }
});

test('OwnerLayout, OwnerProfilePage, and OwnerMenuPage enforce non-active gate, read-only name, and Coming soon fields', async () => {
  const layoutSrc = await fs.readFile(new URL('../layouts/OwnerLayout.jsx', import.meta.url), 'utf8');
  assert.ok(layoutSrc.includes("selectedRestaurant.status !== 'active'"));
  assert.ok(layoutSrc.includes('/become-a-partner/status'));

  const profileSrc = await fs.readFile(
    new URL('../features/restaurant/pages/OwnerProfilePage.jsx', import.meta.url),
    'utf8',
  );
  assert.ok(profileSrc.includes('Restaurant name cannot be changed after approval.'));

  const menuSrc = await fs.readFile(
    new URL('../features/restaurant/pages/OwnerMenuPage.jsx', import.meta.url),
    'utf8',
  );
  assert.ok(menuSrc.includes('Price (₱)'));
  assert.equal(menuSrc.includes('Coming soon'), false);
});
