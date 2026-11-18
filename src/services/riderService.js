import apiClient from './apiClient.js';
import locationApiService from './locationApiService.js';

export const riderService = {
  async getDashboard() {
    const response = await apiClient.get('/rider/dashboard');
    return response?.data ?? null;
  },

  async getProfile() {
    const response = await apiClient.get('/rider/profile');
    return response?.data?.profile ?? null;
  },

  async updateProfile(data) {
    const response = await apiClient.patch('/rider/profile', data);
    return response?.data?.profile ?? null;
  },

  async updateAvailability(status) {
    const response = await apiClient.patch('/rider/availability', { status });
    return response?.data?.availability ?? null;
  },

  async postRiderLocation(payload) {
    return locationApiService.postRiderLocation(payload);
  },

  async getAvailableDeliveries({ page = 1, perPage = 15 } = {}) {
    const params = new URLSearchParams();
    if (page) params.set('page', String(page));
    if (perPage) params.set('per_page', String(perPage));
    const qs = params.toString();
    const response = await apiClient.get(`/rider/deliveries/available${qs ? `?${qs}` : ''}`);
    return response?.data ?? { deliveries: [], pagination: { current_page: 1, last_page: 1, per_page: perPage, total: 0 } };
  },

  async getCurrentDelivery() {
    const response = await apiClient.get('/rider/deliveries/current');
    return response?.data?.delivery ?? null;
  },

  async acceptDelivery(orderId) {
    const response = await apiClient.post(`/rider/deliveries/${encodeURIComponent(orderId)}/accept`, {});
    return response?.data?.delivery ?? null;
  },

  async markPickedUp(orderId) {
    const response = await apiClient.post(`/rider/deliveries/${encodeURIComponent(orderId)}/picked-up`, {});
    return response?.data?.delivery ?? null;
  },

  async markDelivered(orderId, collectedAmount = null) {
    const payload = collectedAmount !== null && collectedAmount !== undefined
      ? { collected_amount: collectedAmount }
      : {};
    const response = await apiClient.post(`/rider/deliveries/${encodeURIComponent(orderId)}/delivered`, payload);
    return response?.data?.delivery ?? null;
  },
};

export default riderService;
