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

  getReservations() {
    return [];
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

  getTables() {
    return [];
  },

  getTableSchedule() {
    return [];
  },

  addTable() {
    notAvailable('Adding tables');
  },

  updateTable() {
    notAvailable('Updating tables');
  },

  archiveTable() {
    notAvailable('Archiving tables');
  },

  reactivateTable() {
    notAvailable('Reactivating tables');
  },

  updateReservationStatus() {
    notAvailable('Updating reservation status');
  },

  assignReservationTable() {
    notAvailable('Assigning reservation table');
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
};

export default ownerService;
