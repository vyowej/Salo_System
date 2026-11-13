import restaurantService from './restaurantService';

/**
 * Owner-facing service facade. Pages use this stable interface; the current
 * implementation delegates to the shared demo adapter.
 */
export const ownerService = {
  getRestaurant(id) {
    return restaurantService.getRestaurant(id);
  },

  updateRestaurant(data, id) {
    return restaurantService.updateRestaurant(data, id);
  },

  updateBusinessProfile(data, id) {
    return restaurantService.updateBusinessProfile(data, id);
  },

  getMenuItems(id) {
    return restaurantService.getMenuItems(id);
  },

  getMenuCategories(id) {
    return restaurantService.getMenuCategories(id);
  },

  saveMenuCategories(categories, id, categoryChanges) {
    return restaurantService.saveMenuCategories(categories, id, categoryChanges);
  },

  addMenuItem(item, id) {
    return restaurantService.addMenuItem(item, id);
  },

  updateMenuItem(id, data, restaurantId) {
    return restaurantService.updateMenuItem(id, data, restaurantId);
  },

  deleteMenuItem(id, restaurantId) {
    return restaurantService.deleteMenuItem(id, restaurantId);
  },

  removeImage(image) {
    return restaurantService.removeImage(image);
  },

  getOrders(id, options) {
    return restaurantService.getOrders(id, options);
  },

  updateOrderStatus(id, status, restaurantId, details) {
    return restaurantService.updateOrderStatus(id, status, restaurantId, details);
  },

  resolveOrderCancellation(id, decision, restaurantId, reason) {
    return restaurantService.resolveOrderCancellation(id, decision, restaurantId, reason);
  },

  getReservations(id) {
    return restaurantService.getReservations(id);
  },

  getReservationTables(restaurantId, reservationId) {
    return restaurantService.getReservationTables(restaurantId, reservationId);
  },

  getReservationTableOptions(restaurantId, reservationId) {
    return restaurantService.getReservationTableOptions(restaurantId, reservationId);
  },

  getDiningAreas(restaurantId) {
    return restaurantService.getDiningAreas(restaurantId);
  },

  addDiningArea(name, restaurantId) {
    return restaurantService.addDiningArea(name, restaurantId);
  },

  updateDiningArea(id, name, restaurantId) {
    return restaurantService.updateDiningArea(id, name, restaurantId);
  },

  getTables(restaurantId, date, time) {
    return restaurantService.getTables(restaurantId, date, time);
  },

  getTableSchedule(tableId, date, restaurantId) {
    return restaurantService.getTableSchedule(tableId, date, restaurantId);
  },

  addTable(data, restaurantId) {
    return restaurantService.addTable(data, restaurantId);
  },

  updateTable(id, data, restaurantId) {
    return restaurantService.updateTable(id, data, restaurantId);
  },

  setTableAvailability(id, status, restaurantId) {
    return restaurantService.setTableAvailability(id, status, restaurantId);
  },

  archiveTable(id, restaurantId) {
    return restaurantService.archiveTable(id, restaurantId);
  },

  deactivateTable(id, restaurantId) {
    return restaurantService.deactivateTable(id, restaurantId);
  },

  reactivateTable(id, restaurantId) {
    return restaurantService.reactivateTable(id, restaurantId);
  },

  getInventorySettings(restaurantId) {
    return restaurantService.getInventorySettings(restaurantId);
  },

  setInventoryDeductionMode(mode, restaurantId) {
    return restaurantService.setInventoryDeductionMode(mode, restaurantId);
  },

  getInventoryItems(restaurantId) {
    return restaurantService.getInventoryItems(restaurantId);
  },

  getInventoryMovements(restaurantId, itemId) {
    return restaurantService.getInventoryMovements(restaurantId, itemId);
  },

  createInventoryItem(data, restaurantId) {
    return restaurantService.createInventoryItem(data, restaurantId);
  },

  updateInventoryItem(id, data, restaurantId) {
    return restaurantService.updateInventoryItem(id, data, restaurantId);
  },

  receiveInventoryStock(id, quantity, restaurantId, reason) {
    return restaurantService.receiveInventoryStock(id, quantity, restaurantId, reason);
  },

  recordInventoryUsage(id, quantity, restaurantId, reason) {
    return restaurantService.recordInventoryUsage(id, quantity, restaurantId, reason);
  },

  adjustInventoryStock(id, quantity, reason, restaurantId) {
    return restaurantService.adjustInventoryStock(id, quantity, reason, restaurantId);
  },

  returnInventoryStock(id, quantity, restaurantId, reason) {
    return restaurantService.returnInventoryStock(id, quantity, restaurantId, reason);
  },

  markInventoryUnavailable(id, unavailable, restaurantId) {
    return restaurantService.markInventoryUnavailable(id, unavailable, restaurantId);
  },

  updateMenuItemStock(id, quantity, reason, restaurantId) {
    return restaurantService.updateMenuItemStock(id, quantity, reason, restaurantId);
  },

  assignReservationTable(id, tableId, restaurantId) {
    return restaurantService.assignReservationTable(id, tableId, restaurantId);
  },

  confirmReservationTable(id, restaurantId) {
    return restaurantService.confirmReservationTable(id, restaurantId);
  },

  resolveReservationCancellation(id, decision, restaurantId, reason) {
    return restaurantService.resolveReservationCancellation(id, decision, restaurantId, reason);
  },

  recordReservationPayment(id, restaurantId, reference) {
    return restaurantService.recordReservationPayment(id, restaurantId, reference);
  },

  updateReservationStatus(id, status, restaurantId, details) {
    return restaurantService.updateReservationStatus(id, status, restaurantId, details);
  },

  getEarningsOverview(id) {
    return restaurantService.getEarningsOverview(id);
  },

  getDashboardStats(id) {
    return restaurantService.getDashboardStats(id);
  },

  logActivity(activity) {
    return restaurantService.logActivity(activity);
  },
};

export default ownerService;
