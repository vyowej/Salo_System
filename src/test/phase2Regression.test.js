import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluatePasswordPolicy,
  getPasswordPolicyError,
} from '../utils/passwordPolicy.js';
import { validateUsernameFormat } from '../utils/usernamePolicy.js';
import {
  formatFormalAddress,
  mergeLegacyStreetLine,
} from '../utils/addressFormatter.js';
import {
  hasAddressData,
  mapSavedAddressToForm,
  shouldOfferSaveAddressToAccount,
  filterMunicipalitiesByProvince,
  filterPreferredBasesByMunicipality,
} from '../utils/applicationAddressPrefill.js';

test('passwordPolicy enforces complexity, rejects username/email/common passwords, and scores strength', () => {
  assert.ok(getPasswordPolicyError('short', { username: 'juan' }));
  assert.ok(getPasswordPolicyError('password123', { username: 'juan' }));
  assert.ok(getPasswordPolicyError('alllowercase1!', { username: 'juan' }));
  assert.match(
    getPasswordPolicyError('Juan1234!', { username: 'juan', email: 'juan@example.com' }) || '',
    /username/i,
  );
  assert.match(
    getPasswordPolicyError('Myjuan@example.com1!', { username: 'other', email: 'juan@example.com' }) || '',
    /email/i,
  );
  assert.equal(
    getPasswordPolicyError('SaloStrong#2026', { username: 'juan', email: 'juan@example.com' }),
    null,
  );

  const strong = evaluatePasswordPolicy('SaloStrong#2026', { username: 'juan' });
  assert.equal(strong.isValid, true);
  assert.equal(strong.strengthLabel, 'Strong');
});

test('validateUsernameFormat enforces 3-30 alphanumeric/underscore without spaces', () => {
  assert.equal(validateUsernameFormat('ab').valid, false);
  assert.equal(validateUsernameFormat('has space').valid, false);
  assert.equal(validateUsernameFormat('bad-name!').valid, false);
  assert.equal(validateUsernameFormat('a'.repeat(31)).valid, false);
  assert.equal(validateUsernameFormat('juan_delacruz_99').valid, true);
});

test('formatFormalAddress formats new and legacy addresses in Philippine convention', () => {
  const newRecord = {
    street: '123 Rizal Street',
    barangay: 'Carmen',
    city: 'Cagayan de Oro City',
    province: 'Misamis Oriental',
    postalCode: '9000',
  };
  assert.equal(
    formatFormalAddress(newRecord),
    '123 Rizal Street, Brgy. Carmen, Cagayan de Oro City, Misamis Oriental 9000',
  );

  const legacyRecord = {
    house_number: '123',
    building_name: 'Rizal Tower',
    street: 'Rizal Street',
    barangay_name: 'Carmen',
    city_name: 'Cagayan de Oro City',
    province_name: 'Misamis Oriental',
    postal_code: '9000',
  };
  assert.equal(mergeLegacyStreetLine(legacyRecord), '123 Rizal Tower Rizal Street');
  assert.equal(
    formatFormalAddress(legacyRecord),
    '123 Rizal Tower Rizal Street, Brgy. Carmen, Cagayan de Oro City, Misamis Oriental 9000',
  );

  // Skips empty parts with no stray commas
  assert.equal(
    formatFormalAddress({ street: '45 Mabini St', city: 'Makati' }),
    '45 Mabini St, Makati',
  );
});

test('applicationAddressPrefill handles saved address prefill, save-to-account offer, and scoped filtering', () => {
  assert.equal(hasAddressData({ street: '', city: 'Quezon City' }), false);
  assert.equal(hasAddressData({ street: '123 Rizal St' }), true);

  const mapped = mapSavedAddressToForm({
    houseNumber: '12',
    street: 'Luna St',
    barangay: 'Poblacion',
    city: 'Makati',
    province: 'Metro Manila',
    postalCode: '1200',
  });
  assert.equal(mapped.street, '12 Luna St');
  assert.equal(mapped.houseNumber, '');

  assert.equal(shouldOfferSaveAddressToAccount([], mapped), true);
  assert.equal(shouldOfferSaveAddressToAccount([{ id: 1 }], mapped), false);

  const cities = [
    { city_name: 'Makati', province_name: 'Metro Manila' },
    { city_name: 'Quezon City', province_name: 'Metro Manila' },
    { city_name: 'Cebu City', province_name: 'Cebu' },
  ];
  assert.deepEqual(
    filterMunicipalitiesByProvince(cities, 'Metro Manila'),
    ['Makati', 'Quezon City'],
  );

  const barangays = [
    { barangay_name: 'Poblacion', city_name: 'Makati' },
    { barangay_name: 'Bel-Air', city_name: 'Makati' },
    { barangay_name: 'Diliman', city_name: 'Quezon City' },
  ];
  assert.deepEqual(
    filterPreferredBasesByMunicipality(barangays, 'Makati'),
    ['Poblacion', 'Bel-Air'],
  );
});
