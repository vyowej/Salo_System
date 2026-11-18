/**
 * SALO — Customer Service
 * Delegates restaurants/menus to publicRestaurantService and addresses to addressService.
 * Orders, reservations, favorites, and notifications return empty states until their
 * respective backend endpoints are implemented.
 */

import apiClient from './apiClient.js';
import publicRestaurantService from './publicRestaurantService.js';
import addressService from './addressService.js';

export const customerService = {
  // Restaurants (public API)
  async getRestaurants(params = {}) {
    const res = await publicRestaurantService.getRestaurants(params);
    return res?.restaurants || [];
  },

  async getRestaurantById(id) {
    return publicRestaurantService.getRestaurantWithMenu(id);
  },

  // Saved Addresses (backed by /api/customer/addresses)
  getSavedAddresses() {
    return addressService.getAddresses();
  },

  async fetchSavedAddresses() {
    return addressService.fetchAddresses();
  },

  async saveAddress(newAddress) {
    if (newAddress.id && addressService.getAddresses().some((a) => a.id === newAddress.id)) {
      await addressService.updateAddress(newAddress.id, newAddress);
    } else {
      await addressService.addAddress(newAddress);
    }
    return addressService.getAddresses();
  },

  async updateAddress(addressId, nextAddressData) {
    await addressService.updateAddress(addressId, nextAddressData);
    return addressService.getAddresses();
  },

  async deleteAddress(addressId) {
    return addressService.deleteAddress(addressId);
  },

  getDefaultAddress() {
    return addressService.getDefaultAddress();
  },

  async setDefaultAddress(addressId) {
    return addressService.setDefaultAddress(addressId);
  },

  // Client-side search history (starts empty, no fake seed)
  getRecentSearches() {
    try {
      const stored = localStorage.getItem('salo_recent_searches');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  },

  saveRecentSearch(query) {
    const trimmed = String(query || '').trim();
    if (!trimmed) return [];
    const searches = this.getRecentSearches();
    const next = [trimmed, ...searches.filter((item) => item !== trimmed)].slice(0, 6);
    try {
      localStorage.setItem('salo_recent_searches', JSON.stringify(next));
    } catch {
      // Ignore storage errors
    }
    return next;
  },

  // Checkout & Orders (backed by /api/customer/checkout and /api/customer/orders)
  async placeCheckoutOrder(payload) {
    const res = await apiClient.post('/customer/checkout', payload);
    return res?.data?.checkout ?? null;
  },

  async fetchOrders(params = {}) {
    const sp = new URLSearchParams();
    if (params.page) sp.set('page', String(params.page));
    if (params.per_page) sp.set('per_page', String(params.per_page));
    if (params.status && params.status !== 'all') sp.set('status', params.status);
    const qs = sp.toString();
    const res = await apiClient.get(`/customer/orders${qs ? `?${qs}` : ''}`);
    return res?.data ?? { orders: [], pagination: {} };
  },

  async fetchOrderDetail(orderId) {
    const res = await apiClient.get(`/customer/orders/${orderId}`);
    return res?.data?.order ?? null;
  },

  async cancelOrder(orderId, reason = '') {
    const payload = reason && String(reason).trim() ? { reason: String(reason).trim() } : {};
    const res = await apiClient.post(`/customer/orders/${encodeURIComponent(orderId)}/cancel`, payload);
    return res?.data?.order ?? null;
  },

  getOrders() {
    return [];
  },

  // Reservations (Category B: no customer reservations backend endpoint yet)
  getReservations() {
    return [];
  },

  // Favorites (Category B: no customer favorites backend endpoint yet)
  getFavoriteRestaurants() {
    return [];
  },

  // Notifications (Category B: no customer notifications backend endpoint yet)
  getNotifications() {
    return [];
  },
};

export default customerService;
