import apiClient from './apiClient.js';
import locationApiService from './locationApiService.js';

let inFlightDashboardPromise = null;

export const riderService = {
  async getDashboard() {
    if (inFlightDashboardPromise) {
      return inFlightDashboardPromise;
    }

    inFlightDashboardPromise = (async () => {
      try {
        const response = await apiClient.get('/rider/dashboard');
        return response?.data ?? null;
      } finally {
        inFlightDashboardPromise = null;
      }
    })();

    return inFlightDashboardPromise;
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

  async markDelivered(orderId, collectedAmount = null, pod = {}) {
    const hasFile = typeof File !== 'undefined' && pod?.proofPhoto instanceof File;
    let payload;
    if (hasFile) {
      payload = new FormData();
      if (collectedAmount !== null && collectedAmount !== undefined) {
        payload.append('collected_amount', String(collectedAmount));
      }
      if (pod.recipientName) payload.append('recipient_name', String(pod.recipientName));
      if (pod.deliveryNotes) payload.append('delivery_notes', String(pod.deliveryNotes));
      if (pod.proofLatitude !== undefined && pod.proofLatitude !== null) {
        payload.append('proof_latitude', String(pod.proofLatitude));
      }
      if (pod.proofLongitude !== undefined && pod.proofLongitude !== null) {
        payload.append('proof_longitude', String(pod.proofLongitude));
      }
      payload.append('proof_photo', pod.proofPhoto);
    } else {
      payload = {};
      if (collectedAmount !== null && collectedAmount !== undefined) {
        payload.collected_amount = collectedAmount;
      }
      if (pod?.recipientName) payload.recipient_name = pod.recipientName;
      if (pod?.deliveryNotes) payload.delivery_notes = pod.deliveryNotes;
    }

    const response = await apiClient.post(`/rider/deliveries/${encodeURIComponent(orderId)}/delivered`, payload);
    return response?.data?.delivery ?? null;
  },

  async markFailed(orderId, failureReason, deliveryNotes = '') {
    const response = await apiClient.post(`/rider/deliveries/${encodeURIComponent(orderId)}/fail`, {
      failure_reason: failureReason,
      delivery_notes: deliveryNotes || undefined,
    });
    return response?.data?.delivery ?? null;
  },

  async getFinanceSummary({ page = 1, perPage = 20, remittanceStatus = '' } = {}) {
    const params = new URLSearchParams();
    if (page) params.set('page', String(page));
    if (perPage) params.set('per_page', String(perPage));
    if (remittanceStatus && remittanceStatus !== 'all') params.set('remittance_status', remittanceStatus);
    const qs = params.toString();
    const response = await apiClient.get(`/rider/finance${qs ? `?${qs}` : ''}`);
    return response?.data ?? { summary: {}, deliveries: [], pagination: { current_page: 1, last_page: 1, per_page: perPage, total: 0 } };
  },

  async submitCodRemittance(deliveryIds, notes = '') {
    const response = await apiClient.post('/rider/finance/remit', {
      delivery_ids: deliveryIds,
      notes: notes || undefined,
    });
    return response?.data ?? null;
  },

  async getChangeRequests() {
    const response = await apiClient.get('/rider/change-requests');
    return response?.data?.requests ?? [];
  },

  async submitChangeRequest(payload) {
    const fd = payload instanceof FormData ? payload : new FormData();
    if (!(payload instanceof FormData)) {
      Object.entries(payload || {}).forEach(([key, val]) => {
        if (val === undefined || val === null) return;
        if (key === 'documents' && Array.isArray(val)) {
          val.forEach((file) => {
            if (file) fd.append('documents[]', file);
          });
        } else {
          fd.append(key, String(val));
        }
      });
    }
    const response = await apiClient.post('/rider/change-requests', fd);
    return response?.data?.request ?? null;
  },

  async cancelChangeRequest(requestId) {
    const response = await apiClient.delete(`/rider/change-requests/${encodeURIComponent(requestId)}`);
    return response?.data?.request ?? null;
  },
};

export default riderService;
