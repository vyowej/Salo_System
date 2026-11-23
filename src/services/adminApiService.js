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
    deposit_display_status: row.deposit_display_status || row.deposit_status || 'none',
    service_fee: Number(row.service_fee ?? 0),
    cancellation_fee: Number(row.cancellation_fee ?? 0),
    special_requests: row.special_requests || null,
    cancelled_by: row.cancelled_by || null,
    cancellation_reason: row.cancellation_reason || null,
    rejection_reason: row.rejection_reason || null,
    created_at: row.created_at ?? null,
    expiresAt: row.expires_at ?? row.expiresAt ?? null,
    status_history: Array.isArray(row.status_history) ? row.status_history : [],
    customer_history: row.customer_history ?? null,
    restaurant_settings: row.restaurant_settings ?? null,
  };
}

export function normalizeReservationStats(raw = {}) {
  const totals = raw.totals || {};
  const rates = raw.rates || {};
  const deposits = raw.deposits || {};
  const attention = raw.attention_counts || {};
  const byCancelledBy = raw.by_cancelled_by || {};

  const safeNum = (val) => {
    const n = Number(val ?? 0);
    return Number.isFinite(n) ? n : 0;
  };

  return {
    date_from: raw.date_from || '',
    date_to: raw.date_to || '',
    restaurant_id: raw.restaurant_id ?? null,
    totals: {
      total: safeNum(totals.total ?? raw.total_reservations),
      by_status: totals.by_status || raw.status_counts || {},
      completed: safeNum(totals.completed),
      no_show: safeNum(totals.no_show),
      cancelled_total: safeNum(totals.cancelled_total),
      covers_total: safeNum(totals.covers_total ?? raw.total_guests),
      average_party_size: safeNum(totals.average_party_size),
    },
    rates: {
      no_show_rate: safeNum(rates.no_show_rate ?? raw.no_show_rate),
      cancellation_rate: safeNum(rates.cancellation_rate ?? raw.cancellation_rate),
      completion_rate: safeNum(rates.completion_rate ?? raw.completion_rate),
      confirmation_rate: safeNum(rates.confirmation_rate),
      definitions: rates.definitions || {},
    },
    by_day: Array.isArray(raw.by_day) ? raw.by_day : [],
    by_cancelled_by: {
      customer: safeNum(byCancelledBy.customer),
      restaurant: safeNum(byCancelledBy.restaurant),
      admin: safeNum(byCancelledBy.admin),
      system: safeNum(byCancelledBy.system),
    },
    by_hour: Array.isArray(raw.by_hour) ? raw.by_hour : [],
    top_restaurants: Array.isArray(raw.top_restaurants)
      ? raw.top_restaurants.map((r) => ({
          restaurant_id: r.restaurant_id,
          name: r.name || r.restaurant_name || '—',
          total: safeNum(r.total ?? r.total_reservations),
          completed: safeNum(r.completed ?? r.completed_count),
          no_show_rate: safeNum(r.no_show_rate),
        }))
      : [],
    deposits: {
      required_count: safeNum(deposits.required_count),
      paid_count: safeNum(deposits.paid_count),
      pending_count: safeNum(deposits.pending_count),
      waived_count: safeNum(deposits.waived_count),
      refunded_count: safeNum(deposits.refunded_count),
      total_deposit_amount_paid: safeNum(deposits.total_deposit_amount_paid),
    },
    service_fee_total: safeNum(raw.service_fee_total),
    attention_count: safeNum(raw.attention_count ?? attention.total),
    attention_counts: {
      pending_expiring: safeNum(attention.pending_expiring),
      no_show_candidate: safeNum(attention.no_show_candidate),
      overdue_seated: safeNum(attention.overdue_seated),
      total: safeNum(attention.total ?? raw.attention_count),
    },
    active_upcoming: safeNum(raw.active_upcoming),
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
    const payload = response?.data ?? { items: [], meta: {}, summary: {} };
    return {
      items: Array.isArray(payload.items) ? payload.items.map(normalizeAdminReservation) : [],
      meta: payload.meta ?? { current_page: 1, last_page: 1, per_page: 15, total: 0 },
      summary: payload.summary ?? {
        total: 0,
        total_guests: 0,
        pending_count: 0,
        active_count: 0,
        completed_count: 0,
        cancelled_count: 0,
        no_show_count: 0,
      },
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

  async getDashboard() {
    const response = await apiClient.get('/admin/dashboard');
    return response?.data ?? null;
  },

  async getUserActivity(userId) {
    const response = await apiClient.get(`/admin/users/${encodeURIComponent(userId)}/activity`);
    return response?.data ?? { orders: [], reservations: [] };
  },

  async revokeUserSessions(userId, reason = '') {
    const response = await apiClient.post(`/admin/users/${encodeURIComponent(userId)}/revoke-sessions`, {
      reason: reason || undefined,
    });
    return response?.data ?? null;
  },

  async getDisputes(params = {}) {
    const response = await apiClient.get(`/admin/disputes${toQueryString(params)}`);
    return response?.data ?? { items: [], meta: {} };
  },

  async resolveDispute(orderId, { action, notes }) {
    const response = await apiClient.post(`/admin/disputes/${encodeURIComponent(orderId)}/resolve`, {
      action,
      notes,
    });
    return response?.data?.resolution ?? null;
  },

  async getCodRemittances(params = {}) {
    const response = await apiClient.get(`/admin/finance/cod-remittances${toQueryString(params)}`);
    return response?.data ?? { summary: {}, items: [], meta: {} };
  },

  async getFinanceLedger() {
    const response = await apiClient.get('/admin/finance/ledger');
    return response?.data ?? { summary: {}, recent_journals: [] };
  },

  async verifyCodRemittance(deliveryId, { action, notes = null }) {
    const response = await apiClient.post(`/admin/finance/cod-remittances/${encodeURIComponent(deliveryId)}/verify`, {
      action,
      notes: notes || undefined,
    });
    return response?.data?.remittance ?? null;
  },

  async getPromos(params = {}) {
    const response = await apiClient.get(`/admin/promos${toQueryString(params)}`);
    return response?.data ?? { items: [], meta: {} };
  },

  async createPromo(payload) {
    const response = await apiClient.post('/admin/promos', payload);
    return response?.data?.promo ?? null;
  },

  async updatePromo(promoId, payload) {
    const response = await apiClient.patch(`/admin/promos/${encodeURIComponent(promoId)}`, payload);
    return response?.data?.promo ?? null;
  },
};

export default adminApiService;
