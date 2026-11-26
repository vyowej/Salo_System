import apiClient from '../services/apiClient';

export const receiptService = {
  async getCustomerReceipt(orderId) {
    const response = await apiClient.get(`/customer/orders/${encodeURIComponent(orderId)}/receipt`);
    return response?.data?.receipt ?? null;
  },

  async getRestaurantReceipt(orderId) {
    const response = await apiClient.get(`/restaurant/orders/${encodeURIComponent(orderId)}/receipt`);
    return response?.data?.receipt ?? null;
  },

  async getRiderReceipt(orderId) {
    const response = await apiClient.get(`/rider/deliveries/${encodeURIComponent(orderId)}/receipt`);
    return response?.data?.receipt ?? null;
  },
};

export default receiptService;
