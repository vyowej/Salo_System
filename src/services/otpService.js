import apiClient from './apiClient';

export const otpService = {
  async sendOtp({ email, purpose }) {
    const response = await apiClient.post('/otp/send', { email, purpose });
    return response?.data ?? response;
  },

  async verifyOtp({ email, purpose, code }) {
    const response = await apiClient.post('/otp/verify', { email, purpose, code });
    return response?.data ?? response;
  },
};

export default otpService;
