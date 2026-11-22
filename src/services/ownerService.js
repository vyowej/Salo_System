import apiClient from './apiClient';
import locationApiService from './locationApiService';

function notAvailable(feature) {
  throw new Error(`${feature} is not available yet. The backend API endpoint is pending implementation.`);
}

/**
 * Owner-facing service facade.
 * Category A endpoints (setup-status, location, coverage) are wired to Laravel.
 * Category B endpoints return empty lists on reads and explicit unavailable errors on writes.
 */
function normalizeRestaurantOrder(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const deliveryAddr = raw.delivery_address && typeof raw.delivery_address === 'object'
    ? raw.delivery_address.address_text
    : (raw.delivery_address_text ?? raw.delivery_address ?? null);
  const deliveryNotes = raw.delivery_address && typeof raw.delivery_address === 'object'
    ? raw.delivery_address.notes
    : (raw.delivery_notes ?? null);
  const paymentMethod = raw.payment?.method ?? raw.payment_method ?? 'cod';
  const paymentStatus = raw.payment?.status ?? raw.payment_status ?? 'pending';
  const paidAt = raw.payment?.paid_at ?? raw.paid_at ?? null;

  return {
    id: raw.order_id ?? raw.id,
    orderReference: raw.order_reference ?? null,
    restaurantId: raw.restaurant_id ?? null,
    fulfillment: raw.fulfillment ?? 'delivery',
    status: String(raw.order_status ?? raw.status ?? 'pending').toLowerCase(),
    customerName: raw.customer_name ?? 'Customer',
    customerPhone: raw.customer_phone ?? null,
    deliveryAddress: deliveryAddr,
    deliveryRecipientName: raw.delivery_address?.recipient_name ?? null,
    deliveryInstructions: deliveryNotes,
    subtotal: Number(raw.subtotal_amount ?? raw.subtotal ?? 0),
    deliveryFee: Number(raw.delivery_fee ?? 0),
    total: Number(raw.total_amount ?? raw.total ?? 0),
    paymentMethod,
    paymentStatus,
    paidAt,
    rejectionReason: raw.rejection_reason ?? null,
    acceptedAt: raw.accepted_at ?? null,
    deliveredAt: raw.delivered_at ?? null,
    completedAt: raw.completed_at ?? null,
    cancelledAt: raw.cancelled_at ?? null,
    cancelledBy: raw.cancelled_by ?? null,
    cancellationReason: raw.cancellation_reason ?? null,
    rejectedAt: raw.rejected_at ?? null,
    createdAt: raw.placed_at ?? raw.created_at ?? null,
    riderFirstName: raw.rider?.first_name ?? null,
    items: Array.isArray(raw.items)
      ? raw.items.map((item) => ({
          id: item.order_item_id ?? item.menu_item_id ?? item.id,
          menuItemId: item.menu_item_id ?? null,
          name: item.item_name ?? item.name ?? 'Menu Item',
          price: Number(item.unit_price ?? item.price ?? 0),
          quantity: Number(item.quantity ?? item.qty ?? 0),
          lineTotal: Number(item.line_total ?? 0),
        }))
      : [],
  };
}

export function normalizeTable(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const isActive = raw.is_active !== undefined ? Boolean(raw.is_active) : Boolean(raw.isActive ?? true);
  const rawStatus = String(raw.table_status ?? raw.status ?? (isActive ? 'available' : 'archived')).toLowerCase();
  const capacity = Number(raw.seating_capacity ?? raw.capacity ?? 0);
  const minPartySize = Number(raw.min_party_size ?? raw.minPartySize ?? 1);
  const nextResRaw = raw.next_reservation ?? raw.nextReservation ?? null;

  const nextReservation = nextResRaw && typeof nextResRaw === 'object'
    ? {
        id: nextResRaw.reservation_id ?? nextResRaw.id ?? null,
        reservationId: nextResRaw.reservation_id ?? nextResRaw.reservationId ?? nextResRaw.id ?? null,
        reservationReference: nextResRaw.reservation_reference ?? nextResRaw.reservationReference ?? null,
        reservationStart: nextResRaw.reservation_start ?? nextResRaw.reservationStart ?? null,
        numberOfGuests: Number(nextResRaw.number_of_guests ?? nextResRaw.numberOfGuests ?? 0),
        status: String(nextResRaw.status ?? 'pending').toLowerCase(),
      }
    : null;

  return {
    id: raw.table_id ?? raw.id ?? null,
    tableId: raw.table_id ?? raw.tableId ?? raw.id ?? null,
    restaurantId: raw.restaurant_id ?? raw.restaurantId ?? null,
    tableName: String(raw.table_name ?? raw.tableName ?? ''),
    capacity,
    seatingCapacity: capacity,
    minPartySize,
    diningArea: raw.dining_area ?? raw.diningArea ?? null,
    description: raw.description ?? null,
    isActive,
    status: rawStatus,
    tableStatus: rawStatus,
    reservationsCount: Number(raw.reservations_count ?? raw.reservationsCount ?? 0),
    nextReservation,
    upcomingReservationsCount: Number(raw.upcoming_reservations_count ?? raw.upcomingReservationsCount ?? 0),
    createdAt: raw.created_at ?? raw.createdAt ?? null,
    updatedAt: raw.updated_at ?? raw.updatedAt ?? null,
  };
}

const OWNER_RESERVATION_STATUS_LABELS = {
  pending: 'Pending',
  approved: 'Approved',
  awaiting_payment: 'Awaiting Deposit',
  confirmed: 'Confirmed',
  arrived: 'Arrived',
  seated: 'Seated',
  completed: 'Completed',
  cancelled: 'Cancelled',
  no_show: 'No-Show',
  rejected: 'Rejected',
  expired: 'Expired',
};

export function normalizeOwnerReservation(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const reservationId = Number(raw.reservation_id ?? raw.reservationId ?? raw.id ?? 0);
  const reference = raw.reservation_reference ?? raw.reference ?? (reservationId ? `SALO-RES-${reservationId}` : '');
  const rawStatus = String(raw.reservation_status ?? raw.status ?? 'pending').toLowerCase();
  const statusLabel = raw.status_label ?? OWNER_RESERVATION_STATUS_LABELS[rawStatus] ?? 'Pending';

  const tableObj = raw.table && typeof raw.table === 'object' ? raw.table : null;
  const tableId = raw.table_id ?? tableObj?.table_id ?? raw.tableId ?? null;
  const tableName = tableObj?.table_name ?? raw.table_name ?? raw.tableName ?? null;
  const diningArea = tableObj?.dining_area ?? raw.dining_area ?? raw.diningArea ?? null;

  const startIso = raw.reservation_start ?? raw.reservationStart ?? null;
  const endIso = raw.reservation_end ?? raw.reservationEnd ?? null;
  const dateStr = raw.reservation_date ?? raw.date ?? (startIso ? String(startIso).slice(0, 10) : '');
  const timeStr = raw.reservation_time ?? raw.time ?? (startIso ? String(startIso).slice(11, 16) : '');
  const partySize = Number(raw.number_of_guests ?? raw.party_size ?? raw.partySize ?? 0);

  const guestHistoryRaw = raw.guest_history ?? raw.guestHistory ?? {};
  const historyRaw = raw.status_history ?? raw.statusHistory ?? [];

  return {
    id: reservationId,
    reservationId,
    reference,
    reservationReference: reference,
    restaurantId: Number(raw.restaurant_id ?? raw.restaurantId ?? 0),
    restaurantName: raw.restaurant_name ?? raw.restaurantName ?? '',
    customerId: Number(raw.customer_id ?? raw.customerId ?? 0),
    guestName: raw.contact_name ?? raw.contactName ?? raw.customer?.contact_name ?? 'Guest',
    contactName: raw.contact_name ?? raw.contactName ?? raw.customer?.contact_name ?? 'Guest',
    guestPhone: raw.contact_phone ?? raw.contactPhone ?? raw.customer?.contact_phone ?? null,
    contactPhone: raw.contact_phone ?? raw.contactPhone ?? raw.customer?.contact_phone ?? null,
    customerEmail: raw.customer_email ?? raw.customerEmail ?? raw.customer?.email ?? null,
    tableId: tableId !== null ? Number(tableId) : null,
    tableName,
    diningArea,
    table: tableId !== null
      ? {
          tableId: Number(tableId),
          id: Number(tableId),
          tableName: tableName || `#${tableId}`,
          diningArea,
          seatingCapacity: Number(tableObj?.seating_capacity ?? 0),
          minPartySize: Number(tableObj?.min_party_size ?? 1),
        }
      : null,
    reservationStart: startIso,
    reservationEnd: endIso,
    date: dateStr,
    time: timeStr,
    durationMinutes: Number(raw.duration_minutes ?? raw.durationMinutes ?? 90),
    partySize,
    numberOfGuests: partySize,
    statusCode: rawStatus,
    status: statusLabel,
    statusLabel,
    specialRequests: raw.special_requests ?? raw.specialRequests ?? null,
    depositAmount: Number(raw.deposit_amount ?? raw.depositAmount ?? 0),
    depositStatus: String(raw.deposit_status ?? raw.depositStatus ?? 'none').toLowerCase(),
    serviceFee: Number(raw.service_fee ?? raw.serviceFee ?? 0),
    isFeeRefundable: Boolean(raw.is_fee_refundable ?? raw.isFeeRefundable ?? true),
    cancellationFee: Number(raw.cancellation_fee ?? raw.cancellationFee ?? 0),
    cancelledBy: raw.cancelled_by ?? raw.cancelledBy ?? null,
    cancelledAt: raw.cancelled_at ?? raw.cancelledAt ?? null,
    cancellationReason: raw.cancellation_reason ?? raw.cancellationReason ?? null,
    rejectionReason: raw.rejection_reason ?? raw.rejectionReason ?? null,
    rejectedAt: raw.rejected_at ?? raw.rejectedAt ?? null,
    approvedAt: raw.approved_at ?? raw.approvedAt ?? null,
    confirmedAt: raw.confirmed_at ?? raw.confirmedAt ?? null,
    arrivedAt: raw.arrived_at ?? raw.arrivedAt ?? null,
    seatedAt: raw.seated_at ?? raw.seatedAt ?? null,
    completedAt: raw.completed_at ?? raw.completedAt ?? null,
    expiredAt: raw.expired_at ?? raw.expiredAt ?? null,
    noShowMarkedAt: raw.no_show_marked_at ?? raw.noShowMarkedAt ?? null,
    noShowMarkedBy: raw.no_show_marked_by ?? raw.noShowMarkedBy ?? null,
    createdAt: raw.created_at ?? raw.createdAt ?? null,
    updatedAt: raw.updated_at ?? raw.updatedAt ?? null,
    guestHistory: {
      visits: Number(guestHistoryRaw.visits ?? 0),
      noShows: Number(guestHistoryRaw.no_shows ?? guestHistoryRaw.noShows ?? 0),
      cancellations: Number(guestHistoryRaw.cancellations ?? 0),
    },
    allowedActions: Array.isArray(raw.allowed_actions ?? raw.allowedActions)
      ? (raw.allowed_actions ?? raw.allowedActions)
      : [],
    attention: raw.attention ?? null,
    restaurantSettings: raw.restaurant_settings ?? raw.restaurantSettings ?? null,
    statusHistory: Array.isArray(historyRaw)
      ? historyRaw.map((entry) => ({
          historyId: Number(entry.history_id ?? entry.historyId ?? 0),
          fromStatus: entry.from_status ?? entry.fromStatus ?? null,
          toStatus: entry.to_status ?? entry.toStatus ?? '',
          toStatusLabel:
            OWNER_RESERVATION_STATUS_LABELS[String(entry.to_status ?? entry.toStatus ?? '').toLowerCase()] ||
            String(entry.to_status ?? entry.toStatus ?? ''),
          changedByUserId: entry.changed_by_user_id ?? entry.changedByUserId ?? null,
          changedByRole: entry.changed_by_role ?? entry.changedByRole ?? 'system',
          note: entry.note ?? null,
          createdAt: entry.created_at ?? entry.createdAt ?? null,
        }))
      : [],
  };
}

export const ownerService = {
  async getSetupStatus(restaurantId) {
    const query = restaurantId ? `?restaurant_id=${encodeURIComponent(restaurantId)}` : '';
    const res = await apiClient.get(`/restaurant/setup-status${query}`);
    return res?.data ?? null;
  },

  async getLocation() {
    return locationApiService.getRestaurantLocation();
  },

  async updateLocation(payload) {
    return locationApiService.updateRestaurantLocation(payload);
  },

  async updateCoverage(payload) {
    return locationApiService.updateRestaurantCoverage(payload);
  },

  async getProfile(restaurantId) {
    const query = restaurantId ? `?restaurant_id=${encodeURIComponent(restaurantId)}` : '';
    const res = await apiClient.get(`/restaurant/profile${query}`);
    return res?.data?.profile ?? null;
  },

  async updateProfile(restaurantId, payload) {
    const res = await apiClient.patch('/restaurant/profile', {
      ...(restaurantId ? { restaurant_id: restaurantId } : {}),
      ...payload,
    });
    return res?.data?.profile ?? null;
  },

  async updateBranding(restaurantId, { logoFile = null, coverFile = null, removeLogo = false, removeCover = false }) {
    const fd = new FormData();
    if (restaurantId) fd.append('restaurant_id', String(restaurantId));
    if (logoFile) fd.append('logo_image', logoFile);
    if (coverFile) fd.append('cover_image', coverFile);
    if (removeLogo) fd.append('remove_logo', '1');
    if (removeCover) fd.append('remove_cover', '1');
    const res = await apiClient.post('/restaurant/profile/media', fd);
    return res?.data?.profile ?? null;
  },

  async updateAcceptingStatus(restaurantId, payload) {
    const res = await apiClient.patch('/restaurant/accepting-status', {
      ...(restaurantId ? { restaurant_id: restaurantId } : {}),
      ...payload,
    });
    return res?.data?.profile ?? null;
  },

  async getOperatingHours(restaurantId) {
    const query = restaurantId ? `?restaurant_id=${encodeURIComponent(restaurantId)}` : '';
    const res = await apiClient.get(`/restaurant/operating-hours${query}`);
    return res?.data?.operating_hours ?? [];
  },

  async updateOperatingHours(restaurantId, operatingHours) {
    const res = await apiClient.put('/restaurant/operating-hours', {
      ...(restaurantId ? { restaurant_id: restaurantId } : {}),
      operating_hours: operatingHours,
    });
    return res?.data?.operating_hours ?? [];
  },

  async fetchMenuCategories(restaurantId) {
    const query = restaurantId ? `?restaurant_id=${encodeURIComponent(restaurantId)}` : '';
    const res = await apiClient.get(`/restaurant/menu/categories${query}`);
    return res?.data?.categories ?? [];
  },

  async createMenuCategory(restaurantId, payload) {
    const res = await apiClient.post('/restaurant/menu/categories', {
      ...(restaurantId ? { restaurant_id: restaurantId } : {}),
      ...payload,
    });
    return res?.data?.category ?? null;
  },

  async updateMenuCategory(restaurantId, categoryId, payload) {
    const res = await apiClient.patch(`/restaurant/menu/categories/${categoryId}`, {
      ...(restaurantId ? { restaurant_id: restaurantId } : {}),
      ...payload,
    });
    return res?.data?.category ?? null;
  },

  async reorderMenuCategories(restaurantId, orderedIds) {
    const res = await apiClient.put('/restaurant/menu/categories/reorder', {
      ...(restaurantId ? { restaurant_id: restaurantId } : {}),
      ordered_ids: orderedIds,
    });
    return res?.data?.categories ?? [];
  },

  async deleteMenuCategory(restaurantId, categoryId) {
    const query = restaurantId ? `?restaurant_id=${encodeURIComponent(restaurantId)}` : '';
    await apiClient.delete(`/restaurant/menu/categories/${categoryId}${query}`);
  },

  async fetchMenuItems(restaurantId) {
    const query = restaurantId ? `?restaurant_id=${encodeURIComponent(restaurantId)}` : '';
    const res = await apiClient.get(`/restaurant/menu/items${query}`);
    return res?.data?.items ?? [];
  },

  async createMenuItem(restaurantId, payload, photoFile = null) {
    const fd = new FormData();
    if (restaurantId) fd.append('restaurant_id', String(restaurantId));
    fd.append('menu_category_id', String(payload.menu_category_id));
    fd.append('item_name', payload.item_name || '');
    if (payload.description) fd.append('description', payload.description);
    fd.append('base_price', String(payload.base_price));
    if (payload.availability_status) fd.append('availability_status', payload.availability_status);
    if (photoFile) fd.append('photo', photoFile);
    const res = await apiClient.post('/restaurant/menu/items', fd);
    return res?.data?.item ?? null;
  },

  async updateMenuItemApi(restaurantId, itemId, payload, photoFile = null, removePhoto = false) {
    const fd = new FormData();
    if (restaurantId) fd.append('restaurant_id', String(restaurantId));
    if (payload.menu_category_id !== undefined) fd.append('menu_category_id', String(payload.menu_category_id));
    if (payload.item_name !== undefined) fd.append('item_name', payload.item_name);
    if (payload.description !== undefined) fd.append('description', payload.description || '');
    if (payload.base_price !== undefined) fd.append('base_price', String(payload.base_price));
    if (payload.availability_status !== undefined) fd.append('availability_status', payload.availability_status);
    if (photoFile) fd.append('photo', photoFile);
    if (removePhoto) fd.append('remove_photo', '1');
    const res = await apiClient.post(`/restaurant/menu/items/${itemId}`, fd);
    return res?.data?.item ?? null;
  },

  async updateMenuItemAvailability(restaurantId, itemId, availabilityStatus) {
    const res = await apiClient.patch(`/restaurant/menu/items/${itemId}/availability`, {
      ...(restaurantId ? { restaurant_id: restaurantId } : {}),
      availability_status: availabilityStatus,
    });
    return res?.data?.item ?? null;
  },

  async deleteMenuItemApi(restaurantId, itemId) {
    const query = restaurantId ? `?restaurant_id=${encodeURIComponent(restaurantId)}` : '';
    await apiClient.delete(`/restaurant/menu/items/${itemId}${query}`);
  },

  async restoreMenuItem(restaurantId, itemId) {
    const res = await apiClient.post(`/restaurant/menu/items/${itemId}/restore`, {
      ...(restaurantId ? { restaurant_id: restaurantId } : {}),
    });
    return res?.data?.item ?? null;
  },

  async restoreMenuCategory(restaurantId, categoryId) {
    const res = await apiClient.post(`/restaurant/menu/categories/${categoryId}/restore`, {
      ...(restaurantId ? { restaurant_id: restaurantId } : {}),
    });
    return res?.data?.category ?? null;
  },

  async getMenuPublishStatus(restaurantId) {
    const query = restaurantId ? `?restaurant_id=${encodeURIComponent(restaurantId)}` : '';
    const res = await apiClient.get(`/restaurant/menu/publish-status${query}`);
    return res?.data?.publish_status ?? null;
  },

  async getMenuPreview(restaurantId) {
    const query = restaurantId ? `?restaurant_id=${encodeURIComponent(restaurantId)}` : '';
    const res = await apiClient.get(`/restaurant/menu/preview${query}`);
    return res?.data ?? null;
  },

  async publishMenu(restaurantId) {
    const res = await apiClient.post('/restaurant/menu/publish', {
      ...(restaurantId ? { restaurant_id: restaurantId } : {}),
    });
    return res?.data ?? null;
  },

  async unpublishRestaurant(restaurantId, reason = '') {
    const res = await apiClient.post('/restaurant/menu/unpublish', {
      ...(restaurantId ? { restaurant_id: restaurantId } : {}),
      ...(reason ? { reason } : {}),
    });
    return res?.data?.publish_status ?? null;
  },

  async discardMenuChanges(restaurantId) {
    const res = await apiClient.post('/restaurant/menu/discard-changes', {
      ...(restaurantId ? { restaurant_id: restaurantId } : {}),
    });
    return res?.data?.publish_status ?? null;
  },

  getRestaurant() {
    return null;
  },

  updateRestaurant() {
    notAvailable('Updating restaurant profile');
  },

  updateBusinessProfile() {
    notAvailable('Updating business profile');
  },

  getMenuItems() {
    return [];
  },

  getMenuCategories() {
    return [];
  },

  saveMenuCategories() {
    notAvailable('Saving menu categories');
  },

  addMenuItem() {
    notAvailable('Adding menu items');
  },

  updateMenuItem() {
    notAvailable('Updating menu items');
  },

  deleteMenuItem() {
    notAvailable('Deleting menu items');
  },

  removeImage() {
    return undefined;
  },

  async fetchRestaurantOrders({ status = '', page = 1, perPage = 15, restaurantId = null } = {}) {
    const params = new URLSearchParams();
    if (status && status !== 'all' && status !== 'action') {
      params.set('status', status);
    }
    if (page) params.set('page', String(page));
    if (perPage) params.set('per_page', String(perPage));
    if (restaurantId) params.set('restaurant_id', String(restaurantId));
    const qs = params.toString();
    const res = await apiClient.get(`/restaurant/orders${qs ? `?${qs}` : ''}`);
    const payload = res?.data ?? {};
    return {
      orders: Array.isArray(payload.orders) ? payload.orders.map(normalizeRestaurantOrder).filter(Boolean) : [],
      pagination: payload.pagination ?? { current_page: 1, last_page: 1, per_page: perPage, total: 0 },
    };
  },

  async fetchRestaurantOrderDetail(orderId, restaurantId = null) {
    const qs = restaurantId ? `?restaurant_id=${encodeURIComponent(restaurantId)}` : '';
    const res = await apiClient.get(`/restaurant/orders/${encodeURIComponent(orderId)}${qs}`);
    return normalizeRestaurantOrder(res?.data?.order ?? null);
  },

  async acceptOrder(orderId, restaurantId = null) {
    const qs = restaurantId ? `?restaurant_id=${encodeURIComponent(restaurantId)}` : '';
    const res = await apiClient.post(`/restaurant/orders/${encodeURIComponent(orderId)}/accept${qs}`, {});
    return normalizeRestaurantOrder(res?.data?.order ?? null);
  },

  async rejectOrder(orderId, reason, restaurantId = null) {
    const qs = restaurantId ? `?restaurant_id=${encodeURIComponent(restaurantId)}` : '';
    const res = await apiClient.post(`/restaurant/orders/${encodeURIComponent(orderId)}/reject${qs}`, { reason });
    return normalizeRestaurantOrder(res?.data?.order ?? null);
  },

  async prepareOrder(orderId, restaurantId = null) {
    const qs = restaurantId ? `?restaurant_id=${encodeURIComponent(restaurantId)}` : '';
    const res = await apiClient.post(`/restaurant/orders/${encodeURIComponent(orderId)}/prepare${qs}`, {});
    return normalizeRestaurantOrder(res?.data?.order ?? null);
  },

  async readyOrder(orderId, restaurantId = null) {
    const qs = restaurantId ? `?restaurant_id=${encodeURIComponent(restaurantId)}` : '';
    const res = await apiClient.post(`/restaurant/orders/${encodeURIComponent(orderId)}/ready${qs}`, {});
    return normalizeRestaurantOrder(res?.data?.order ?? null);
  },

  async completeOrder(orderId, restaurantId = null) {
    const qs = restaurantId ? `?restaurant_id=${encodeURIComponent(restaurantId)}` : '';
    const res = await apiClient.post(`/restaurant/orders/${encodeURIComponent(orderId)}/complete${qs}`, {});
    return normalizeRestaurantOrder(res?.data?.order ?? null);
  },

  resolveOrderCancellation() {
    notAvailable('Resolving order cancellation');
  },

  async getReservations(restaurantId = null, params = {}) {
    let resolvedRestaurantId = restaurantId;
    let resolvedParams = params || {};
    if (restaurantId && typeof restaurantId === 'object') {
      resolvedParams = restaurantId;
      resolvedRestaurantId = restaurantId.restaurantId ?? restaurantId.restaurant_id ?? null;
    }

    const sp = new URLSearchParams();
    if (resolvedRestaurantId) sp.set('restaurant_id', String(resolvedRestaurantId));
    if (resolvedParams.date) sp.set('date', String(resolvedParams.date));
    if (resolvedParams.dateFrom ?? resolvedParams.date_from) {
      sp.set('date_from', String(resolvedParams.dateFrom ?? resolvedParams.date_from));
    }
    if (resolvedParams.dateTo ?? resolvedParams.date_to) {
      sp.set('date_to', String(resolvedParams.dateTo ?? resolvedParams.date_to));
    }
    if (resolvedParams.status && resolvedParams.status !== 'all') {
      sp.set('status', String(resolvedParams.status));
    }
    if (resolvedParams.group && resolvedParams.group !== 'all') {
      sp.set('group', String(resolvedParams.group));
    }
    if (resolvedParams.tableId ?? resolvedParams.table_id) {
      sp.set('table_id', String(resolvedParams.tableId ?? resolvedParams.table_id));
    }
    const areaVal = resolvedParams.diningArea ?? resolvedParams.dining_area ?? '';
    if (areaVal && areaVal !== 'all') {
      sp.set('dining_area', String(areaVal));
    }
    if (resolvedParams.search && String(resolvedParams.search).trim()) {
      sp.set('search', String(resolvedParams.search).trim());
    }
    if (resolvedParams.sort) sp.set('sort', String(resolvedParams.sort));
    if (resolvedParams.page) sp.set('page', String(resolvedParams.page));
    if (resolvedParams.perPage ?? resolvedParams.per_page) {
      sp.set('per_page', String(resolvedParams.perPage ?? resolvedParams.per_page));
    }

    const qs = sp.toString();
    const res = await apiClient.get(`/restaurant/reservations${qs ? `?${qs}` : ''}`);
    const payload = res?.data ?? {};
    const items = Array.isArray(payload.items)
      ? payload.items.map(normalizeOwnerReservation).filter(Boolean)
      : [];
    const rawSummary = payload.summary ?? {};

    return {
      items,
      reservations: items,
      pagination: payload.pagination ?? {
        current_page: 1,
        per_page: Number(resolvedParams.perPage ?? resolvedParams.per_page ?? 20),
        total: items.length,
        last_page: 1,
      },
      summary: {
        total: Number(rawSummary.total ?? items.length),
        pending: Number(rawSummary.pending ?? 0),
        confirmed: Number(rawSummary.confirmed ?? 0),
        awaitingPayment: Number(rawSummary.awaiting_payment ?? 0),
        inHouse: Number(rawSummary.in_house ?? 0),
        completed: Number(rawSummary.completed ?? 0),
        cancelledOrMissed: Number(rawSummary.cancelled_or_missed ?? 0),
        expectedCovers: Number(rawSummary.expected_covers ?? 0),
        pendingTotalUpcoming: Number(rawSummary.pending_total_upcoming ?? rawSummary.pending ?? 0),
        pending_total_upcoming: Number(rawSummary.pending_total_upcoming ?? rawSummary.pending ?? 0),
      },
    };
  },

  async getReservationCalendar(restaurantId = null, month = '') {
    const sp = new URLSearchParams();
    if (restaurantId) sp.set('restaurant_id', String(restaurantId));
    if (month) sp.set('month', String(month));
    const qs = sp.toString();
    const res = await apiClient.get(`/restaurant/reservations/calendar${qs ? `?${qs}` : ''}`);
    const payload = res?.data ?? {};

    return {
      restaurantId: Number(payload.restaurant_id ?? restaurantId ?? 0),
      month: payload.month ?? month,
      days: Array.isArray(payload.days)
        ? payload.days.map((d) => ({
            date: d.date,
            total: Number(d.total ?? 0),
            pending: Number(d.pending ?? 0),
            confirmed: Number(d.confirmed ?? 0),
            inHouse: Number(d.in_house ?? 0),
            completed: Number(d.completed ?? 0),
            cancelledOrMissed: Number(d.cancelled_or_missed ?? 0),
            covers: Number(d.covers ?? 0),
          }))
        : [],
    };
  },

  async getReservation(restaurantId, id) {
    const qs = restaurantId ? `?restaurant_id=${encodeURIComponent(restaurantId)}` : '';
    const res = await apiClient.get(`/restaurant/reservations/${encodeURIComponent(id)}${qs}`);
    return normalizeOwnerReservation(res?.data?.reservation ?? null);
  },

  getReservationTables() {
    return [];
  },

  getReservationTableOptions() {
    return [];
  },

  getDiningAreas() {
    return [];
  },

  addDiningArea() {
    notAvailable('Adding dining areas');
  },

  updateDiningArea() {
    notAvailable('Updating dining areas');
  },

  async getTables(restaurantId = null, dateKey = '', filters = {}) {
    let resolvedRestaurantId = restaurantId;
    let resolvedDate = dateKey;
    let resolvedFilters = filters || {};

    if (restaurantId && typeof restaurantId === 'object') {
      resolvedFilters = restaurantId;
      resolvedRestaurantId = restaurantId.restaurantId ?? restaurantId.restaurant_id ?? null;
      resolvedDate = restaurantId.date ?? restaurantId.dateKey ?? '';
    } else if (dateKey && typeof dateKey === 'object') {
      resolvedFilters = dateKey;
      resolvedDate = dateKey.date ?? dateKey.dateKey ?? '';
    }

    const params = new URLSearchParams();
    if (resolvedRestaurantId) {
      params.set('restaurant_id', String(resolvedRestaurantId));
    }
    const targetDate = resolvedFilters.date || resolvedDate;
    if (targetDate) {
      params.set('date', String(targetDate));
    }
    if (resolvedFilters.search && String(resolvedFilters.search).trim()) {
      params.set('search', String(resolvedFilters.search).trim());
    }
    const targetArea = resolvedFilters.dining_area ?? resolvedFilters.diningArea ?? '';
    if (targetArea && targetArea !== 'all') {
      params.set('dining_area', String(targetArea).trim());
    }
    const targetStatus = resolvedFilters.status ?? '';
    if (targetStatus) {
      params.set('status', String(targetStatus).toLowerCase());
    }

    const qs = params.toString();
    const res = await apiClient.get(`/restaurant/tables${qs ? `?${qs}` : ''}`);
    const payload = res?.data ?? {};
    const items = Array.isArray(payload.items)
      ? payload.items.map(normalizeTable).filter(Boolean)
      : [];
    const rawSummary = payload.summary ?? {};
    const diningAreas = Array.isArray(payload.dining_areas)
      ? payload.dining_areas.filter((area) => typeof area === 'string' && area.trim() !== '')
      : [];

    return {
      items,
      tables: items,
      summary: {
        totalTables: Number(rawSummary.total_tables ?? items.length),
        activeTables: Number(rawSummary.active_tables ?? 0),
        archivedTables: Number(rawSummary.archived_tables ?? 0),
        totalSeats: Number(rawSummary.total_seats ?? 0),
        availableNow: Number(rawSummary.available_now ?? 0),
        reservedCount: Number(rawSummary.reserved_count ?? 0),
        occupiedCount: Number(rawSummary.occupied_count ?? 0),
        total_tables: Number(rawSummary.total_tables ?? items.length),
        active_tables: Number(rawSummary.active_tables ?? 0),
        archived_tables: Number(rawSummary.archived_tables ?? 0),
        total_seats: Number(rawSummary.total_seats ?? 0),
        available_now: Number(rawSummary.available_now ?? 0),
        reserved_count: Number(rawSummary.reserved_count ?? 0),
        occupied_count: Number(rawSummary.occupied_count ?? 0),
      },
      diningAreas,
      dining_areas: diningAreas,
    };
  },

  async getTable(restaurantId, tableId, dateKey = '') {
    const params = new URLSearchParams();
    if (restaurantId) params.set('restaurant_id', String(restaurantId));
    if (dateKey) params.set('date', String(dateKey));
    const qs = params.toString();
    const res = await apiClient.get(`/restaurant/tables/${encodeURIComponent(tableId)}${qs ? `?${qs}` : ''}`);
    return normalizeTable(res?.data?.table ?? null);
  },

  getTableSchedule() {
    return [];
  },

  async addTable(restaurantId, payload = {}) {
    const body = {
      ...(restaurantId ? { restaurant_id: restaurantId } : {}),
      table_name: payload.table_name ?? payload.tableName ?? '',
      seating_capacity: Number(payload.seating_capacity ?? payload.seatingCapacity ?? payload.capacity ?? 0),
      min_party_size:
        payload.min_party_size !== undefined || payload.minPartySize !== undefined
          ? Number(payload.min_party_size ?? payload.minPartySize)
          : 1,
      dining_area: payload.dining_area ?? payload.diningArea ?? null,
      description: payload.description ?? null,
    };
    const res = await apiClient.post('/restaurant/tables', body);
    return normalizeTable(res?.data?.table ?? null);
  },

  async updateTable(restaurantId, tableId, payload = {}) {
    const body = {
      ...(restaurantId ? { restaurant_id: restaurantId } : {}),
    };
    if (payload.table_name !== undefined || payload.tableName !== undefined) {
      body.table_name = payload.table_name ?? payload.tableName;
    }
    if (
      payload.seating_capacity !== undefined ||
      payload.seatingCapacity !== undefined ||
      payload.capacity !== undefined
    ) {
      body.seating_capacity = Number(payload.seating_capacity ?? payload.seatingCapacity ?? payload.capacity);
    }
    if (payload.min_party_size !== undefined || payload.minPartySize !== undefined) {
      body.min_party_size = Number(payload.min_party_size ?? payload.minPartySize);
    }
    if (payload.dining_area !== undefined || payload.diningArea !== undefined) {
      body.dining_area = payload.dining_area ?? payload.diningArea;
    }
    if (payload.description !== undefined) {
      body.description = payload.description;
    }
    const res = await apiClient.patch(`/restaurant/tables/${encodeURIComponent(tableId)}`, body);
    return normalizeTable(res?.data?.table ?? null);
  },

  async archiveTable(restaurantId, tableId) {
    const body = restaurantId ? { restaurant_id: restaurantId } : {};
    const res = await apiClient.post(`/restaurant/tables/${encodeURIComponent(tableId)}/archive`, body);
    return normalizeTable(res?.data?.table ?? null);
  },

  async reactivateTable(restaurantId, tableId) {
    const body = restaurantId ? { restaurant_id: restaurantId } : {};
    const res = await apiClient.post(`/restaurant/tables/${encodeURIComponent(tableId)}/reactivate`, body);
    return normalizeTable(res?.data?.table ?? null);
  },

  async approveReservation(restaurantId, id, note = null) {
    const body = {
      ...(restaurantId ? { restaurant_id: restaurantId } : {}),
      ...(note ? { note } : {}),
    };
    const res = await apiClient.post(`/restaurant/reservations/${encodeURIComponent(id)}/approve`, body);
    return normalizeOwnerReservation(res?.data?.reservation ?? null);
  },

  async rejectReservation(restaurantId, id, reason) {
    const body = {
      ...(restaurantId ? { restaurant_id: restaurantId } : {}),
      reason,
    };
    const res = await apiClient.post(`/restaurant/reservations/${encodeURIComponent(id)}/reject`, body);
    return normalizeOwnerReservation(res?.data?.reservation ?? null);
  },

  async confirmReservationDeposit(restaurantId, id, note = null) {
    const body = {
      ...(restaurantId ? { restaurant_id: restaurantId } : {}),
      ...(note ? { note } : {}),
    };
    const res = await apiClient.post(`/restaurant/reservations/${encodeURIComponent(id)}/confirm-deposit`, body);
    return normalizeOwnerReservation(res?.data?.reservation ?? null);
  },

  async markReservationArrived(restaurantId, id, note = null) {
    const body = {
      ...(restaurantId ? { restaurant_id: restaurantId } : {}),
      ...(note ? { note } : {}),
    };
    const res = await apiClient.post(`/restaurant/reservations/${encodeURIComponent(id)}/arrived`, body);
    return normalizeOwnerReservation(res?.data?.reservation ?? null);
  },

  async seatReservation(restaurantId, id, tableId = null, note = null) {
    const body = {
      ...(restaurantId ? { restaurant_id: restaurantId } : {}),
      ...(tableId ? { table_id: Number(tableId) } : {}),
      ...(note ? { note } : {}),
    };
    const res = await apiClient.post(`/restaurant/reservations/${encodeURIComponent(id)}/seat`, body);
    return normalizeOwnerReservation(res?.data?.reservation ?? null);
  },

  async completeReservation(restaurantId, id, note = null) {
    const body = {
      ...(restaurantId ? { restaurant_id: restaurantId } : {}),
      ...(note ? { note } : {}),
    };
    const res = await apiClient.post(`/restaurant/reservations/${encodeURIComponent(id)}/complete`, body);
    return normalizeOwnerReservation(res?.data?.reservation ?? null);
  },

  async markReservationNoShow(restaurantId, id, note = null) {
    const body = {
      ...(restaurantId ? { restaurant_id: restaurantId } : {}),
      ...(note ? { note } : {}),
    };
    const res = await apiClient.post(`/restaurant/reservations/${encodeURIComponent(id)}/no-show`, body);
    return normalizeOwnerReservation(res?.data?.reservation ?? null);
  },

  async cancelReservation(restaurantId, id, reason) {
    const body = {
      ...(restaurantId ? { restaurant_id: restaurantId } : {}),
      reason,
    };
    const res = await apiClient.post(`/restaurant/reservations/${encodeURIComponent(id)}/cancel`, body);
    return normalizeOwnerReservation(res?.data?.reservation ?? null);
  },

  async assignReservationTable(restaurantId, id, tableId) {
    const body = {
      ...(restaurantId ? { restaurant_id: restaurantId } : {}),
      table_id: Number(tableId),
    };
    const res = await apiClient.patch(`/restaurant/reservations/${encodeURIComponent(id)}/table`, body);
    return normalizeOwnerReservation(res?.data?.reservation ?? null);
  },

  async updateReservationStatus(restaurantId, id, status, payload = {}) {
    const normalized = String(status || '').trim().toLowerCase();
    switch (normalized) {
      case 'approve':
      case 'approved':
      case 'confirmed':
        return this.approveReservation(restaurantId, id, payload.note ?? null);
      case 'reject':
      case 'rejected':
        return this.rejectReservation(restaurantId, id, payload.reason ?? '');
      case 'confirm_deposit':
      case 'deposit_paid':
        return this.confirmReservationDeposit(restaurantId, id, payload.note ?? null);
      case 'arrived':
        return this.markReservationArrived(restaurantId, id, payload.note ?? null);
      case 'seat':
      case 'seated':
        return this.seatReservation(restaurantId, id, payload.tableId ?? payload.table_id ?? null, payload.note ?? null);
      case 'complete':
      case 'completed':
        return this.completeReservation(restaurantId, id, payload.note ?? null);
      case 'no_show':
      case 'no-show':
        return this.markReservationNoShow(restaurantId, id, payload.note ?? null);
      case 'cancel':
      case 'cancelled':
        return this.cancelReservation(restaurantId, id, payload.reason ?? '');
      default:
        throw new Error(`Unsupported reservation status transition: ${status}`);
    }
  },

  recordReservationPayment() {
    notAvailable('Recording reservation payment');
  },

  resolveReservationCancellation() {
    notAvailable('Resolving reservation cancellation');
  },

  getInventoryItems() {
    return [];
  },

  getInventoryMovements() {
    return [];
  },

  async getInventoryConfig(restaurantId) {
    const query = restaurantId ? `?restaurant_id=${encodeURIComponent(restaurantId)}` : '';
    const res = await apiClient.get(`/restaurant/inventory/config${query}`);
    const config = res?.data?.config;
    if (!config || typeof config.deduction_mode !== 'string' || !config.deduction_mode) {
      throw new Error('Invalid inventory configuration response from server.');
    }
    return {
      restaurantId: config.restaurant_id ?? restaurantId ?? null,
      deductionMode: config.deduction_mode,
    };
  },

  async updateInventoryConfig(restaurantId, payload = {}) {
    const deductionMode = payload?.deductionMode ?? payload?.deduction_mode;
    const res = await apiClient.patch('/restaurant/inventory/config', {
      ...(restaurantId ? { restaurant_id: restaurantId } : {}),
      deduction_mode: deductionMode,
    });
    const config = res?.data?.config;
    if (!config || typeof config.deduction_mode !== 'string' || !config.deduction_mode) {
      throw new Error('Invalid inventory configuration response from server.');
    }
    return {
      restaurantId: config.restaurant_id ?? restaurantId ?? null,
      deductionMode: config.deduction_mode,
    };
  },

  adjustInventoryStock() {
    notAvailable('Adjusting inventory stock');
  },

  adjustMenuStock() {
    notAvailable('Adjusting menu stock');
  },

  getActivityLog() {
    return [];
  },

  getDashboardStats() {
    return {
      todayRevenue: 0,
      ordersToday: 0,
      pendingOrders: 0,
      preparingOrders: 0,
      completedToday: 0,
      pendingReservations: 0,
      avgOrderValue: 0,
      totalMenuItems: 0,
      unavailableItems: 0,
    };
  },

  getEarningsOverview() {
    return {
      thisWeek: 0,
      thisMonth: 0,
    };
  },

  getEarningsSummary() {
    return null;
  },

  requestPayout() {
    notAvailable('Requesting payout');
  },

  async getSettings(restaurantId) {
    const query = restaurantId ? `?restaurant_id=${encodeURIComponent(restaurantId)}` : '';
    const res = await apiClient.get(`/restaurant/settings${query}`);
    return res?.data ?? null;
  },

  async updateSettings(restaurantId, payload) {
    const res = await apiClient.patch('/restaurant/settings', {
      ...(restaurantId ? { restaurant_id: restaurantId } : {}),
      ...payload,
    });
    return res?.data ?? null;
  },

  async getChangeRequests(restaurantId) {
    const query = restaurantId ? `?restaurant_id=${encodeURIComponent(restaurantId)}` : '';
    const res = await apiClient.get(`/restaurant/change-requests${query}`);
    return res?.data?.requests ?? [];
  },

  async submitChangeRequest(restaurantId, payload) {
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
    if (restaurantId && !fd.has('restaurant_id')) {
      fd.append('restaurant_id', String(restaurantId));
    }
    const res = await apiClient.post('/restaurant/change-requests', fd);
    return res?.data?.request ?? null;
  },

  async cancelChangeRequest(requestId) {
    const res = await apiClient.delete(`/restaurant/change-requests/${encodeURIComponent(requestId)}`);
    return res?.data?.request ?? null;
  },

  async getBranches() {
    const res = await apiClient.get('/restaurant/branches');
    return Array.isArray(res?.data?.branches) ? res.data.branches : [];
  },

  async createBranch(payload) {
    const res = await apiClient.post('/restaurant/branches', payload);
    return res?.data?.branch ?? null;
  },

  async submitBranchPermit(restaurantId, payload) {
    const res = await apiClient.post(`/restaurant/branches/${restaurantId}/permit`, payload);
    return res?.data?.permit ?? null;
  },

  async fetchBranchPermitFileBlob(restaurantId) {
    const url = `${apiClient.getBaseUrl()}/restaurant/branches/${restaurantId}/permit/file`;
    const res = await fetch(url, {
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
};

export default ownerService;
