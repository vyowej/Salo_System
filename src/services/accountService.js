/**
 * SALO — Account Service
 * Communicates with /api/account/* endpoints for profile, password, and partner applications.
 */

import apiClient from './apiClient';
import { normalizeUser } from './authService';

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
};

export default accountService;
