import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  MAX_BULK_MENU_ROWS,
  parseBulkCategoryPaste,
  validateBulkCategoryRows,
  validateBulkItemRows,
} from '../features/restaurant/menu/bulkMenuUtils.js';
import { getSettingsSectionsForRole } from '../config/settingsConfig.js';
import { BUSINESS_ONBOARDING_CONTENT } from '../config/onboarding/businessOnboardingContent.js';

test('bulkMenuUtils parses pasted categories and validates batch, duplicates, and limits', () => {
  assert.deepEqual(
    parseBulkCategoryPaste('Rice Bowls, Drinks\nDesserts\r\n Appetizers '),
    ['Rice Bowls', 'Drinks', 'Desserts', 'Appetizers'],
  );

  const dupExisting = validateBulkCategoryRows(
    [{ name: 'mains' }, { name: 'Desserts' }],
    [{ id: 1, name: 'Mains' }],
  );
  assert.equal(dupExisting.valid, false);
  assert.match(dupExisting.errorsByIndex[0], /Already exists/);

  const dupBatch = validateBulkCategoryRows(
    [{ name: 'Drinks' }, { name: 'drinks' }],
    [],
  );
  assert.equal(dupBatch.valid, false);
  assert.match(dupBatch.errorsByIndex[1], /Duplicate/);

  const blank = validateBulkCategoryRows([{ name: '   ' }], []);
  assert.equal(blank.valid, false);
  assert.match(blank.errorsByIndex[0], /required/);

  const overLimit = validateBulkCategoryRows(
    Array.from({ length: MAX_BULK_MENU_ROWS + 1 }, (_, i) => ({ name: `Cat ${i}` })),
    [],
  );
  assert.equal(overLimit.valid, false);

  const valid = validateBulkCategoryRows([{ name: 'Rice Bowls' }, { name: 'Drinks' }], []);
  assert.equal(valid.valid, true);
});

test('bulkMenuUtils validates bulk menu item rows', () => {
  const invalid = validateBulkItemRows([
    { name: '', price: 100 },
    { name: 'Sisig', price: 0 },
  ]);
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errorsByIndex[0]?.name);
  assert.ok(invalid.errorsByIndex[1]?.price);

  const valid = validateBulkItemRows([
    { name: 'Pork Sisig', price: '199.00', description: 'Crispy' },
    { name: 'Halo-Halo', price: 120, description: '' },
  ]);
  assert.equal(valid.valid, true);
});

test('getSettingsSectionsForRole isolates mode-specific sections and shares Account', () => {
  const customerIds = getSettingsSectionsForRole('customer').map((s) => s.id);
  const restaurantIds = getSettingsSectionsForRole('restaurant').map((s) => s.id);
  const riderIds = getSettingsSectionsForRole('rider').map((s) => s.id);

  assert.ok(customerIds.includes('account'));
  assert.ok(restaurantIds.includes('account'));
  assert.ok(riderIds.includes('account'));

  assert.ok(customerIds.includes('addresses'));
  assert.equal(restaurantIds.includes('addresses'), false);
  assert.equal(riderIds.includes('addresses'), false);

  assert.ok(restaurantIds.includes('business'));
  assert.equal(customerIds.includes('business'), false);
  assert.equal(riderIds.includes('business'), false);

  assert.ok(riderIds.includes('driver_mode'));
  assert.equal(customerIds.includes('driver_mode'), false);
  assert.equal(restaurantIds.includes('driver_mode'), false);
});

test('business onboarding uses English-first copy and RestaurantDetailPage supports previewMode', async () => {
  const welcomeStep = BUSINESS_ONBOARDING_CONTENT.steps.find((s) => s.id === 'welcome');
  assert.equal(welcomeStep.primaryButton, 'Start Setup');
  assert.equal(welcomeStep.titleTemplate, 'Mabuhay, {username}!');

  const detailSrc = await fs.readFile(
    new URL('../features/customer/pages/RestaurantDetailPage.jsx', import.meta.url),
    'utf8',
  );
  assert.ok(detailSrc.includes('previewMode = false'));
  assert.ok(detailSrc.includes('Preview – not published yet. Customers cannot see this restaurant.'));
  assert.ok(detailSrc.includes('orderingDisabled={previewMode || !canStartOrder}'));
});
