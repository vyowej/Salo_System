import apiClient from './apiClient.js';

function toQueryString(params = {}) {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([key, val]) => {
    if (val !== undefined && val !== null && val !== '' && val !== 'all') {
      sp.set(key, String(val));
    }
  });
  const qs = sp.toString();
  return qs ? `?${qs}` : '';
}

export const reviewService = {
  // ── Public / Customer Discovery ──────────────────────────────
  async getFeaturedRestaurant() {
    const res = await apiClient.get('/featured-restaurant');
    return res?.data?.featured_restaurant ?? null;
  },

  async getRestaurantReviews(restaurantId, params = {}) {
    const res = await apiClient.get(`/restaurants/${restaurantId}/reviews${toQueryString(params)}`);
    return res?.data ?? {
      rating_summary: { average_rating: null, total_count: 0, distribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 } },
      reviews: [],
      pagination: { current_page: 1, per_page: 10, total: 0, last_page: 1 },
      is_featured_this_week: false,
      featured_week: null,
    };
  },

  // ── Customer Order Review Submission ─────────────────────────
  async getOrderReviewStatus(orderId) {
    const res = await apiClient.get(`/customer/orders/${orderId}/reviews`);
    return res?.data ?? null;
  },

  async submitRestaurantReview(orderId, { rating, comment = null }) {
    const res = await apiClient.post(`/customer/orders/${orderId}/reviews/restaurant`, {
      rating,
      comment: comment || null,
    });
    return res?.data ?? null;
  },

  async submitRiderReview(orderId, { rating, comment = null }) {
    const res = await apiClient.post(`/customer/orders/${orderId}/reviews/rider`, {
      rating,
      comment: comment || null,
    });
    return res?.data ?? null;
  },

  // ── Restaurant Owner / Staff Feedback & Flagging ─────────────
  async getOwnerRestaurantFeedback(params = {}) {
    const res = await apiClient.get(`/restaurant/reviews${toQueryString(params)}`);
    return res?.data ?? null;
  },

  async flagReview(reviewId, reason) {
    const res = await apiClient.post(`/restaurant/reviews/${reviewId}/flag`, { reason });
    return res?.data ?? null;
  },

  // ── Rider Feedback ───────────────────────────────────────────
  async getRiderFeedback(params = {}) {
    const res = await apiClient.get(`/rider/reviews${toQueryString(params)}`);
    return res?.data ?? null;
  },

  // ── Admin Moderation, Featured & Settings ────────────────────
  async getAdminReviews(params = {}) {
    const res = await apiClient.get(`/admin/reviews${toQueryString(params)}`);
    return res?.data ?? { items: [], counts: {}, pagination: {} };
  },

  async moderateAdminReview(type, reviewId, { action, reason = '' }) {
    const res = await apiClient.post(`/admin/reviews/${type}/${reviewId}/moderate`, {
      action,
      reason: reason || null,
    });
    return res?.data?.review ?? null;
  },

  async getAdminFeaturedOverview() {
    const res = await apiClient.get('/admin/featured-restaurants');
    return res?.data ?? { active_week: null, ranking: null, history: [], audit_logs: [] };
  },

  async evaluateFeaturedNow() {
    const res = await apiClient.post('/admin/featured-restaurants/evaluate', {});
    return res?.data ?? null;
  },

  async overrideFeaturedRestaurant({ restaurantId, reason }) {
    const res = await apiClient.post('/admin/featured-restaurants/override', {
      restaurant_id: restaurantId,
      reason,
    });
    return res?.data?.featured_week ?? null;
  },

  async getAdminReviewSettings() {
    const res = await apiClient.get('/admin/reviews/settings');
    return res?.data?.settings ?? {};
  },

  async updateAdminReviewSettings(settings) {
    const res = await apiClient.put('/admin/reviews/settings', settings);
    return res?.data?.settings ?? {};
  },
};

export default reviewService;
