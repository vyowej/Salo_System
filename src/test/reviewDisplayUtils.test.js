import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MOCK_FEATURED_RESTAURANT_WEEKS,
  MOCK_PLATFORM_SETTINGS,
  MOCK_RESTAURANT_REVIEWS,
  MOCK_RIDER_REVIEWS,
} from '../mocks/reviewsAndFeaturedMock.js';
import {
  computeMockRatingSummary,
  formatFeaturePeriod,
  formatModerationStatusLabel,
  getModerationBadgeVariant,
} from '../utils/reviewDisplayUtils.js';

test('computeMockRatingSummary excludes flagged and hidden reviews from rating totals', () => {
  const summary = computeMockRatingSummary(
    MOCK_RESTAURANT_REVIEWS.filter((r) => r.restaurant_id === 1),
  );

  // Restaurant 1 has 4 published reviews (5, 5, 4, 5), 1 flagged (2), 1 hidden (1)
  assert.equal(summary.totalCount, 4);
  assert.equal(summary.averageRating, 4.75);
  assert.deepEqual(summary.distribution, { 5: 3, 4: 1, 3: 0, 2: 0, 1: 0 });
});

test('computeMockRatingSummary computes rider delivery ratings independently', () => {
  const summary = computeMockRatingSummary(
    MOCK_RIDER_REVIEWS.filter((r) => r.rider_id === 8),
  );

  assert.equal(summary.totalCount, 3);
  assert.equal(summary.averageRating, 4.67);
  assert.deepEqual(summary.distribution, { 5: 2, 4: 1, 3: 0, 2: 0, 1: 0 });
});

test('moderation status helpers return expected labels and badge variants', () => {
  assert.equal(formatModerationStatusLabel('published'), 'Published');
  assert.equal(formatModerationStatusLabel('flagged'), 'Flagged');
  assert.equal(formatModerationStatusLabel('hidden'), 'Hidden');
  assert.equal(formatModerationStatusLabel('removed'), 'Removed');

  assert.equal(getModerationBadgeVariant('published'), 'success');
  assert.equal(getModerationBadgeVariant('flagged'), 'warning');
  assert.equal(getModerationBadgeVariant('hidden'), 'default');
  assert.equal(getModerationBadgeVariant('removed'), 'error');
});

test('mock featured weeks and platform settings align with Phase 1 schema keys', () => {
  const activeWeek = MOCK_FEATURED_RESTAURANT_WEEKS.find((w) => w.selection_status === 'active');
  assert.ok(activeWeek);
  assert.ok(activeWeek.evaluation_review_count >= activeWeek.min_review_threshold);
  assert.match(formatFeaturePeriod(activeWeek.feature_start_date, activeWeek.feature_end_date), /2026/);

  assert.equal(MOCK_PLATFORM_SETTINGS['featured_restaurant.min_review_threshold'], 10);
  assert.equal(MOCK_PLATFORM_SETTINGS['featured_restaurant.evaluation_period_days'], 30);
  assert.equal(MOCK_PLATFORM_SETTINGS['featured_restaurant.feature_period_days'], 7);
});
