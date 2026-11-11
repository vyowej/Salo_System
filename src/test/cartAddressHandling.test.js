import test from 'node:test';
import assert from 'node:assert/strict';
import { checkAddressCoverage } from '../features/customer/utils/deliveryCoverage.js';

test('checkAddressCoverage: permits address when no restaurant coverage restriction is defined', () => {
  const restaurant = { id: 'dalisay-heritage', name: 'Dalisay Heritage' };
  const address = { id: 'addr-1', city: 'Pasig City' };
  const result = checkAddressCoverage(restaurant, address);
  assert.equal(result.isCovered, true);
  assert.equal(result.error, null);
});

test('checkAddressCoverage: blocks address when restaurant restricts to different city', () => {
  const restaurant = {
    id: 'quezon-bistro',
    name: 'Quezon Bistro',
    deliveryCoverage: { cities: ['Quezon City', 'Marikina City'] },
  };
  const coveredAddr = { id: 'addr-qc', city: 'Quezon City' };
  const uncoveredAddr = { id: 'addr-taguig', city: 'Taguig City (BGC)' };

  assert.equal(checkAddressCoverage(restaurant, coveredAddr).isCovered, true);
  assert.equal(checkAddressCoverage(restaurant, uncoveredAddr).isCovered, false);
  assert.match(checkAddressCoverage(restaurant, uncoveredAddr).error, /does not deliver to Taguig City/);
});

test('checkAddressCoverage: rejects null or missing address', () => {
  const restaurant = { id: 'test-rest' };
  const result = checkAddressCoverage(restaurant, null);
  assert.equal(result.isCovered, false);
  assert.match(result.error, /No delivery address selected/);
});
