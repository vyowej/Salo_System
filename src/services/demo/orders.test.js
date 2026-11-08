import assert from 'node:assert/strict';
import test from 'node:test';
import { demoAdapter } from './demoAdapter.js';

function useDemoUser(user = { id: 2, email: 'owner@salo.ph', role: 'owner' }) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const storage = new Map();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: (key) => storage.delete(key),
    },
  });
  globalThis.localStorage.setItem('salo_user', JSON.stringify(user));
  return () => {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else delete globalThis.localStorage;
  };
}

function createOrderFixture() {
  return demoAdapter.createCustomerOrder({
    paymentMethod: 'Cash on Delivery',
    paymentStatus: 'Pending COD Collection',
    subOrders: [
      {
        restaurantId: 'dalisay-heritage',
        status: 'Pending Confirmation',
        fulfillment: 'pickup',
        pickupInformation: 'Counter pickup',
        subtotal: 240,
        items: [{ name: 'Test dish', qty: 2, price: 120, addOns: [{ name: 'Rice', price: 15 }] }],
      },
      {
        restaurantId: 'manila-artisan-pizza',
        status: 'Pending Confirmation',
        fulfillment: 'delivery',
        deliveryAddress: 'Customer address',
        deliveryInstructions: 'Ring bell',
        subtotal: 520,
        deliveryFee: 59,
        items: [{ name: 'Test pizza', qty: 1, price: 520, addOns: [] }],
      },
    ],
  });
}

test('checkout orders are visible only as their own restaurant sub-orders', () => {
  const order = createOrderFixture();
  const dalisayOrders = demoAdapter.getOrders('dalisay-heritage');
  const pizzaOrders = demoAdapter.getOrders('manila-artisan-pizza');
  const dalisaySubOrder = dalisayOrders.find((entry) => entry.orderReference === order.id);
  const pizzaSubOrder = pizzaOrders.find((entry) => entry.orderReference === order.id);

  assert.ok(dalisaySubOrder);
  assert.ok(pizzaSubOrder);
  assert.equal(dalisaySubOrder.restaurantId, 'dalisay-heritage');
  assert.equal(pizzaSubOrder.restaurantId, 'manila-artisan-pizza');
  assert.equal(dalisaySubOrder.deliveryAddress, undefined);
  assert.equal(pizzaSubOrder.deliveryAddress, 'Customer address');
  assert.equal(demoAdapter.getOrders('dalisay-heritage', { canViewCustomer: false })
    .find((entry) => entry.id === dalisaySubOrder.id).customerName, undefined);
});

test('restaurant order transitions require valid states and rejection reasons', () => {
  const order = createOrderFixture();
  const subOrder = order.subOrders[0];

  assert.throws(
    () => demoAdapter.updateOrderStatus(subOrder.id, 'Rejected', 'dalisay-heritage'),
    /rejection reason is required/,
  );
  assert.throws(
    () => demoAdapter.updateOrderStatus(subOrder.id, 'Completed', 'dalisay-heritage'),
    /cannot move from Pending to Completed/,
  );
  assert.throws(
    () => demoAdapter.updateOrderStatus(subOrder.id, 'Accepted', 'manila-artisan-pizza'),
    /could not be found/,
  );

  demoAdapter.updateOrderStatus(subOrder.id, 'Accepted', 'dalisay-heritage');
  demoAdapter.updateOrderStatus(subOrder.id, 'Preparing', 'dalisay-heritage');
  demoAdapter.updateOrderStatus(subOrder.id, 'Ready for Pickup', 'dalisay-heritage');
  demoAdapter.updateOrderStatus(subOrder.id, 'Completed', 'dalisay-heritage');

  assert.equal(demoAdapter.getCustomerOrder(order.id).subOrders[0].status, 'Completed');
  assert.equal(demoAdapter.getCustomerOrder(order.id).subOrders[1].status, 'Pending');
  assert.equal(demoAdapter.getCustomerOrder(order.id).overallStatus, 'In Progress');
  assert.equal(demoAdapter.getCustomerOrders().find((entry) => entry.id === order.id).overallStatus, 'In Progress');
});

test('a restaurant rejection records its reason without changing another sub-order', () => {
  const order = createOrderFixture();
  const rejectedSubOrder = order.subOrders[0];

  demoAdapter.updateOrderStatus(rejectedSubOrder.id, 'Rejected', 'dalisay-heritage', {
    reason: 'Item unavailable',
  });

  const updated = demoAdapter.getCustomerOrder(order.id);
  assert.equal(updated.subOrders[0].status, 'Rejected');
  assert.equal(updated.subOrders[0].rejectionReason, 'Item unavailable');
  assert.equal(updated.subOrders[1].status, 'Pending');
  assert.equal(updated.overallStatus, 'In Progress');
});

test('cancellation remains a request until each restaurant resolves its own sub-order', () => {
  const order = createOrderFixture();

  assert.throws(
    () => demoAdapter.requestOrderCancellation(order.id, ''),
    /Provide a reason/,
  );
  const requested = demoAdapter.requestOrderCancellation(order.id, 'Customer changed plans');
  assert.equal(requested.overallStatus, 'Cancellation Requested');
  assert.equal(demoAdapter.getOrders('dalisay-heritage').find((entry) => entry.id === order.subOrders[0].id).status, 'Pending');
  assert.throws(
    () => demoAdapter.resolveOrderCancellation(order.subOrders[0].id, 'reject', 'dalisay-heritage', ''),
    /reason when rejecting/,
  );

  demoAdapter.resolveOrderCancellation(order.subOrders[0].id, 'approve', 'dalisay-heritage');
  demoAdapter.resolveOrderCancellation(order.subOrders[1].id, 'reject', 'manila-artisan-pizza', 'Already dispatched');
  const updated = demoAdapter.getCustomerOrder(order.id);

  assert.equal(updated.subOrders[0].status, 'Cancelled');
  assert.equal(updated.subOrders[0].cancellationRequest.status, 'approved');
  assert.equal(updated.subOrders[1].status, 'Pending');
  assert.equal(updated.subOrders[1].cancellationRequest.status, 'rejected');
  assert.equal(updated.overallStatus, 'In Progress');
});

test('customer reservations share the demo store and block invalid lifecycle transitions', () => {
  const restoreStorage = useDemoUser();
  try {
  const reservation = demoAdapter.createCustomerReservation({
    restaurantId: 'dalisay-heritage',
    guestName: 'Test Guest',
    guestEmail: 'guest@example.com',
    guestPhone: '09170000000',
    date: '2026-12-19',
    time: '7:00 PM',
    guests: 4,
    seatingArea: 'Main Dining Hall',
    depositAmount: 500,
    serviceFee: 50,
    totalPaid: 550,
  });

  assert.equal(reservation.status, 'Pending');
  assert.ok(demoAdapter.getCustomerReservations().some((entry) => entry.id === reservation.id));
  assert.ok(demoAdapter.getReservations('dalisay-heritage').some((entry) => entry.id === reservation.id));
  assert.throws(
    () => demoAdapter.updateReservationStatus(reservation.id, 'Completed', 'dalisay-heritage'),
    /cannot move from Pending to Completed/,
  );

  demoAdapter.updateReservationStatus(reservation.id, 'Approved', 'dalisay-heritage');
  demoAdapter.updateReservationStatus(reservation.id, 'Confirmed', 'dalisay-heritage');
  demoAdapter.assignReservationTable(reservation.id, 'TBL-103', 'dalisay-heritage');
  demoAdapter.updateReservationStatus(reservation.id, 'Arrived', 'dalisay-heritage');
  demoAdapter.confirmReservationTable(reservation.id, 'dalisay-heritage');
  demoAdapter.updateReservationStatus(reservation.id, 'Seated', 'dalisay-heritage');
  demoAdapter.updateReservationStatus(reservation.id, 'Completed', 'dalisay-heritage');

  const updated = demoAdapter.getCustomerReservations().find((entry) => entry.id === reservation.id);
  assert.equal(updated.status, 'Completed');
  } finally {
    restoreStorage();
  }
});
