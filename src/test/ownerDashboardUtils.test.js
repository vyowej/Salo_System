import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatPeso,
  getOrderStatusBadge,
  formatOrderStatusLabel,
  toLocalDateKey,
  computeDashboardStatsFromOrders,
  getReservationStatusBadge,
} from '../features/restaurant/utils/ownerDashboardUtils.js';

test('ownerDashboardUtils formats peso, badges, and status labels accurately', () => {
  assert.equal(formatPeso(1250), '₱1,250');
  assert.equal(formatPeso(0), '₱0');

  assert.equal(getOrderStatusBadge('pending'), 'warning');
  assert.equal(getOrderStatusBadge('COMPLETED'), 'success');
  assert.equal(getOrderStatusBadge('unknown'), 'default');

  assert.equal(formatOrderStatusLabel('ready', 'pickup'), 'Ready for Pickup');
  assert.equal(formatOrderStatusLabel('ready', 'delivery'), 'Ready for Dispatch');
  assert.equal(formatOrderStatusLabel('out_for_delivery', 'delivery'), 'Out for Delivery');

  assert.equal(getReservationStatusBadge('Pending'), 'warning');
  assert.equal(getReservationStatusBadge('Confirmed'), 'success');
  assert.equal(getReservationStatusBadge('Other'), 'default');
});

test('computeDashboardStatsFromOrders aggregates today, weekly, monthly, and AOV metrics', () => {
  const now = new Date(2026, 10, 20, 12, 0, 0);
  assert.equal(toLocalDateKey(now), '2026-11-20');

  const orders = [
    { status: 'completed', total: 300, createdAt: new Date(2026, 10, 20, 9, 0, 0).toISOString() },
    { status: 'pending', total: 200, createdAt: new Date(2026, 10, 20, 10, 0, 0).toISOString() },
    { status: 'delivered', total: 500, createdAt: new Date(2026, 10, 18, 10, 0, 0).toISOString() },
    { status: 'cancelled', total: 999, createdAt: new Date(2026, 10, 20, 11, 0, 0).toISOString() },
  ];
  const reservations = [{ status: 'Pending' }, { status: 'Confirmed' }];

  const result = computeDashboardStatsFromOrders(orders, reservations, now);

  assert.equal(result.stats.ordersToday, 3);
  assert.equal(result.stats.pendingOrders, 1);
  assert.equal(result.stats.completedToday, 1);
  assert.equal(result.stats.todayRevenue, 300);
  assert.equal(result.weeklyRevenue, 800);
  assert.equal(result.monthlyRevenue, 800);
  assert.equal(result.stats.pendingReservations, 1);
  assert.equal(result.stats.avgOrderValue, 333.33);
});
