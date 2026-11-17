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

  getOrders() {
    return [];
  },

  updateOrderStatus() {
    notAvailable('Updating order status');
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

  getInventoryConfig() {
    return { deductionMode: 'manual' };
  },

  updateInventoryConfig() {
    notAvailable('Updating inventory configuration');
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
};

export default ownerService;
