import test from 'node:test';
import assert from 'node:assert/strict';
import addressService from '../services/addressService.js';

test('addressService: initial mock dataset includes Zamboanga City and default address', () => {
  const addresses = addressService.getAddresses();
  assert.ok(addresses.length >= 3, 'Should have initial mock addresses');
  const zamboanga = addresses.find((a) => a.city === 'Zamboanga City');
  assert.ok(zamboanga, 'Must include Zamboanga City address');
  assert.equal(zamboanga.isDefault, true, 'Zamboanga address should be default');

  const defaultAddr = addressService.getDefaultAddress();
  assert.ok(defaultAddr, 'Should return a default address');
  assert.equal(defaultAddr.city, 'Zamboanga City');
});

test('addressService: addAddress generates unique id, trims fields, and can set as default', () => {
  const newAddr = addressService.addAddress({
    label: 'Other',
    customLabel: 'Beach House ',
    recipientName: ' Cassy Villafuerte ',
    mobileNumber: '09191234567',
    street: ' 101 Coastal Road ',
    barangay: ' Bolong ',
    city: ' Zamboanga City ',
    province: ' Zamboanga del Sur ',
    postalCode: '7001',
    notes: ' Gate facing the shore ',
    isDefault: true,
  });

  assert.ok(newAddr.id, 'Must generate id');
  assert.equal(newAddr.recipientName, 'Cassy Villafuerte');
  assert.equal(newAddr.street, '101 Coastal Road');
  assert.equal(newAddr.barangay, 'Bolong');
  assert.equal(newAddr.city, 'Zamboanga City');
  assert.equal(newAddr.isDefault, true);

  // Check default shifted
  const currentDefault = addressService.getDefaultAddress();
  assert.equal(currentDefault.id, newAddr.id);
  assert.equal(currentDefault.isDefault, true);
});

test('addressService: updateAddress modifies fields without losing other data', () => {
  const addresses = addressService.getAddresses();
  const target = addresses[0];

  const updated = addressService.updateAddress(target.id, {
    recipientName: 'Updated Name',
    notes: 'Updated rider instructions',
  });

  assert.equal(updated.id, target.id);
  assert.equal(updated.recipientName, 'Updated Name');
  assert.equal(updated.notes, 'Updated rider instructions');
  assert.equal(updated.street, target.street, 'Unmodified fields must be preserved');
});

test('addressService: setDefaultAddress moves default badge', () => {
  const addresses = addressService.getAddresses();
  const nonDefault = addresses.find((a) => !a.isDefault);
  assert.ok(nonDefault, 'Must find a non-default address');

  addressService.setDefaultAddress(nonDefault.id);
  const newDefault = addressService.getDefaultAddress();
  assert.equal(newDefault.id, nonDefault.id);

  // All other addresses should not be default
  const list = addressService.getAddresses();
  const defaultCount = list.filter((a) => a.isDefault).length;
  assert.equal(defaultCount, 1, 'Exactly one address must be default');
});

test('addressService: deleteAddress promotes next address if default was deleted', () => {
  const currentDefault = addressService.getDefaultAddress();
  assert.ok(currentDefault);

  const initialCount = addressService.getAddresses().length;
  const remaining = addressService.deleteAddress(currentDefault.id);

  assert.equal(remaining.length, initialCount - 1);
  assert.ok(!remaining.some((a) => a.id === currentDefault.id));

  // Next address should now be default
  const newDefault = addressService.getDefaultAddress();
  assert.ok(newDefault, 'New default must be assigned');
  assert.equal(newDefault.isDefault, true);
  assert.equal(newDefault.id, remaining[0].id);
});

test('addressService: checkDuplicate detects identical street, barangay, and city', () => {
  const addresses = addressService.getAddresses();
  const sample = addresses[0];

  assert.equal(
    addressService.checkDuplicate({
      street: sample.street.toUpperCase(),
      barangay: sample.barangay.toLowerCase(),
      city: sample.city,
    }),
    true,
    'Should identify matching address'
  );

  assert.equal(
    addressService.checkDuplicate(
      {
        street: sample.street,
        barangay: sample.barangay,
        city: sample.city,
      },
      sample.id
    ),
    false,
    'Should exclude matching address with same id'
  );

  assert.equal(
    addressService.checkDuplicate({
      street: 'Completely Unique Street 999',
      barangay: 'Barangay XYZ',
      city: 'Unknown City',
    }),
    false,
    'Should return false for non-duplicate'
  );
});

test('addressService: enforces soft limit of 10 addresses', () => {
  // Fill up to 10
  const current = addressService.getAddresses();
  const toAdd = 10 - current.length;

  for (let i = 0; i < toAdd; i++) {
    addressService.addAddress({
      label: 'Home',
      recipientName: `Person ${i}`,
      mobileNumber: '09171112222',
      street: `Street ${i}`,
      barangay: 'Barangay Test',
      city: 'Zamboanga City',
      province: 'Zamboanga del Sur',
    });
  }

  assert.equal(addressService.getAddresses().length, 10);

  // 11th should throw
  assert.throws(
    () => {
      addressService.addAddress({
        label: 'Work',
        recipientName: 'Overflow Person',
        mobileNumber: '09171113333',
        street: 'Overflow Street',
        barangay: 'Barangay Test',
        city: 'Zamboanga City',
        province: 'Zamboanga del Sur',
      });
    },
    /Address limit reached/
  );
});
