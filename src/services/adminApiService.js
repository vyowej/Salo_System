import apiClient from './apiClient';

function toQueryString(params = {}) {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([key, val]) => {
    if (val !== undefined && val !== null && val !== '') {
      sp.set(key, String(val));
    }
  });
  const qs = sp.toString();
  return qs ? `?${qs}` : '';
}

export const adminApiService = {
  async getApplications(params = {}) {
    const response = await apiClient.get(`/admin/applications${toQueryString(params)}`);
    return response?.data ?? { items: [], meta: {} };
  },

  async getApplicationDetail(type, id) {
    const response = await apiClient.get(`/admin/applications/${type}/${id}`);
    return response?.data?.application ?? null;
  },

  async reviewDocument(type, applicationId, documentId, { status, reviewNote = '' }) {
    const response = await apiClient.patch(
      `/admin/applications/${type}/${applicationId}/documents/${documentId}`,
      { status, review_note: reviewNote || null },
    );
    return response?.data?.application ?? null;
  },

  async requestDocument(type, applicationId, { documentName, reason, instructions = '', dueDate = null }) {
    const response = await apiClient.post(
      `/admin/applications/${type}/${applicationId}/document-requests`,
      {
        document_name: documentName,
        reason,
        instructions: instructions || null,
        due_date: dueDate || null,
      },
    );
    return response?.data?.application ?? null;
  },

  async decideApplication(type, applicationId, { decision, note = '' }) {
    const response = await apiClient.post(
      `/admin/applications/${type}/${applicationId}/decision`,
      { decision, note: note || null },
    );
    return response?.data?.application ?? null;
  },

  async getUsers(params = {}) {
    const response = await apiClient.get(`/admin/users${toQueryString(params)}`);
    return response?.data ?? { items: [], meta: {} };
  },

  async createUser(payload) {
    const response = await apiClient.post('/admin/users', payload);
    return response?.data?.user ?? null;
  },

  async updateUser(userId, payload) {
    const response = await apiClient.patch(`/admin/users/${userId}`, payload);
    return response?.data?.user ?? null;
  },

  async getRestaurants(params = {}) {
    const response = await apiClient.get(`/admin/restaurants${toQueryString(params)}`);
    return response?.data ?? { items: [], meta: {} };
  },

  async updateRestaurantStatus(restaurantId, { status, reason = '' }) {
    const response = await apiClient.patch(`/admin/restaurants/${restaurantId}/status`, {
      status,
      reason: reason || null,
    });
    return response?.data?.restaurant ?? null;
  },

  async getRiders(params = {}) {
    const response = await apiClient.get(`/admin/riders${toQueryString(params)}`);
    return response?.data ?? { items: [], meta: {} };
  },

  async updateRiderStatus(riderId, { status, reason = '' }) {
    const response = await apiClient.patch(`/admin/riders/${riderId}/status`, {
      status,
      reason: reason || null,
    });
    return response?.data?.rider ?? null;
  },

  async getAuditLogs(params = {}) {
    const response = await apiClient.get(`/admin/audit-logs${toQueryString(params)}`);
    return response?.data ?? { items: [], meta: {} };
  },
};

export default adminApiService;
