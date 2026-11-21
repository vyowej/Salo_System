import test from 'node:test';
import assert from 'node:assert/strict';
import apiClient from '../services/apiClient.js';
import { reviewService } from '../services/reviewService.js';

test('reviewService calls expected public, customer, owner, rider, and admin endpoints', async () => {
  const calls = [];
  const origGet = apiClient.get;
  const origPost = apiClient.post;
  const origPut = apiClient.put;

  apiClient.get = async (url) => {
    calls.push({ method: 'GET', url });
    return { data: {} };
  };
  apiClient.post = async (url, body) => {
    calls.push({ method: 'POST', url, body });
    return { data: {} };
  };
  apiClient.put = async (url, body) => {
    calls.push({ method: 'PUT', url, body });
    return { data: {} };
  };

  try {
    await reviewService.getFeaturedRestaurant();
    await reviewService.getRestaurantReviews(4, { days: 30, rating: '5', per_page: 10 });
    await reviewService.getOrderReviewStatus(55);
    await reviewService.submitRestaurantReview(55, { rating: 5, comment: 'Great!' });
    await reviewService.submitRiderReview(55, { rating: 4, comment: 'Fast!' });
    await reviewService.getOwnerRestaurantFeedback({ restaurant_id: 4, days: 7 });
    await reviewService.flagReview(12, 'Spam content');
    await reviewService.getRiderFeedback({ days: 30 });
    await reviewService.getAdminReviews({ type: 'restaurant', status: 'flagged', search: 'spam', page: 2, per_page: 20 });
    await reviewService.moderateAdminReview('restaurant', 12, { action: 'hide', reason: 'Spam' });
    await reviewService.getAdminFeaturedOverview();
    await reviewService.overrideFeaturedRestaurant({ restaurantId: 4, reason: 'Spotlight' });
    await reviewService.updateAdminReviewSettings({ 'featured_restaurant.min_review_threshold': 12 });

    assert.deepEqual(calls.map((c) => `${c.method} ${c.url}`), [
      'GET /featured-restaurant',
      'GET /restaurants/4/reviews?days=30&rating=5&per_page=10',
      'GET /customer/orders/55/reviews',
      'POST /customer/orders/55/reviews/restaurant',
      'POST /customer/orders/55/reviews/rider',
      'GET /restaurant/reviews?restaurant_id=4&days=7',
      'POST /restaurant/reviews/12/flag',
      'GET /rider/reviews?days=30',
      'GET /admin/reviews?type=restaurant&status=flagged&search=spam&page=2&per_page=20',
      'POST /admin/reviews/restaurant/12/moderate',
      'GET /admin/featured-restaurants',
      'POST /admin/featured-restaurants/override',
      'PUT /admin/reviews/settings',
    ]);
  } finally {
    apiClient.get = origGet;
    apiClient.post = origPost;
    apiClient.put = origPut;
  }
});
