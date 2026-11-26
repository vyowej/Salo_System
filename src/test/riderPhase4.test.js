import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import reactPlugin from '@vitejs/plugin-react';

test('Phase 4 Rider: deliveryFormatters, AvailableDeliveryCard, RiderAvatarControl, and authService avatar mapping', async () => {
  const server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL('../../', import.meta.url)),
    plugins: [reactPlugin()],
    server: { middlewareMode: true },
    ssr: { external: ['react', 'react-dom', 'react-router-dom', 'leaflet', 'react-leaflet'] },
    appType: 'custom',
    logLevel: 'silent',
  });

  try {
    const { formatPeso, formatDeliveryAddress, formatPlacedAgo } = await server.ssrLoadModule(
      '/src/features/rider/utils/deliveryFormatters.js',
    );
    const { default: AvailableDeliveryCard } = await server.ssrLoadModule(
      '/src/features/rider/components/AvailableDeliveryCard.jsx',
    );
    const { default: RiderAvatarControl } = await server.ssrLoadModule(
      '/src/features/rider/components/RiderAvatarControl.jsx',
    );
    const { normalizeUser } = await server.ssrLoadModule('/src/services/authService.js');
    const { AuthProvider } = await server.ssrLoadModule('/src/contexts/AuthContext.jsx');

    // 1. Formatters
    assert.match(formatPeso(145.5), /145\.50/);
    assert.equal(
      formatDeliveryAddress({
        street: '123 Rizal St',
        barangay: 'Carmen',
        city: 'Cagayan de Oro City',
        province: 'Misamis Oriental',
        postal_code: '9000',
      }),
      '123 Rizal St, Brgy. Carmen, Cagayan de Oro City, Misamis Oriental 9000',
    );
    const now = Date.parse('2026-11-26T08:00:00Z');
    assert.equal(formatPlacedAgo('2026-11-26T07:55:00Z', now), '5m ago');
    assert.equal(formatPlacedAgo('2026-11-26T07:59:40Z', now), 'Just now');

    // 2. AvailableDeliveryCard renders COD pill, formal addresses, fee, items, and Accept button
    const cardHtml = renderToStaticMarkup(
      React.createElement(AvailableDeliveryCard, {
        delivery: {
          order_id: 901,
          order_reference: 'ORD-901',
          restaurant_name: 'Kusina ni Juan',
          item_count: 3,
          delivery_fee: 45,
          order_total: 390,
          payment_method: 'cod',
          cod_amount: 390,
          pickup_address_text: '10 Ayala Ave, Brgy. Bel-Air, Makati City, Metro Manila',
          dropoff_address_text: '25 Jupiter St, Brgy. Bel-Air, Makati City, Metro Manila',
          placed_at: new Date(Date.now() - 3 * 60 * 1000).toISOString(),
        },
        onAccept: () => {},
      }),
    );

    assert.match(cardHtml, /Kusina ni Juan/);
    assert.match(cardHtml, /ORD-901/);
    assert.match(cardHtml, /3 items/);
    assert.match(cardHtml, /Collect COD/);
    assert.match(cardHtml, /Accept delivery/);
    assert.equal(/\dkm/.test(cardHtml), false);

    // 3. RiderAvatarControl renders upload, camera, and remove controls
    const avatarHtml = renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(
          AuthProvider,
          null,
          React.createElement(RiderAvatarControl, {
            avatarUrl: 'http://localhost/storage/riders/1/profile/test.jpg',
            displayName: 'Marco Reyes',
          }),
        ),
      ),
    );
    assert.match(avatarHtml, /Change photo/);
    assert.match(avatarHtml, /Take photo/);
    assert.match(avatarHtml, /Remove/);

    // 4. authService normalizeUser maps rider_profile.profile_photo into avatar
    const normalized = normalizeUser({
      user_id: 42,
      username: 'marco_rider',
      first_name: 'Marco',
      last_name: 'Reyes',
      roles: ['customer', 'rider'],
      rider_profile: {
        rider_id: 7,
        rider_status: 'active',
        profile_photo: 'http://localhost/api/media/images/abc1234567890',
      },
    });
    assert.equal(normalized.avatar, 'http://localhost/api/media/images/abc1234567890');
  } finally {
    await server.close();
  }
});
