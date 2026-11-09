import { getAdminMock, getPlatformTotals, getOrdersWithFinancials } from '../features/admin/mocks';

const STORAGE_KEYS = {
  restaurants: 'salo_admin_restaurants',
  riders: 'salo_admin_riders',
  users: 'salo_admin_users',
  config: 'salo_admin_config',
};

function read(topic, key) {
  const fallback = getAdminMock(topic).data;
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, data) {
  localStorage.setItem(key, JSON.stringify(data));
}

export const adminService = {
  getPlatformStats() {
    return getAdminMock('dashboard').data;
  },

  getFinancialTotals() {
    return getPlatformTotals();
  },

  getRestaurants() {
    return read('restaurants', STORAGE_KEYS.restaurants);
  },

  updateRestaurantStatus(id, status, details = {}) {
    const updated = this.getRestaurants().map((restaurant) => restaurant.id === id ? { ...restaurant, ...details, status } : restaurant);
    write(STORAGE_KEYS.restaurants, updated);
    return updated;
  },

  updateRestaurantCommission(id, rate) {
    const updated = this.getRestaurants().map((restaurant) => restaurant.id === id ? { ...restaurant, commissionRate: Number(rate) } : restaurant);
    write(STORAGE_KEYS.restaurants, updated);
    return updated;
  },

  getRiders() {
    return read('riders', STORAGE_KEYS.riders);
  },

  updateRiderStatus(id, status, details = {}) {
    const updated = this.getRiders().map((rider) => rider.id === id ? { ...rider, ...details, status } : rider);
    write(STORAGE_KEYS.riders, updated);
    return updated;
  },

  getOrders() {
    return getOrdersWithFinancials();
  },

  getUsers() {
    return read('accounts', STORAGE_KEYS.users);
  },

  updateUserStatus(id, status) {
    const updated = this.getUsers().map((user) => user.id === id ? { ...user, status } : user);
    write(STORAGE_KEYS.users, updated);
    return updated;
  },

  getConfig() {
    return read('settings', STORAGE_KEYS.config);
  },

  updateConfig(data) {
    const updated = { ...this.getConfig(), ...data };
    write(STORAGE_KEYS.config, updated);
    return updated;
  },
};

export default adminService;
