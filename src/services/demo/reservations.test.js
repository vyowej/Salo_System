import assert from 'node:assert/strict';
import test from 'node:test';
import { DEMO_SEED } from './seedData.js';
import {
  canPerformReservationAction,
  canTransitionReservationStatus,
  demoAdapter,
  RESERVATION_STATUS_TRANSITIONS,
} from './demoAdapter.js';

const STORAGE_KEY = 'salo_demo_store_v1';

function installDemoSession(user) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const storage = new Map([
    [STORAGE_KEY, JSON.stringify(DEMO_SEED)],
    ['salo_user', JSON.stringify(user)],
  ]);
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: (key) => storage.delete(key),
    },
  });
  return () => {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else delete globalThis.localStorage;
  };
}

function makeReservation(date = '2026-11-20', time = '7:00 PM', guests = 4) {
  return demoAdapter.createCustomerReservation({
    restaurantId: 'dalisay-heritage',
    guestName: 'Reservation Test',
    guestEmail: 'reservation@example.com',
    guestPhone: '09170000000',
    date,
    time,
    guests,
    depositAmount: 500,
    serviceFee: 50,
    totalPaid: 550,
  });
}

test('reservation transition map allows only the configured lifecycle', () => {
  assert.deepEqual(RESERVATION_STATUS_TRANSITIONS.Pending, ['Approved', 'Rejected', 'Cancelled']);
  assert.equal(canTransitionReservationStatus('Pending', 'Approved'), true);
  assert.equal(canTransitionReservationStatus('Pending', 'Seated'), false);
  assert.equal(canTransitionReservationStatus('Arrived', 'Seated'), true);
  assert.equal(canTransitionReservationStatus('Completed', 'Cancelled'), false);

  const restore = installDemoSession({ id: 2, email: 'owner@salo.ph', role: 'owner' });
  try {
    const reservation = makeReservation();
    assert.throws(
      () => demoAdapter.updateReservationStatus(reservation.id, 'Seated', 'dalisay-heritage'),
      /cannot move from Pending to Seated/,
    );
    demoAdapter.updateReservationStatus(reservation.id, 'Approved', 'dalisay-heritage');
    demoAdapter.recordReservationPayment(reservation.id, 'dalisay-heritage');
    demoAdapter.recordReservationPayment(reservation.id, 'dalisay-heritage');
    demoAdapter.assignReservationTable(reservation.id, 'TBL-201', 'dalisay-heritage');
    demoAdapter.updateReservationStatus(reservation.id, 'Arrived', 'dalisay-heritage');
    demoAdapter.confirmReservationTable(reservation.id, 'dalisay-heritage');
    demoAdapter.updateReservationStatus(reservation.id, 'Seated', 'dalisay-heritage');
    demoAdapter.updateReservationStatus(reservation.id, 'Completed', 'dalisay-heritage');
    assert.equal(demoAdapter.getCustomerReservations().find((entry) => entry.id === reservation.id).status, 'Completed');
    const actions = demoAdapter.getActivityLog('dalisay-heritage').map((entry) => entry.action);
    for (const action of ['approved', 'awaiting-payment', 'payment-confirmed', 'table-assigned', 'arrived', 'table-confirmed', 'seated', 'completed']) {
      assert.ok(actions.includes(action), `Expected activity action "${action}" to be logged.`);
    }
  } finally {
    restore();
  }
});

test('available table options exclude undersized and overlapping tables and reject double booking', () => {
  const restore = installDemoSession({ id: 2, email: 'owner@salo.ph', role: 'owner' });
  try {
    const reservation = makeReservation('2026-11-08', '7:30 PM', 6);
    const initialOptions = demoAdapter.getReservationTables('dalisay-heritage', reservation.id);
    assert.equal(initialOptions.some((table) => table.id === 'TBL-202'), false);
    assert.equal(initialOptions.some((table) => table.id === 'TBL-103'), false);
    assert.equal(initialOptions.some((table) => table.id === 'TBL-201'), true);

    assert.throws(
      () => demoAdapter.assignReservationTable(reservation.id, 'TBL-202', 'dalisay-heritage'),
      /unavailable, undersized, or overlaps/,
    );
    demoAdapter.assignReservationTable(reservation.id, 'TBL-201', 'dalisay-heritage');

    const second = makeReservation('2026-11-08', '8:00 PM', 6);
    const nextOptions = demoAdapter.getReservationTables('dalisay-heritage', second.id);
    assert.equal(nextOptions.some((table) => table.id === 'TBL-201'), false);
    assert.equal(nextOptions.some((table) => table.id === 'TBL-202'), false);
  } finally {
    restore();
  }
});

test('reservation actions enforce the signed-in staff permission set', () => {
  const staff = { id: 6, email: 'reservation.staff@salo.ph', role: 'customer' };
  const memberships = {
    ownershipMemberships: DEMO_SEED.ownershipMemberships,
    staffMemberships: DEMO_SEED.staffMemberships,
  };
  assert.equal(canPerformReservationAction(staff, memberships, 'dalisay-heritage', 'view'), true);
  assert.equal(canPerformReservationAction(staff, memberships, 'dalisay-heritage', 'assignTables'), true);
  assert.equal(canPerformReservationAction(staff, memberships, 'dalisay-heritage', 'approve'), false);
  assert.equal(canPerformReservationAction(staff, memberships, 'dalisay-heritage', 'reject'), false);

  const restore = installDemoSession(staff);
  try {
    const reservation = makeReservation();
    assert.throws(
      () => demoAdapter.updateReservationStatus(reservation.id, 'Approved', 'dalisay-heritage'),
      /do not have permission to approve/,
    );
    assert.throws(
      () => demoAdapter.updateReservationStatus(reservation.id, 'Rejected', 'dalisay-heritage', { reason: 'Reason provided' }),
      /do not have permission to reject/,
    );
    assert.equal(demoAdapter.assignReservationTable(reservation.id, 'TBL-103', 'dalisay-heritage').assignedTable.id, 'TBL-103');
  } finally {
    restore();
  }
});

test('cancellation requests remain pending until an authorized owner processes them', () => {
  const restore = installDemoSession({ id: 2, email: 'owner@salo.ph', role: 'owner' });
  try {
    const reservation = makeReservation();
    const request = demoAdapter.cancelCustomerReservation(reservation.id, 'Plans changed');
    assert.equal(request.status, 'Pending');
    assert.equal(request.cancellationRequest.status, 'requested');

    const reviewed = demoAdapter.resolveReservationCancellation(reservation.id, 'approve', 'dalisay-heritage');
    assert.equal(reviewed.status, 'Cancelled');
    assert.equal(reviewed.cancellationRequest.status, 'approved');
  } finally {
    restore();
  }
});
