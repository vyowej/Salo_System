import apiClient from './apiClient.js';

export const connectService = {
  async getConversation(orderId) {
    const res = await apiClient.get(`/orders/${encodeURIComponent(orderId)}/conversation`);
    return res?.data ?? null;
  },

  async sendMessage(orderId, message) {
    const res = await apiClient.post(`/orders/${encodeURIComponent(orderId)}/messages`, { message });
    return res?.data ?? null;
  },

  async requestWaitingTime(orderId) {
    const res = await apiClient.post(`/orders/${encodeURIComponent(orderId)}/waiting-requests`, {});
    return res?.data ?? null;
  },

  async respondToWaitingRequest(waitingRequestId, action) {
    const res = await apiClient.patch(`/waiting-requests/${encodeURIComponent(waitingRequestId)}`, { action });
    return res?.data ?? null;
  },

  async liftCustomerSuspension(userId) {
    const res = await apiClient.post(`/admin/users/${encodeURIComponent(userId)}/lift-suspension`, {});
    return res?.data ?? null;
  },
};

export default connectService;
