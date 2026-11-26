import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import reactPlugin from '@vitejs/plugin-react';

test('Phase 7: ItemizedPaymentSummary distance helper, pending quote state, buildCheckoutPayload quotes, and rider distance_km', async () => {
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
    const { default: ItemizedPaymentSummary } = await server.ssrLoadModule(
      '/src/features/customer/components/ItemizedPaymentSummary.jsx',
    );
    const { buildCheckoutPayload } = await server.ssrLoadModule(
      '/src/features/customer/utils/checkoutAddressValidation.js',
    );
    const { default: AvailableDeliveryCard } = await server.ssrLoadModule(
      '/src/features/rider/components/AvailableDeliveryCard.jsx',
    );
    const { buildQuoteCacheKey } = await server.ssrLoadModule(
      '/src/features/customer/hooks/useDeliveryFeeQuotes.js',
    );

    // 0. Quote cache key includes coordinates so address coordinate edits invalidate stale quotes
    const k1 = buildQuoteCacheKey({
      restaurantId: 1,
      fulfillment: 'delivery',
      deliveryAddress: { address_id: 55, latitude: 14.6, longitude: 121.0 },
    });
    const k2 = buildQuoteCacheKey({
      restaurantId: 1,
      fulfillment: 'delivery',
      deliveryAddress: { address_id: 55, latitude: 14.7, longitude: 121.0 },
    });
    assert.notEqual(k1, k2);

    // 1. ItemizedPaymentSummary shows distance helper and pending state
    const readyHtml = renderToStaticMarkup(
      React.createElement(ItemizedPaymentSummary, {
        subOrders: [
          {
            subOrderKey: '1:single',
            restaurantName: 'Kusina A',
            fulfillment: 'delivery',
            deliveryAddressText: '123 Rizal St',
            deliveryFee: 69,
            distanceKm: 3.5,
            subtotal: 150,
            items: [{ menu_item_id: 10, name: 'Sisig', price: 150, quantity: 1 }],
          },
        ],
      }),
    );
    assert.match(readyHtml, /\(3\.5 km\)/);
    assert.match(readyHtml, /₱69\.00/);
    assert.match(readyHtml, /₱219\.00/);

    const pendingHtml = renderToStaticMarkup(
      React.createElement(ItemizedPaymentSummary, {
        subOrders: [
          {
            subOrderKey: '1:single',
            restaurantName: 'Kusina A',
            fulfillment: 'delivery',
            deliveryAddressText: '123 Rizal St',
            deliveryFee: null,
            distanceKm: null,
            subtotal: 150,
            items: [{ menu_item_id: 10, name: 'Sisig', price: 150, quantity: 1 }],
          },
        ],
      }),
    );
    assert.match(pendingHtml, /Calculating\.\.\./);

    // 2. buildCheckoutPayload uses deliveryFeeQuotesByKey for expected_total
    const payload = buildCheckoutPayload({
      idempotencyKey: 'k-phase7',
      deliveryFeeQuotesByKey: {
        '1:single': { deliveryFee: 79, distanceKm: 5.0 },
      },
      restaurantGroups: [
        {
          restaurantId: 1,
          restaurantName: 'Kusina A',
          fulfillment: 'delivery',
          addressMode: 'single',
          deliveryAddress: { address_id: 55 },
          deliveryFee: 49,
          subtotal: 200,
          items: [{ menu_item_id: 10, name: 'Sisig', price: 200, quantity: 1 }],
        },
      ],
    });
    assert.equal(payload.groups[0].expected_total, 279);

    // 3. CheckoutPage disables button until quotes are ready and shows Retry on error
    const checkoutSrc = await fs.readFile(
      new URL('../features/customer/pages/CheckoutPage.jsx', import.meta.url),
      'utf8',
    );
    assert.match(checkoutSrc, /useDeliveryFeeQuotes/);
    assert.match(checkoutSrc, /allDeliveryQuotesReady/);
    assert.match(checkoutSrc, /Calculating Delivery Fees\.\.\./);
    assert.match(checkoutSrc, /retryQuotes/);

    // 4. Rider AvailableDeliveryCard displays distance_km
    const riderCardHtml = renderToStaticMarkup(
      React.createElement(AvailableDeliveryCard, {
        delivery: {
          order_id: 1,
          order_reference: 'ORD-1',
          restaurant_name: 'Kusina A',
          item_count: 2,
          delivery_fee: 69,
          distance_km: 3.5,
          order_total: 269,
          pickup_address_text: 'Pickup',
          dropoff_address_text: 'Dropoff',
          placed_at: new Date().toISOString(),
        },
        onAccept: () => {},
      }),
    );
    assert.match(riderCardHtml, /3\.5 km/);
  } finally {
    await server.close();
  }
});
