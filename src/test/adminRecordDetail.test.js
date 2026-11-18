import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import {
  SUPPORTED_RECORD_ENTITIES,
  findRecordByIdInPages,
  getAvailableRecordActions,
  normalizeAdminRecord,
} from '../features/admin/utils/adminRecordDetailHelpers.js';

test('normalizeAdminRecord maps accounts, administrators, restaurants, and riders from real fields', () => {
  assert.equal(SUPPORTED_RECORD_ENTITIES.size, 4);

  const account = normalizeAdminRecord('accounts', {
    user_id: 10,
    username: 'juandc',
    first_name: 'Juan',
    middle_initial: 'D',
    last_name: 'Cruz',
    email: 'juan@example.com',
    phone_number: '09171234567',
    user_role: 'customer',
    account_status: 'active',
  });
  assert.equal(account.id, 10);
  assert.equal(account.title, 'Juan D. Cruz');
  assert.equal(account.status, 'active');

  const admin = normalizeAdminRecord('administrators', {
    user_id: 2,
    username: 'superadmin',
    first_name: 'Super',
    last_name: 'Admin',
    email: 'admin@example.com',
    user_role: 'admin',
    account_status: 'active',
  });
  assert.equal(admin.id, 2);
  assert.equal(admin.title, 'Super Admin');

  const restaurant = normalizeAdminRecord('restaurants', {
    restaurant_id: 5,
    restaurant_name: 'Casa Manila',
    registered_name: 'Casa Manila Corp',
    zone: 'Makati',
    restaurant_status: 'active',
    offers_delivery: 1,
    offers_pickup: 1,
  });
  assert.equal(restaurant.id, 5);
  assert.equal(restaurant.title, 'Casa Manila');
  assert.equal(restaurant.status, 'active');

  const rider = normalizeAdminRecord('riders', {
    rider_id: 8,
    user_id: 18,
    first_name: 'Pedro',
    last_name: 'Santos',
    email: 'pedro@example.com',
    zone: 'Quezon City',
    vehicle_type: 'motorcycle',
    plate_number: 'ABC-123',
    rider_status: 'approved',
  });
  assert.equal(rider.id, 8);
  assert.equal(rider.title, 'Pedro Santos');
  assert.equal(rider.status, 'approved');

  assert.equal(normalizeAdminRecord('unknown_entity', { id: 1 }), null);
});

test('findRecordByIdInPages searches across pages and returns null when missing or invalid ID', async () => {
  const fetchPage = async (page) => {
    if (page === 1) {
      return { items: [{ user_id: 1 }, { user_id: 2 }], meta: { last_page: 2 } };
    }
    return { items: [{ user_id: 99, username: 'target' }], meta: { last_page: 2 } };
  };

  const found = await findRecordByIdInPages(fetchPage, 'user_id', '99');
  assert.equal(found.username, 'target');

  const missing = await findRecordByIdInPages(fetchPage, 'user_id', '404');
  assert.equal(missing, null);

  const invalid = await findRecordByIdInPages(fetchPage, 'user_id', 'abc');
  assert.equal(invalid, null);
});

test('getAvailableRecordActions enforces backend status transitions and admin permissions', () => {
  const riderApprovedActions = getAvailableRecordActions(
    'riders',
    { status: 'approved' },
    { riders: ['activate', 'suspend'] },
  );
  assert.deepEqual(
    riderApprovedActions.map((a) => a.key),
    ['activate_rider', 'suspend', 'deactivate'],
  );

  const riderNoPerms = getAvailableRecordActions('riders', { status: 'approved' }, { riders: [] });
  assert.deepEqual(riderNoPerms, []);

  const restActions = getAvailableRecordActions(
    'restaurants',
    { status: 'suspended' },
    { restaurants: ['activate', 'deactivate'] },
  );
  assert.deepEqual(
    restActions.map((a) => a.key),
    ['activate', 'deactivate'],
  );
});

test('AdminRecordDetailPage connects all supported entities, actions, and states without mock data', async () => {
  const source = await fs.readFile(
    new URL('../features/admin/pages/AdminRecordDetailPage.jsx', import.meta.url),
    'utf8',
  );

  assert.match(source, /adminApiService\.getUsers/);
  assert.match(source, /adminApiService\.getRestaurants/);
  assert.match(source, /adminApiService\.getRiders/);
  assert.match(source, /adminApiService\.updateUser/);
  assert.match(source, /adminApiService\.updateRestaurantStatus/);
  assert.match(source, /adminApiService\.activateRider/);
  assert.match(source, /adminApiService\.updateRiderStatus/);
  assert.match(source, /Unsupported record type/);
  assert.match(source, /state="loading"/);
  assert.match(source, /Record not found/);
  assert.match(source, /state="error"/);
  assert.match(source, /await loadRecord\(\)/);
  assert.doesNotMatch(source, /Record detail view is not available yet/);
});
