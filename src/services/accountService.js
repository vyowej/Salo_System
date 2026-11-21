/**
 * SALO — Account Service
 * Communicates with /api/account/* endpoints for profile, password, and partner applications.
 */

import apiClient from './apiClient.js';
import { normalizeUser } from './authService.js';

export const accountService = {
  async updateProfile(profileData) {
    const response = await apiClient.patch('/account/profile', profileData);
    return normalizeUser(response?.data?.user);
  },

  async updatePassword({ current_password, password, password_confirmation }) {
    return apiClient.put('/account/password', {
      current_password,
      password,
      password_confirmation,
    });
  },

  async getApplications() {
    const response = await apiClient.get('/account/applications');
    return {
      restaurant_application: response?.data?.restaurant_application ?? null,
      rider_application: response?.data?.rider_application ?? null,
    };
  },

  async getSettings() {
    const response = await apiClient.get('/account/settings');
    return response?.data?.settings ?? null;
  },

  async updateSettings(payload) {
    const response = await apiClient.put('/account/settings', payload);
    return response?.data?.settings ?? null;
  },

  async getContactNumbers() {
    const response = await apiClient.get('/account/contact-numbers');
    return response?.data?.contact_numbers ?? [];
  },

  async createContactNumber(payload) {
    const response = await apiClient.post('/account/contact-numbers', payload);
    return response?.data?.contact_number ?? null;
  },

  async updateContactNumber(id, payload) {
    const response = await apiClient.patch(`/account/contact-numbers/${encodeURIComponent(id)}`, payload);
    return response?.data?.contact_number ?? null;
  },

  async setDefaultContactNumber(id) {
    const response = await apiClient.patch(`/account/contact-numbers/${encodeURIComponent(id)}/default`, {});
    return response?.data?.contact_number ?? null;
  },

  async deleteContactNumber(id) {
    await apiClient.delete(`/account/contact-numbers/${encodeURIComponent(id)}`);
  },

  async getLifecycleRequests() {
    const response = await apiClient.get('/account/lifecycle-requests');
    return response?.data?.requests ?? [];
  },

  async deactivateAccount(reason = '') {
    const response = await apiClient.post('/account/deactivate', { reason: reason || null });
    return response?.data ?? null;
  },

  async requestDeletion(reason = '') {
    const response = await apiClient.post('/account/deletion-request', { reason: reason || null });
    return response?.data?.request ?? null;
  },

  async requestReactivation({ email, password, reason = '' }) {
    const response = await apiClient.post('/auth/reactivation-request', {
      email,
      password,
      reason: reason || null,
    });
    return response?.data?.request ?? null;
  },
};

export default accountService;
