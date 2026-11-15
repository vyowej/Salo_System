/**
 * SALO — Location & Service Area API Service
 * Communicates with Laravel REST APIs for Philippine administrative lookups,
 * customer saved addresses, Admin service areas, restaurant coverage, and live tracking.
 */

import apiClient from './apiClient';

const FALLBACK_PROVINCES = [
  'Metro Manila',
  'Misamis Oriental',
  'Zamboanga del Sur',
  'Cebu',
  'Davao del Sur',
  'Cavite',
  'Laguna',
  'Bulacan',
  'Rizal',
  'Pampanga',
  'Iloilo',
  'Benguet',
];

export const locationApiService = {
  async searchProvinces(q = '') {
    try {
      const res = await apiClient.get(`/locations/provinces?q=${encodeURIComponent(q)}&limit=30`);
      return res?.data?.provinces || [];
    } catch {
      const term = q.trim().toLowerCase();
      return FALLBACK_PROVINCES
        .filter((name) => !term || name.toLowerCase().includes(term))
        .map((name) => ({ code: null, name, source: 'offline-fallback' }));
    }
  },

  async searchCities(province, q = '') {
    if (!province) return [];
    try {
      const res = await apiClient.get(
        `/locations/cities?province=${encodeURIComponent(province)}&q=${encodeURIComponent(q)}&limit=40`,
      );
      return res?.data?.cities || [];
    } catch {
      return [];
    }
  },

  async searchBarangays(city, province = '', q = '') {
    if (!city) return [];
    try {
      const res = await apiClient.get(
        `/locations/barangays?city=${encodeURIComponent(city)}&province=${encodeURIComponent(province)}&q=${encodeURIComponent(q)}&limit=50`,
      );
      return res?.data?.barangays || [];
    } catch {
      return [];
    }
  },

  async getActiveServiceAreas() {
    const res = await apiClient.get('/locations/active-service-areas');
    return res?.data?.service_areas || [];
  },

  async validateServiceArea({ province, city, barangay = null, restaurantId = null }) {
    const res = await apiClient.post('/locations/validate-service-area', {
      province,
      city,
      barangay,
      restaurant_id: restaurantId,
    });
    return res?.data;
  },

  // Customer Saved Addresses
  async getCustomerAddresses() {
    const res = await apiClient.get('/customer/addresses');
    return res?.data?.addresses || [];
  },

  async createCustomerAddress(payload) {
    const res = await apiClient.post('/customer/addresses', payload);
    return res?.data?.address;
  },

  async updateCustomerAddress(id, payload) {
    const res = await apiClient.patch(`/customer/addresses/${id}`, payload);
    return res?.data?.address;
  },

  async setDefaultCustomerAddress(id) {
    const res = await apiClient.patch(`/customer/addresses/${id}/default`, {});
    return res?.data?.addresses || [];
  },

  async deleteCustomerAddress(id) {
    const res = await apiClient.delete(`/customer/addresses/${id}`);
    return res?.data?.addresses || [];
  },

  // Admin Service Areas
  async getAdminServiceAreas() {
    const res = await apiClient.get('/admin/service-areas');
    return res?.data?.service_areas || [];
  },

  async createAdminServiceArea(payload) {
    const res = await apiClient.post('/admin/service-areas', payload);
    return res?.data?.service_area;
  },

  async updateAdminServiceArea(id, payload) {
    const res = await apiClient.patch(`/admin/service-areas/${id}`, payload);
    return res?.data?.service_area;
  },

  async getAdminLocationsOverview() {
    const res = await apiClient.get('/admin/locations/overview');
    return res?.data;
  },

  // Restaurant Location & Coverage
  async getRestaurantLocationAndCoverage(restaurantId = null) {
    const qs = restaurantId ? `?restaurant_id=${encodeURIComponent(restaurantId)}` : '';
    const res = await apiClient.get(`/restaurant/location${qs}`);
    return res?.data;
  },

  async updateRestaurantLocation(payload) {
    const res = await apiClient.patch('/restaurant/location', payload);
    return res?.data;
  },

  async updateRestaurantCoverage(payload) {
    const res = await apiClient.put('/restaurant/coverage', payload);
    return res?.data;
  },

  // Rider GPS & Live Order Tracking
  async postRiderLocation(payload) {
    const res = await apiClient.post('/rider/location', payload);
    return res?.data;
  },

  async getCustomerOrderTracking(orderId) {
    const res = await apiClient.get(`/customer/orders/${orderId}/tracking`);
    return res?.data;
  },

  async getAdminOrderTracking(orderId) {
    const res = await apiClient.get(`/admin/orders/${orderId}/tracking`);
    return res?.data;
  },
};

export default locationApiService;
