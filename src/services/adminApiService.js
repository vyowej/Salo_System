import apiClient from './apiClient';
import locationApiService from './locationApiService';

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

export function normalizeAdminReservation(row = {}) {
  const status = row.status || row.reservation_status || 'pending';
  const guests = Number(row.party_size ?? row.number_of_guests ?? 0);
  const restaurantName = row.restaurant?.name || row.restaurant_name || '—';
  const customerName = row.contact_name || row.customer_name || '—';

  return {
    id: row.reservation_id,
    reservation_id: row.reservation_id,
    reservation_reference: row.reservation_reference || row.reference || `#${row.reservation_id}`,
    reference: row.reference || row.reservation_reference || `#${row.reservation_id}`,
    customer_id: row.customer_id ?? null,
    customer_name: customerName,
    contact_name: row.contact_name || customerName,
    contact_phone: row.contact_phone || null,
    customer_email: row.customer_email || null,
    restaurant_id: row.restaurant_id ?? row.restaurant?.restaurant_id ?? null,
    restaurant_name: restaurantName,
    restaurant: row.restaurant || {
      restaurant_id: row.restaurant_id ?? null,
      name: restaurantName,
    },
    table_id: row.table_id ?? row.table?.table_id ?? null,
    table: row.table || null,
    reservation_start: row.reservation_start ?? null,
    reservation_end: row.reservation_end ?? null,
    number_of_guests: guests,
    party_size: guests,
    reservation_status: status,
    status,
    status_label: row.status_label || status,
    attention: row.attention ?? null,
    can_admin_cancel: Boolean(row.can_admin_cancel),
    deposit_amount: Number(row.deposit_amount ?? 0),
    deposit_status: row.deposit_status || 'none',
    service_fee: Number(row.service_fee ?? 0),
    cancellation_fee: Number(row.cancellation_fee ?? 0),
    special_requests: row.special_requests || null,
    cancelled_by: row.cancelled_by || null,
    cancellation_reason: row.cancellation_reason || null,
    rejection_reason: row.rejection_reason || null,
    created_at: row.created_at ?? null,
    status_history: Array.isArray(row.status_history) ? row.status_history : [],
  };
}

export function normalizeReservationStats(raw = {}) {
  const attention = raw.attention_counts || {};
  return {
    date_from: raw.date_from || '',
    date_to: raw.date_to || '',
    restaurant_id: raw.restaurant_id ?? null,
    total_reservations: Number(raw.total_reservations ?? 0),
    active_upcoming: Number(raw.active_upcoming ?? 0),
    total_guests: Number(raw.total_guests ?? 0),
    completed_guests: Number(raw.completed_guests ?? 0),
    no_show_rate: Number(raw.no_show_rate ?? 0),
    cancellation_rate: Number(raw.cancellation_rate ?? 0),
    completion_rate: Number(raw.completion_rate ?? 0),
    status_counts: raw.status_counts || {},
    attention_counts: {
      pending_expiring: Number(attention.pending_expiring ?? 0),
      no_show_candidate: Number(attention.no_show_candidate ?? 0),
      overdue_seated: Number(attention.overdue_seated ?? 0),
      total: Number(attention.total ?? 0),
    },
    daily_trend: Array.isArray(raw.daily_trend) ? raw.daily_trend : [],
    top_restaurants: Array.isArray(raw.top_restaurants) ? raw.top_restaurants : [],
  };
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

  async updateRestaurantStatus(restaurantId, { status, reason = '', apply_to_all_branches = false }) {
    const payload = {
      status,
      reason: reason || null,
    };
    if (apply_to_all_branches) {
      payload.apply_to_all_branches = true;
    }
    const response = await apiClient.patch(`/admin/restaurants/${restaurantId}/status`, payload);
    return response?.data?.restaurant ?? null;
  },

  async getRiders(params = {}) {
    const response = await apiClient.get(`/admin/riders${toQueryString(params)}`);
    return response?.data ?? { items: [], meta: {} };
  },

  async activateRider(riderId) {
    const response = await apiClient.post(`/admin/riders/${riderId}/activate`, {});
    return response?.data?.rider ?? null;
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

  async getOrders(params = {}) {
    const response = await apiClient.get(`/admin/orders${toQueryString(params)}`);
    return response?.data ?? { items: [], meta: {} };
  },

  async getOrderTracking(orderId) {
    return locationApiService.getAdminOrderTracking(orderId);
  },

  async getReservations(params = {}) {
    const response = await apiClient.get(`/admin/reservations${toQueryString(params)}`);
    const payload = response?.data ?? { items: [], meta: {} };
    return {
      items: Array.isArray(payload.items) ? payload.items.map(normalizeAdminReservation) : [],
      meta: payload.meta ?? { current_page: 1, last_page: 1, per_page: 15, total: 0 },
    };
  },

  async getReservationStats(params = {}) {
    const response = await apiClient.get(`/admin/reservations/stats${toQueryString(params)}`);
    return normalizeReservationStats(response?.data ?? {});
  },

  async getReservationDetail(reservationId) {
    const response = await apiClient.get(`/admin/reservations/${encodeURIComponent(reservationId)}`);
    const raw = response?.data?.reservation ?? null;
    return raw ? normalizeAdminReservation(raw) : null;
  },

  async getChangeRequests(params = {}) {
    const response = await apiClient.get(`/admin/change-requests${toQueryString(params)}`);
    return response?.data?.requests ?? [];
  },

  async decideChangeRequest(requestId, { decision, reviewNote = '' }) {
    const response = await apiClient.post(`/admin/change-requests/${encodeURIComponent(requestId)}/decision`, {
      decision,
      review_note: reviewNote || null,
    });
    return response?.data?.request ?? null;
  },

  getChangeRequestDocumentUrl(requestId, index) {
    const base = String(apiClient.baseURL || '/api').replace(/\/$/, '');
    return `${base}/admin/change-requests/${encodeURIComponent(requestId)}/documents/${encodeURIComponent(index)}`;
  },

  async getLifecycleRequests(params = {}) {
    const response = await apiClient.get(`/admin/lifecycle-requests${toQueryString(params)}`);
    return response?.data?.requests ?? [];
  },

  async decideLifecycleRequest(lifecycleRequestId, { decision, reviewNote = '' }) {
    const response = await apiClient.post(`/admin/lifecycle-requests/${encodeURIComponent(lifecycleRequestId)}/decision`, {
      decision,
      review_note: reviewNote || null,
    });
    return response?.data?.request ?? null;
  },

  async getBranchPermits(params = {}) {
    const response = await apiClient.get(`/admin/branch-permits${toQueryString(params)}`);
    return response?.data ?? { items: [], meta: {} };
  },

  async getBranchPermitDetail(permitId) {
    const response = await apiClient.get(`/admin/branch-permits/${encodeURIComponent(permitId)}`);
    return response?.data?.permit ?? null;
  },

  async fetchBranchPermitFileBlob(permitId) {
    const base = apiClient.getBaseUrl();
    const res = await fetch(`${base}/admin/branch-permits/${encodeURIComponent(permitId)}/file`, {
      method: 'GET',
      credentials: 'include',
      headers: {
        'X-Requested-With': 'XMLHttpRequest',
      },
    });
    if (!res.ok) {
      throw new Error(`Unable to load branch permit file (${res.status}).`);
    }
    return res.blob();
  },

  async reviewBranchPermitAction(permitId, action, { review_note = null } = {}) {
    const response = await apiClient.post(
      `/admin/branch-permits/${encodeURIComponent(permitId)}/${encodeURIComponent(action)}`,
      review_note ? { review_note } : {},
    );
    return response?.data?.permit ?? null;
  },
};

export default adminApiService;
