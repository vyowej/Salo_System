import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import reactPlugin from '@vitejs/plugin-react';

test('Phase 5: ItemizedPaymentSummary matches expected_total for cases (a), (b), (c), pickup, and OrderReceiptView renders per role with print stylesheet', async () => {
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
    const {
      expandRestaurantGroupsToSubOrders,
      buildCheckoutPayload,
    } = await server.ssrLoadModule('/src/features/customer/utils/checkoutAddressValidation.js');
    const { computePaymentSummaryModel } = await server.ssrLoadModule(
      '/src/features/customer/utils/paymentSummaryUtils.js',
    );
    const { default: ItemizedPaymentSummary } = await server.ssrLoadModule(
      '/src/features/customer/components/ItemizedPaymentSummary.jsx',
    );
    const { default: OrderReceiptView } = await server.ssrLoadModule(
      '/src/features/orders/components/OrderReceiptView.jsx',
    );

    const addr1 = {
      address_id: 101,
      street: '123 Rizal St',
      barangay: 'Carmen',
      city: 'Cagayan de Oro City',
      province: 'Misamis Oriental',
      postal_code: '9000',
    };
    const addr2 = {
      address_id: 102,
      street: '45 Velez St',
      barangay: 'Barangay 1',
      city: 'Cagayan de Oro City',
      province: 'Misamis Oriental',
      postal_code: '9000',
    };

    // Case (a): 1 restaurant -> 1 address
    const caseAGroups = [
      {
        restaurantId: 1,
        restaurantName: 'Kusina A',
        fulfillment: 'delivery',
        addressMode: 'single',
        deliveryAddress: addr1,
        baseDeliveryFee: 49,
        deliveryFee: 49,
        subtotal: 300,
        items: [{ menu_item_id: 10, name: 'Pork Sisig', price: 150, quantity: 2 }],
      },
    ];
    const subA = expandRestaurantGroupsToSubOrders(caseAGroups);
    const payloadA = buildCheckoutPayload({ restaurantGroups: caseAGroups, idempotencyKey: 'k-a' });
    const modelA = computePaymentSummaryModel(subA);
    assert.equal(modelA.grandTotal, payloadA.groups.reduce((s, g) => s + g.expected_total, 0));
    const htmlA = renderToStaticMarkup(React.createElement(ItemizedPaymentSummary, { subOrders: subA }));
    assert.match(htmlA, /Delivery fee/);
    assert.equal(htmlA.includes('Combined delivery fees'), false);

    // Case (b): 2 restaurants -> 1 address
    const caseBGroups = [
      ...caseAGroups,
      {
        restaurantId: 2,
        restaurantName: 'Kusina B',
        fulfillment: 'delivery',
        addressMode: 'single',
        deliveryAddress: addr1,
        baseDeliveryFee: 49,
        deliveryFee: 49,
        subtotal: 120,
        items: [{ menu_item_id: 20, name: 'Halo-Halo', price: 120, quantity: 1 }],
      },
    ];
    const subB = expandRestaurantGroupsToSubOrders(caseBGroups);
    const payloadB = buildCheckoutPayload({ restaurantGroups: caseBGroups, idempotencyKey: 'k-b' });
    const modelB = computePaymentSummaryModel(subB);
    assert.equal(modelB.grandTotal, payloadB.groups.reduce((s, g) => s + g.expected_total, 0));
    const htmlB = renderToStaticMarkup(React.createElement(ItemizedPaymentSummary, { subOrders: subB }));
    assert.match(htmlB, /Combined delivery fees/);

    // Case (c): 1 restaurant -> 2 different addresses
    const caseCGroups = [
      {
        restaurantId: 1,
        restaurantName: 'Kusina A',
        fulfillment: 'delivery',
        addressMode: 'multiple',
        baseDeliveryFee: 49,
        deliveryFee: 98,
        subtotal: 300,
        items: [
          { menu_item_id: 10, name: 'Pork Sisig', price: 150, quantity: 1, deliveryAddress: addr1 },
          { menu_item_id: 11, name: 'Chicken Inasal', price: 150, quantity: 1, deliveryAddress: addr2 },
        ],
      },
    ];
    const subC = expandRestaurantGroupsToSubOrders(caseCGroups);
    const payloadC = buildCheckoutPayload({ restaurantGroups: caseCGroups, idempotencyKey: 'k-c' });
    const modelC = computePaymentSummaryModel(subC);
    assert.equal(payloadC.groups.length, 2);
    assert.equal(modelC.deliveryGroupCount, 2);
    assert.equal(modelC.combinedDeliveryFees, 98);
    assert.equal(modelC.grandTotal, payloadC.groups.reduce((s, g) => s + g.expected_total, 0));
    const htmlC = renderToStaticMarkup(React.createElement(ItemizedPaymentSummary, { subOrders: subC }));
    assert.match(htmlC, /123 Rizal St, Brgy\. Carmen/);
    assert.match(htmlC, /45 Velez St, Barangay 1/);
    assert.match(htmlC, /Combined delivery fees/);

    // Pickup group shows No delivery fee
    const pickupHtml = renderToStaticMarkup(
      React.createElement(ItemizedPaymentSummary, {
        subOrders: [
          {
            subOrderKey: '1:pickup',
            restaurantName: 'Kusina Pickup',
            fulfillment: 'pickup',
            deliveryFee: 0,
            subtotal: 200,
            items: [{ menu_item_id: 30, name: 'Pancit', price: 200, quantity: 1 }],
          },
        ],
      }),
    );
    assert.match(pickupHtml, /No delivery fee/);

    // Receipts per role + print class + print CSS
    const custReceiptHtml = renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(OrderReceiptView, {
          backTo: '/customer/orders/1',
          receipt: {
            role: 'customer',
            receipt_number: 'RCP-ORD-101',
            order_reference: 'ORD-101',
            restaurant_name: 'Kusina A',
            order_type: 'delivery',
            placed_at: '2026-11-26T12:00:00+08:00',
            finalized_at: '2026-11-26T12:30:00+08:00',
            delivery_address_text: '123 Rizal St, Brgy. Carmen, Cagayan de Oro City, Misamis Oriental 9000',
            rider_first_name: 'Marco',
            items: [{ order_item_id: 1, item_name: 'Pork Sisig', quantity: 2, line_total: 300 }],
            subtotal_amount: 300,
            delivery_fee: 49,
            total_amount: 349,
            payment_method: 'cod',
            payment_status_label: 'Paid in cash',
            sibling_orders: [],
          },
        }),
      ),
    );
    assert.match(custReceiptHtml, /RCP-ORD-101/);
    assert.match(custReceiptHtml, /Marco/);
    assert.match(custReceiptHtml, /salo-receipt-no-print/);
    assert.match(custReceiptHtml, /Print receipt/);

    const riderReceiptHtml = renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(OrderReceiptView, {
          backTo: '/rider/history',
          receipt: {
            role: 'rider',
            receipt_number: 'RCP-ORD-101',
            order_reference: 'ORD-101',
            restaurant_name: 'Kusina A',
            pickup_address_text: '10 Ayala Ave',
            dropoff_address_text: '123 Rizal St, Brgy. Carmen',
            order_type: 'delivery',
            placed_at: '2026-11-26T12:00:00+08:00',
            finalized_at: '2026-11-26T12:30:00+08:00',
            delivery_fee: 49,
            total_amount: 349,
            payment_method: 'cod',
            payment_status_label: 'Paid in cash',
            cod_amount_collected: 349,
            cod_remittance_status: 'pending',
          },
        }),
      ),
    );
    assert.match(riderReceiptHtml, /Delivery Receipt/);
    assert.match(riderReceiptHtml, /COD collected/);

    const cssText = await fs.readFile(
      new URL('../features/orders/components/OrderReceiptView.css', import.meta.url),
      'utf8',
    );
    assert.match(cssText, /@media print/);
  } finally {
    await server.close();
  }
});
