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
