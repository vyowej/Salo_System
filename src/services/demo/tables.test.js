import assert from 'node:assert/strict';
import test from 'node:test';
import { DEMO_SEED } from './seedData.js';
import { canPerformRestaurantAction, demoAdapter } from './demoAdapter.js';
import { deriveTableStatus, getTableEditConflicts } from './tableRules.js';

const STORAGE_KEY = 'salo_demo_store_v1';
const OWNER = { id: 2, email: 'owner@salo.ph', name: 'Demo Owner', role: 'owner' };

function installDemoSession(user = OWNER) {
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

test('table status is derived from reservations, while manual unavailable states take precedence', () => {
  const table = { id: 'T1', name: 'Table 1', status: 'Available', availability: 'available' };
  const reservations = [
    { id: 'R1', assignedTable: { id: 'T1' }, date: '2026-11-20', status: 'Confirmed' },
  ];
  assert.equal(deriveTableStatus(table, reservations, '2026-11-20'), 'Reserved');
  assert.equal(deriveTableStatus(table, [{ ...reservations[0], status: 'Seated' }], '2026-11-20'), 'Occupied');
  assert.equal(deriveTableStatus(table, reservations, '2026-11-21'), 'Available');
  assert.equal(deriveTableStatus({ ...table, status: 'Maintenance' }, reservations, '2026-11-20'), 'Maintenance');
});

test('table edits block capacity, area, and availability conflicts with upcoming reservations', () => {
  const table = { id: 'T1', name: 'Table 1', area: 'Indoor', capacity: 8, status: 'Available' };
  const reservation = {
    id: 'RES-1',
    reference: 'RES-1',
    assignedTable: { id: 'T1', name: 'Table 1' },
    date: '2026-11-20',
    time: '7:00 PM',
    partySize: 6,
    status: 'Confirmed',
  };
  const now = new Date('2026-11-01T10:00:00');
  assert.equal(getTableEditConflicts(table, { capacity: 4 }, [reservation], 120, now).length, 1);
  assert.equal(getTableEditConflicts(table, { area: 'Outdoor' }, [reservation], 120, now).length, 1);
  assert.equal(getTableEditConflicts(table, { status: 'Unavailable' }, [reservation], 120, now).length, 1);
  assert.equal(getTableEditConflicts(table, { capacity: 10 }, [reservation], 120, now).length, 0);
});

test('new tables share reservation assignment and unavailable tables are excluded', () => {
  const restore = installDemoSession();
  try {
    const reservation = demoAdapter.createCustomerReservation({
      restaurantId: 'dalisay-heritage',
      guestName: 'Table workflow test',
      date: '2026-12-20',
      time: '7:00 PM',
      guests: 4,
    });
    const table = demoAdapter.addTable({
      name: 'Demo Test Table',
      number: '99',
      capacity: 4,
      description: 'Created by test',
      area: 'Indoor',
    }, 'dalisay-heritage');
    assert.ok(demoAdapter.getReservationTables('dalisay-heritage', reservation.id).some((entry) => entry.id === table.id));
    demoAdapter.assignReservationTable(reservation.id, table.id, 'dalisay-heritage');
    assert.equal(demoAdapter.getTables('dalisay-heritage', '2026-12-20').find((entry) => entry.id === table.id).status, 'Reserved');
    assert.throws(
      () => demoAdapter.updateTable(table.id, { ...table, capacity: 2 }, 'dalisay-heritage'),
      /conflicts with upcoming reservations: #/,
    );
    assert.equal(demoAdapter.getTables('dalisay-heritage', '2026-12-20').find((entry) => entry.id === table.id).capacity, 4);
    assert.throws(
      () => demoAdapter.setTableAvailability(table.id, 'Unavailable', 'dalisay-heritage'),
      /conflicts with upcoming reservations/,
    );

    const unavailableTable = demoAdapter.addTable({
      name: 'Unused Demo Table',
      number: '100',
      capacity: 4,
      area: 'Indoor',
    }, 'dalisay-heritage');
    const second = demoAdapter.createCustomerReservation({
      restaurantId: 'dalisay-heritage',
      guestName: 'Availability test',
      date: '2026-12-20',
      time: '9:30 PM',
      guests: 2,
    });
    demoAdapter.setTableAvailability(unavailableTable.id, 'Unavailable', 'dalisay-heritage');
    const options = demoAdapter.getReservationTables('dalisay-heritage', second.id);
    assert.equal(options.some((entry) => entry.id === unavailableTable.id), false);
    assert.equal(options.some((entry) => entry.id === table.id), true);
  } finally {
    restore();
  }
});

test('table mutations enforce their service permissions and reservation staff can only view tables', () => {
  const reservationStaff = { id: 6, email: 'reservation.staff@salo.ph', role: 'customer' };
  const inventoryStaff = { id: 7, email: 'inventory.staff@salo.ph', role: 'customer' };
  const memberships = {
    ownershipMemberships: DEMO_SEED.ownershipMemberships,
    staffMemberships: DEMO_SEED.staffMemberships,
  };
  assert.equal(canPerformRestaurantAction(reservationStaff, memberships, 'dalisay-heritage', 'tables.view'), true);
  assert.equal(canPerformRestaurantAction(reservationStaff, memberships, 'dalisay-heritage', 'tables.add'), false);
  assert.equal(canPerformRestaurantAction(inventoryStaff, memberships, 'dalisay-heritage', 'tables.view'), false);

  const restore = installDemoSession(reservationStaff);
  try {
    assert.equal(demoAdapter.getTables('dalisay-heritage').length, 8);
    assert.throws(() => demoAdapter.addTable({ name: 'Unauthorized', capacity: 2, area: 'Indoor' }, 'dalisay-heritage'), /do not have permission/);
  } finally {
    restore();
  }
});
