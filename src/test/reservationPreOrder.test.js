import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const ROOT_DIR = fileURLToPath(new URL('../../', import.meta.url));

async function withViteModules(run) {
  const server = await createServer({
    configFile: false,
    root: ROOT_DIR,
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent',
  });
  try {
    const apiMod = await server.ssrLoadModule('/src/services/apiClient.js');
    const custMod = await server.ssrLoadModule('/src/services/customerService.js');
    const ownerMod = await server.ssrLoadModule('/src/services/ownerService.js');
    const adminMod = await server.ssrLoadModule('/src/services/adminApiService.js');
    await run({
      apiClient: apiMod.default,
      customerService: custMod.default,
      normalizeReservation: custMod.normalizeReservation,
      normalizeReservationPreOrder: custMod.normalizeReservationPreOrder,
      ownerService: ownerMod.ownerService,
      normalizeOwnerReservation: ownerMod.normalizeOwnerReservation,
      normalizeAdminReservation: adminMod.normalizeAdminReservation,
    });
  } finally {
    await server.close();
  }
}

test('reservation pre-order normalization, booking payload, and status/edit endpoints', async () => {
  await withViteModules(async ({
    apiClient,
    customerService,
    normalizeReservation,
    normalizeReservationPreOrder,
    ownerService,
    normalizeOwnerReservation,
    normalizeAdminReservation,
  }) => {
    const preOrder = normalizeReservationPreOrder({
      order_id: 55,
      order_reference: 'SALO-PRE-20261127-AB12C',
      order_type: 'dine_in',
      order_status: 'preparing',
      notes: 'Serve starters first',
      subtotal_amount: '680.00',
      delivery_fee: '0.00',
      total_amount: '680.00',
      item_count: 3,
      can_customer_edit: false,
      edit_blocked_reason: 'The kitchen has already started preparing your pre-order.',
      allowed_actions: ['ready', 'cancel'],
      items: [
        {
          order_item_id: 1,
          menu_item_id: 10,
          item_name: 'Crispy Sisig',
          unit_price: '280.00',
          quantity: 2,
          special_instructions: 'Extra crispy',
          line_total: '560.00',
          add_ons: [
            { order_item_add_on_id: 3, add_on_option_id: 8, group_name: 'Size', option_name: 'Large', additional_price: '30.00' },
          ],
        },
      ],
    });

    assert.equal(preOrder.orderId, 55);
    assert.equal(preOrder.orderType, 'dine_in');
    assert.equal(preOrder.statusLabel, 'Preparing');
    assert.equal(preOrder.deliveryFee, 0);
    assert.equal(preOrder.totalAmount, 680);
    assert.equal(preOrder.canCustomerEdit, false);
    assert.equal(preOrder.items.length, 1);
    assert.equal(preOrder.items[0].addOns[0].optionName, 'Large');

    const res = normalizeReservation({ reservation_id: 99, pre_order: null });
    assert.equal(res.preOrder, null);

    const ownerRes = normalizeOwnerReservation({
      reservation_id: 99,
      pre_order: { order_id: 55, order_status: 'pending', items: [] },
    });
    assert.equal(ownerRes.preOrder.orderId, 55);

    const adminResWithPreOrder = normalizeAdminReservation({
      reservation_id: 99,
      pre_order: {
        order_id: 55,
        order_reference: 'SALO-PRE-20261127-AB12C',
        order_status: 'cancelled',
        subtotal_amount: '280.00',
        delivery_fee: '0.00',
        total_amount: '280.00',
        items: [{ order_item_id: 1, item_name: 'Sisig', quantity: 1, unit_price: '280.00', line_total: '280.00', add_ons: [] }],
      },
    });
    assert.equal(adminResWithPreOrder.pre_order.orderStatus, 'cancelled');
    assert.equal(adminResWithPreOrder.pre_order.statusLabel, 'Cancelled');
    assert.equal(adminResWithPreOrder.pre_order.items.length, 1);

    const adminResWithoutPreOrder = normalizeAdminReservation({ reservation_id: 100, pre_order: null });
    assert.equal(adminResWithoutPreOrder.pre_order, null);

    const origPost = apiClient.post;
    const origPut = apiClient.put;
    let capturedCreateBody = null;
    let capturedPut = null;
    let capturedStatus = null;

    apiClient.post = async (url, body) => {
      if (url === '/customer/reservations') {
        capturedCreateBody = body;
        return { data: { reservation: { reservation_id: 10, pre_order: { order_id: 77, order_status: 'pending', items: [] } } } };
      }
      capturedStatus = { url, body };
      return { data: { pre_order: { order_id: 88, order_status: 'preparing', items: [] } } };
    };
    apiClient.put = async (url, body) => {
      capturedPut = { url, body };
      return { data: { pre_order: { order_id: 88, order_status: 'accepted', items: [] } } };
    };

    try {
      const created = await customerService.createReservation({
        restaurantId: 5,
        start: '2026-11-28T18:00',
        partySize: 2,
        idempotencyKey: 'test-key-1234',
        preOrder: {
          notes: 'No peanuts',
          items: [{ menuItemId: 12, quantity: 2, addOnOptionIds: [4], specialInstructions: 'Less salt' }],
        },
      });
      assert.equal(capturedCreateBody.pre_order.notes, 'No peanuts');
      assert.equal(capturedCreateBody.pre_order.items[0].menu_item_id, 12);
      assert.deepEqual(capturedCreateBody.pre_order.items[0].add_on_option_ids, [4]);
      assert.equal(created.preOrder.orderId, 77);

      const updated = await customerService.updateReservationPreOrder(15, {
        items: [{ menuItemId: 9, quantity: 1 }],
        notes: 'Quick',
      });
      assert.equal(capturedPut.url, '/customer/reservations/15/pre-order');
      assert.equal(updated.orderId, 88);

      const statusRes = await ownerService.updateReservationPreOrderStatus(3, 15, { action: 'prepare' });
      assert.equal(capturedStatus.url, '/restaurant/reservations/15/pre-order/status');
      assert.equal(capturedStatus.body.action, 'prepare');
      assert.equal(statusRes.orderStatus, 'preparing');
    } finally {
      apiClient.post = origPost;
      apiClient.put = origPut;
    }
  });
});
