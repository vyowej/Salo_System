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

test('complete Table Management flow: add, edit, assign, conflict prevention, cancel release, archive, and isolation', () => {
  const restore = installDemoSession();
  try {
    const restaurantId = 'dalisay-heritage';

    // 1. Add a table with name, unique number, capacity, type, and area
    const newTable = demoAdapter.addTable({
      name: 'Garden Terrace 1',
      number: 'GT-01',
      capacity: 6,
      type: 'Outdoor',
      area: 'Outdoor',
      status: 'Active',
      description: 'Scenic garden view table',
    }, restaurantId);

    assert.equal(newTable.name, 'Garden Terrace 1');
    assert.equal(newTable.number, 'GT-01');
    assert.equal(newTable.capacity, 6);
    assert.equal(newTable.type, 'Outdoor');
    assert.equal(newTable.isActive, true);
    assert.equal(newTable.status, 'Available');

    // 2. Prevent duplicate table numbers within the same restaurant
    assert.throws(
      () => demoAdapter.addTable({
        name: 'Another Table',
        number: 'GT-01', // duplicate number!
        capacity: 4,
        type: 'Indoor',
        area: 'Indoor',
      }, restaurantId),
      /already exists/,
    );

    // Also prevent duplicate names
    assert.throws(
      () => demoAdapter.addTable({
        name: 'Garden Terrace 1', // duplicate name!
        number: 'GT-99',
        capacity: 4,
        type: 'Indoor',
        area: 'Indoor',
      }, restaurantId),
      /already exists/,
    );

    // 3. Edit existing table details
    const updatedTable = demoAdapter.updateTable(newTable.id, {
      capacity: 8,
      type: 'Private',
      area: 'Outdoor',
      description: 'Expanded garden table',
    }, restaurantId);

    assert.equal(updatedTable.capacity, 8);
    assert.equal(updatedTable.type, 'Private');
    assert.equal(updatedTable.description, 'Expanded garden table');

    // 4. Create two reservations at the same date and time
    const resA = demoAdapter.createCustomerReservation({
      restaurantId,
      guestName: 'Ana Santos',
      date: '2026-12-25',
      time: '6:00 PM',
      guests: 6,
    });

    const resB = demoAdapter.createCustomerReservation({
      restaurantId,
      guestName: 'Carlos Cruz',
      date: '2026-12-25',
      time: '6:00 PM',
      guests: 6,
    });

    // Verify table options show GT-01 as available for resA
    const optionsA = demoAdapter.getReservationTableOptions(restaurantId, resA.id);
    const tableOptionA = optionsA.find((opt) => opt.id === newTable.id);
    assert.ok(tableOptionA);
    assert.equal(tableOptionA.isAvailable, true);

    // Assign GT-01 to reservation A
    const assignedResA = demoAdapter.assignReservationTable(resA.id, newTable.id, restaurantId);
    assert.equal(assignedResA.assignedTable?.id, newTable.id);

    // Dynamic table status for that date/time reflects Reserved
    const tablesOnDate = demoAdapter.getTables(restaurantId, '2026-12-25', '6:00 PM');
    const tableStateOnDate = tablesOnDate.find((t) => t.id === newTable.id);
    assert.equal(tableStateOnDate.status, 'Reserved');

    // 5. Verify overlapping reservations cannot use the same table
    const optionsB = demoAdapter.getReservationTableOptions(restaurantId, resB.id);
    const tableOptionB = optionsB.find((opt) => opt.id === newTable.id);
    assert.ok(tableOptionB);
    assert.equal(tableOptionB.isAvailable, false);
    assert.match(tableOptionB.statusLabel, /Reserved at 6:00 PM/);

    assert.throws(
      () => demoAdapter.assignReservationTable(resB.id, newTable.id, restaurantId),
      /overlaps another active reservation/,
    );

    // Verify unassigning table from reservation A
    demoAdapter.assignReservationTable(resA.id, null, restaurantId);
    assert.equal(demoAdapter.getReservationTables(restaurantId, resA.id).some((t) => t.id === newTable.id), true);

    // Re-assign to resA for cancellation test
    demoAdapter.assignReservationTable(resA.id, newTable.id, restaurantId);

    // 6. Cancel reservation A and verify that table becomes available again
    demoAdapter.cancelCustomerReservation(resA.id, 'Customer emergency');
    demoAdapter.resolveReservationCancellation(resA.id, 'approve', restaurantId);

    // Table is now released and can be assigned to reservation B!
    const optionsBAfterCancel = demoAdapter.getReservationTableOptions(restaurantId, resB.id);
    const tableOptionBAfter = optionsBAfterCancel.find((opt) => opt.id === newTable.id);
    assert.equal(tableOptionBAfter.isAvailable, true);

    const assignedResB = demoAdapter.assignReservationTable(resB.id, newTable.id, restaurantId);
    assert.equal(assignedResB.assignedTable?.id, newTable.id);

    // Unassign resB so table has no future commitments
    demoAdapter.assignReservationTable(resB.id, null, restaurantId);

    // 7. Archive table and verify that it can no longer be assigned to new reservations
    const archivedTable = demoAdapter.archiveTable(newTable.id, restaurantId);
    assert.equal(archivedTable.isActive, false);
    assert.equal(archivedTable.isArchived, true);
    assert.equal(archivedTable.status, 'Archived');
    assert.equal(archivedTable.availability, 'unavailable');

    // Excluded from reservation options
    const optionsAfterArchive = demoAdapter.getReservationTables(restaurantId, resB.id);
    assert.equal(optionsAfterArchive.some((t) => t.id === newTable.id), false);

    assert.throws(
      () => demoAdapter.assignReservationTable(resB.id, newTable.id, restaurantId),
      /inactive or archived/,
    );

    // 8. Reactivate table and verify it returns to available inventory
    const reactivatedTable = demoAdapter.reactivateTable(newTable.id, restaurantId);
    assert.equal(reactivatedTable.isActive, true);
    assert.equal(reactivatedTable.isArchived, false);
    assert.equal(reactivatedTable.status, 'Available');
    assert.equal(reactivatedTable.availability, 'available');

    // 9. Restaurant data isolation
    const otherRestaurantTables = demoAdapter.getTables('manila-artisan-pizza');
    assert.equal(otherRestaurantTables.some((t) => t.id === newTable.id), false);
  } finally {
    restore();
  }
});
