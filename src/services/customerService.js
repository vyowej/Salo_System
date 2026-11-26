/**
 * SALO — Customer Service
 * Delegates restaurants/menus to publicRestaurantService and addresses to addressService.
 * Orders, reservations, favorites, and notifications return empty states until their
 * respective backend endpoints are implemented.
 */

import apiClient from './apiClient.js';
import publicRestaurantService, {
  normalizeReservationInfo,
  normalizeReservationSlot,
  normalizeReservationDayAvailability,
  normalizeReservationMonthDay,
  normalizeReservationMonthOverview,
  normalizeAvailableReservationTable,
  normalizeReservationSlotTables,
} from './publicRestaurantService.js';
import addressService from './addressService.js';
import locationApiService from './locationApiService.js';

const RESERVATION_STATUS_LABELS = {
  pending: 'Pending',
  approved: 'Approved',
  awaiting_payment: 'Awaiting Payment',
  confirmed: 'Confirmed',
  arrived: 'Arrived',
  seated: 'Seated',
  completed: 'Completed',
  cancelled: 'Cancelled',
  no_show: 'No-Show',
  rejected: 'Rejected',
  expired: 'Expired',
};

const DEPOSIT_STATUS_LABELS = {
  none: 'No Deposit Required',
  pending: 'Deposit pending — pay the restaurant directly',
  paid: 'Deposit received',
  waived: 'Deposit waived',
  refunded: 'Deposit refunded',
  not_collected: 'Deposit not collected',
};

export function normalizeReservation(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const reservationId = Number(raw.reservation_id ?? raw.reservationId ?? raw.id ?? 0);
  const reference = raw.reservation_reference ?? raw.reference ?? (reservationId ? `SALO-RES-${reservationId}` : '');
  const rawStatus = String(raw.reservation_status ?? raw.statusCode ?? raw.status ?? 'pending').toLowerCase();
  const statusLabel = RESERVATION_STATUS_LABELS[rawStatus] || 'Pending';

  const tableObj = raw.table && typeof raw.table === 'object' ? raw.table : null;
  const tableId = raw.table_id ?? tableObj?.table_id ?? raw.tableId ?? null;
  const tableName = tableObj?.table_name ?? raw.table_name ?? raw.tableName ?? null;
  const diningArea = tableObj?.dining_area ?? raw.dining_area ?? raw.diningArea ?? raw.seatingArea ?? 'Indoor';

  const guests = Number(raw.number_of_guests ?? raw.party_size ?? raw.partySize ?? raw.guests ?? 0);
  const depositAmount = Number(raw.deposit_amount ?? raw.depositAmount ?? 0);
  const serviceFee = Number(raw.service_fee ?? raw.serviceFee ?? 0);
  const depositStatus = String(raw.deposit_status ?? raw.depositStatus ?? 'none').toLowerCase();
  const depositDisplayStatus = String(
    raw.deposit_display_status ?? raw.depositDisplayStatus ?? depositStatus,
  ).toLowerCase();

  const history = Array.isArray(raw.status_history ?? raw.statusHistory ?? raw.history)
    ? (raw.status_history ?? raw.statusHistory ?? raw.history).map((entry) => ({
        historyId: Number(entry.history_id ?? entry.historyId ?? 0),
        reservationId: Number(entry.reservation_id ?? entry.reservationId ?? reservationId),
        fromStatus: entry.from_status ?? entry.fromStatus ?? null,
        toStatus: entry.to_status ?? entry.toStatus ?? '',
        toStatusLabel:
          RESERVATION_STATUS_LABELS[String(entry.to_status ?? entry.toStatus ?? '').toLowerCase()] ||
          String(entry.to_status ?? entry.toStatus ?? ''),
        changedByUserId: entry.changed_by_user_id ?? entry.changedByUserId ?? null,
        changedByRole: entry.changed_by_role ?? entry.changedByRole ?? 'system',
        note: entry.note ?? null,
        createdAt: entry.created_at ?? entry.createdAt ?? null,
      }))
    : [];

  return {
    id: reference || String(reservationId),
    reservationId,
    reference,
    reservationReference: reference,
    restaurantId: Number(raw.restaurant_id ?? raw.restaurantId ?? 0),
    restaurantName: raw.restaurant_name ?? raw.restaurantName ?? 'Restaurant',
    restaurantPhone: raw.restaurant_phone ?? raw.restaurantPhone ?? null,
    restaurantAddress: raw.restaurant_address ?? raw.restaurantAddress ?? null,
    restaurantLogo: raw.restaurant_logo_path ?? raw.restaurantLogo ?? null,
    reservationNotes: raw.reservation_notes ?? raw.reservationNotes ?? null,
    customerId: Number(raw.customer_id ?? raw.customerId ?? 0),
    guestName: raw.contact_name ?? raw.contactName ?? raw.customer?.contact_name ?? '',
    contactName: raw.contact_name ?? raw.contactName ?? raw.customer?.contact_name ?? '',
    guestPhone: raw.contact_phone ?? raw.contactPhone ?? raw.customer?.contact_phone ?? '',
    contactPhone: raw.contact_phone ?? raw.contactPhone ?? raw.customer?.contact_phone ?? '',
    guestEmail: raw.customer_email ?? raw.customerEmail ?? raw.customer?.email ?? null,
    customerEmail: raw.customer_email ?? raw.customerEmail ?? raw.customer?.email ?? null,
    tableId: tableId !== null ? Number(tableId) : null,
    tableName,
    diningArea,
    seatingArea: diningArea,
    assignedTable:
      tableId !== null
        ? {
            id: Number(tableId),
            tableId: Number(tableId),
            name: tableName || `#${tableId}`,
            tableName: tableName || `#${tableId}`,
            diningArea,
            capacity: Number(tableObj?.seating_capacity ?? 0),
            minPartySize: Number(tableObj?.min_party_size ?? 1),
            description: tableObj?.description ?? null,
          }
        : null,
    assignedDiningAreaDiffers: Boolean(
      raw.assigned_dining_area_differs ?? raw.assignedDiningAreaDiffers ?? false,
    ),
    reservationStart: raw.reservation_start ?? raw.reservationStart ?? null,
    reservationEnd: raw.reservation_end ?? raw.reservationEnd ?? null,
    date:
      raw.reservation_date ??
      raw.date ??
      (raw.reservation_start ? String(raw.reservation_start).slice(0, 10) : ''),
    time:
      raw.reservation_time ??
      raw.time ??
      (raw.reservation_start ? String(raw.reservation_start).slice(11, 16) : ''),
    durationMinutes: Number(raw.duration_minutes ?? raw.durationMinutes ?? 90),
    guests,
    partySize: guests,
    numberOfGuests: guests,
    status: statusLabel,
    statusCode: rawStatus,
    rawStatus,
    specialRequests: raw.special_requests ?? raw.specialRequests ?? null,
    depositAmount,
    depositStatus,
    depositDisplayStatus,
    paymentStatus: DEPOSIT_STATUS_LABELS[depositDisplayStatus] || DEPOSIT_STATUS_LABELS[depositStatus] || 'No Deposit Required',
    serviceFee,
    fee: depositAmount > 0 ? depositAmount : serviceFee,
    isFeeRefundable: Boolean(raw.is_fee_refundable ?? raw.isFeeRefundable ?? true),
    cancellationFee: Number(raw.cancellation_fee ?? raw.cancellationFee ?? 0),
    canCancel: Boolean(raw.can_cancel ?? raw.canCancel ?? false),
    isUpcoming: Boolean(raw.is_upcoming ?? raw.isUpcoming ?? false),
    cancellationCutoffMinutes: Number(
      raw.cancellation_cutoff_minutes ?? raw.cancellationCutoffMinutes ?? 120,
    ),
    cancellationDeadline: raw.cancellation_deadline ?? raw.cancellationDeadline ?? null,
    cancelledBy: raw.cancelled_by ?? raw.cancelledBy ?? null,
    cancelledAt: raw.cancelled_at ?? raw.cancelledAt ?? null,
    cancellationReason: raw.cancellation_reason ?? raw.cancellationReason ?? null,
    rejectionReason: raw.rejection_reason ?? raw.rejectionReason ?? null,
    rejectedAt: raw.rejected_at ?? raw.rejectedAt ?? null,
    expiresAt: raw.expires_at ?? raw.expiresAt ?? null,
    approvedAt: raw.approved_at ?? raw.approvedAt ?? null,
    confirmedAt: raw.confirmed_at ?? raw.confirmedAt ?? null,
    arrivedAt: raw.arrived_at ?? raw.arrivedAt ?? null,
    seatedAt: raw.seated_at ?? raw.seatedAt ?? null,
    completedAt: raw.completed_at ?? raw.completedAt ?? null,
    expiredAt: raw.expired_at ?? raw.expiredAt ?? null,
    noShowMarkedAt: raw.no_show_marked_at ?? raw.noShowMarkedAt ?? null,
    createdAt: raw.created_at ?? raw.createdAt ?? null,
    updatedAt: raw.updated_at ?? raw.updatedAt ?? null,
    latestPayment: raw.latest_payment ?? raw.latestPayment ?? null,
    latestRefund: raw.latest_refund ?? raw.latestRefund ?? null,
    depositUnderReview: Boolean(raw.deposit_under_review ?? raw.depositUnderReview ?? false),
    history,
    statusHistory: history,
  };
}

export const customerService = {
  // Restaurants (public API)
  async getRestaurants(params = {}) {
    const res = await publicRestaurantService.getRestaurants(params);
    return res?.restaurants || [];
  },

  async getRestaurantById(id) {
    return publicRestaurantService.getRestaurantWithMenu(id);
  },

  // Saved Addresses (backed by /api/customer/addresses)
  getSavedAddresses() {
    return addressService.getAddresses();
  },

  async fetchSavedAddresses() {
    return addressService.fetchAddresses();
  },

  async saveAddress(newAddress) {
    if (newAddress.id && addressService.getAddresses().some((a) => a.id === newAddress.id)) {
      await addressService.updateAddress(newAddress.id, newAddress);
    } else {
      await addressService.addAddress(newAddress);
    }
    return addressService.getAddresses();
  },

  async updateAddress(addressId, nextAddressData) {
    await addressService.updateAddress(addressId, nextAddressData);
    return addressService.getAddresses();
  },

  async deleteAddress(addressId) {
    return addressService.deleteAddress(addressId);
  },

  getDefaultAddress() {
    return addressService.getDefaultAddress();
  },

  async setDefaultAddress(addressId) {
    return addressService.setDefaultAddress(addressId);
  },

  // Client-side search history (starts empty, no fake seed)
  getRecentSearches() {
    try {
      const stored = localStorage.getItem('salo_recent_searches');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  },

  saveRecentSearch(query) {
    const trimmed = String(query || '').trim();
    if (!trimmed) return [];
    const searches = this.getRecentSearches();
    const next = [trimmed, ...searches.filter((item) => item !== trimmed)].slice(0, 6);
    try {
      localStorage.setItem('salo_recent_searches', JSON.stringify(next));
    } catch {
      // Ignore storage errors
    }
    return next;
  },

  // Checkout & Orders (backed by /api/customer/checkout and /api/customer/orders)
  async placeCheckoutOrder(payload) {
    const res = await apiClient.post('/customer/checkout', payload);
    return res?.data?.checkout ?? null;
  },

  async getDeliveryFeeQuote({
    restaurantId,
    fulfillment = 'delivery',
    addressId = null,
    latitude = null,
    longitude = null,
  }) {
    const res = await apiClient.post('/customer/delivery-fee/quote', {
      restaurant_id: Number(restaurantId),
      fulfillment,
      ...(addressId ? { address_id: Number(addressId) } : {}),
      ...(latitude != null && longitude != null ? { latitude: Number(latitude), longitude: Number(longitude) } : {}),
    });
    return res?.data ?? null;
  },

  async validatePromoCode({ promoCode, subtotal, restaurantId = null }) {
    const res = await apiClient.post('/customer/promos/validate', {
      promo_code: promoCode,
      subtotal,
      ...(restaurantId ? { restaurant_id: restaurantId } : {}),
    });
    return res?.data?.promo ?? null;
  },

  async getPayment(paymentId) {
    const res = await apiClient.get(`/customer/payments/${encodeURIComponent(paymentId)}`);
    return res?.data?.payment ?? null;
  },

  async initiatePayment(paymentId) {
    const res = await apiClient.post(`/customer/payments/${encodeURIComponent(paymentId)}/initiate`, {});
    return res?.data?.payment ?? null;
  },

  async confirmPayment(paymentId, providerReference = null) {
    const res = await apiClient.post(`/customer/payments/${encodeURIComponent(paymentId)}/confirm`, {
      ...(providerReference ? { provider_reference: providerReference } : {}),
    });
    return res?.data?.payment ?? null;
  },

  async failPayment(paymentId, reason = null) {
    const res = await apiClient.post(`/customer/payments/${encodeURIComponent(paymentId)}/fail`, {
      ...(reason ? { reason } : {}),
    });
    return res?.data?.payment ?? null;
  },

  async fetchOrders(params = {}) {
    const sp = new URLSearchParams();
    if (params.page) sp.set('page', String(params.page));
    if (params.per_page) sp.set('per_page', String(params.per_page));
    if (params.status && params.status !== 'all') sp.set('status', params.status);
    const qs = sp.toString();
    const res = await apiClient.get(`/customer/orders${qs ? `?${qs}` : ''}`);
    return res?.data ?? { orders: [], pagination: {} };
  },

  async fetchOrderDetail(orderId) {
    const res = await apiClient.get(`/customer/orders/${orderId}`);
    return res?.data?.order ?? null;
  },

  async getCustomerOrderTracking(orderId) {
    return locationApiService.getCustomerOrderTracking(orderId);
  },

  async cancelOrder(orderId, reason = '') {
    const payload = reason && String(reason).trim() ? { reason: String(reason).trim() } : {};
    const res = await apiClient.post(`/customer/orders/${encodeURIComponent(orderId)}/cancel`, payload);
    return res?.data?.order ?? null;
  },

  async respondToCall(orderId, action) {
    const res = await apiClient.post(`/customer/orders/${encodeURIComponent(orderId)}/call/respond`, { action });
    return res?.data ?? null;
  },

  getOrders() {
    return [];
  },

  // Reservations availability & lookup (backed by /api/restaurants/{id}/reservation-*)
  async getReservationInfo(restaurantId) {
    return publicRestaurantService.getReservationInfo(restaurantId);
  },

  async getReservationMonthOverview(restaurantId, month, partySize) {
    return publicRestaurantService.getReservationMonthOverview(restaurantId, month, partySize);
  },

  async getReservationAvailability(restaurantId, date, partySize, diningArea = '') {
    return publicRestaurantService.getReservationAvailability(restaurantId, date, partySize, diningArea);
  },

  async getReservationTables(restaurantId, start, partySize, diningArea = '') {
    return publicRestaurantService.getReservationTables(restaurantId, start, partySize, diningArea);
  },

  // Customer Reservation Booking & Management (backed by /api/customer/reservations*)
  async createReservation(payload = {}) {
    const body = {
      restaurant_id: Number(payload.restaurant_id ?? payload.restaurantId ?? 0),
      start: payload.start ?? '',
      party_size: Number(payload.party_size ?? payload.partySize ?? payload.guests ?? 0),
      idempotency_key: payload.idempotency_key ?? payload.idempotencyKey ?? '',
    };

    if (payload.table_id !== undefined || payload.tableId !== undefined) {
      const tid = payload.table_id ?? payload.tableId;
      if (tid !== null && tid !== '') body.table_id = Number(tid);
    }
    if (payload.dining_area !== undefined || payload.diningArea !== undefined) {
      const area = payload.dining_area ?? payload.diningArea;
      if (area && String(area).trim() && area !== 'any') {
        body.dining_area = String(area).trim();
      }
    }
    if (payload.contact_name !== undefined || payload.contactName !== undefined) {
      body.contact_name = payload.contact_name ?? payload.contactName ?? null;
    }
    if (payload.contact_phone !== undefined || payload.contactPhone !== undefined) {
      body.contact_phone = payload.contact_phone ?? payload.contactPhone ?? null;
    }
    if (payload.special_requests !== undefined || payload.specialRequests !== undefined) {
      body.special_requests = payload.special_requests ?? payload.specialRequests ?? null;
    }

    const res = await apiClient.post('/customer/reservations', body);
    return normalizeReservation(res?.data?.reservation ?? null);
  },

  async getReservations(params = {}) {
    const sp = new URLSearchParams();
    if (params.tab) sp.set('tab', String(params.tab));
    if (params.status && params.status !== 'all') sp.set('status', String(params.status));
    if (params.restaurant_id ?? params.restaurantId) {
      sp.set('restaurant_id', String(params.restaurant_id ?? params.restaurantId));
    }
    if (params.search && String(params.search).trim()) {
      sp.set('search', String(params.search).trim());
    }
    if (params.date_from ?? params.dateFrom) {
      sp.set('date_from', String(params.date_from ?? params.dateFrom));
    }
    if (params.date_to ?? params.dateTo) {
      sp.set('date_to', String(params.date_to ?? params.dateTo));
    }
    if (params.sort) sp.set('sort', String(params.sort));
    if (params.page) sp.set('page', String(params.page));
    if (params.per_page ?? params.perPage) {
      sp.set('per_page', String(params.per_page ?? params.perPage));
    }

    const qs = sp.toString();
    const res = await apiClient.get(`/customer/reservations${qs ? `?${qs}` : ''}`);
    const payload = res?.data ?? {};
    const items = Array.isArray(payload.items)
      ? payload.items.map(normalizeReservation).filter(Boolean)
      : [];
    const rawSummary = payload.summary ?? {};

    return {
      items,
      reservations: items,
      pagination: payload.pagination ?? {
        current_page: 1,
        per_page: Number(params.per_page ?? params.perPage ?? 15),
        total: items.length,
        last_page: 1,
      },
      summary: {
        total: Number(rawSummary.total ?? items.length),
        upcoming: Number(rawSummary.upcoming ?? 0),
        pending: Number(rawSummary.pending ?? 0),
        completed: Number(rawSummary.completed ?? 0),
        cancelledOrDeclined: Number(rawSummary.cancelled_or_declined ?? rawSummary.cancelledOrDeclined ?? 0),
        cancelled_or_declined: Number(rawSummary.cancelled_or_declined ?? rawSummary.cancelledOrDeclined ?? 0),
      },
    };
  },

  async getReservation(id) {
    const res = await apiClient.get(`/customer/reservations/${encodeURIComponent(id)}`);
    return normalizeReservation(res?.data?.reservation ?? null);
  },

  async cancelReservation(id, reason = '') {
    const body = reason && String(reason).trim() ? { reason: String(reason).trim() } : {};
    const res = await apiClient.post(`/customer/reservations/${encodeURIComponent(id)}/cancel`, body);
    return normalizeReservation(res?.data?.reservation ?? null);
  },

  async initiateReservationDeposit(id, { paymentMethod, idempotencyKey }) {
    const res = await apiClient.post(`/customer/reservations/${encodeURIComponent(id)}/deposit/initiate`, {
      payment_method: paymentMethod,
      idempotency_key: idempotencyKey,
    });
    return res?.data?.payment ?? null;
  },

  // Favorites (Backend-connected via /api/customer/favorites*)
  getFavoriteRestaurants() {
    return [];
  },

  async fetchFavorites() {
    const res = await apiClient.get('/customer/favorites');
    const raw = Array.isArray(res?.data?.favorites) ? res.data.favorites : [];
    const favorites = raw.map((row) => ({
      id: String(row.restaurant_id),
      restaurantId: Number(row.restaurant_id),
      name: row.display_name || row.restaurant_name || 'Restaurant',
      cuisine: row.cuisine_type || 'Filipino',
      coverPhoto: row.cover_url || null,
      logoPhoto: row.logo_url || null,
      rating: row.average_rating != null ? Number(row.average_rating).toFixed(1) : null,
      reviewCount: Number(row.review_count ?? 0),
      isAvailable: Boolean(row.is_available),
      restaurantStatus: row.restaurant_status || 'active',
      cityName: row.city_name || '',
      barangayName: row.barangay_name || '',
    }));
    const favoriteIds = Array.isArray(res?.data?.favorite_ids)
      ? res.data.favorite_ids.map((id) => String(id))
      : favorites.map((f) => f.id);
    return { favorites, favoriteIds };
  },

  async addFavorite(restaurantId) {
    const res = await apiClient.put(`/customer/favorites/${encodeURIComponent(restaurantId)}`, {});
    return res?.data ?? { restaurant_id: Number(restaurantId), favorited: true };
  },

  async removeFavorite(restaurantId) {
    const res = await apiClient.delete(`/customer/favorites/${encodeURIComponent(restaurantId)}`);
    return res?.data ?? { restaurant_id: Number(restaurantId), favorited: false };
  },

  // Notifications (Category B: no customer notifications backend endpoint yet)
  getNotifications() {
    return [];
  },
};

export {
  normalizeReservationInfo,
  normalizeReservationSlot,
  normalizeReservationDayAvailability,
  normalizeReservationMonthDay,
  normalizeReservationMonthOverview,
  normalizeAvailableReservationTable,
  normalizeReservationSlotTables,
};

export default customerService;
