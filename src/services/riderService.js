import apiClient from './apiClient';

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
};

export default riderService;
