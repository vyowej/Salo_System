/**
 * SALO — Platform Administrator Service
 * Handles platform-wide metrics, restaurant partner verification,
 * rider onboarding, multi-kitchen order disputes, user directory,
 * and global operational configuration.
 */

const DEFAULT_STATS = {
  totalRevenue: 1845200, // ₱1.84M GMV
  platformCommissionEarned: 184520, // 10% take rate
  ordersToday: 42,
  totalRestaurants: 38,
  pendingRestaurantApprovals: 3,
  totalRiders: 114,
  activeRidersOnRoad: 28,
  pendingRiderVerifications: 2,
  registeredCustomers: 3420,
};

const DEFAULT_RESTAURANTS = [
  {
    id: 'rest-1',
    name: 'Dalisay Heritage Grill & Bistro',
    cuisine: 'Filipino · Grill & BBQ',
    ownerName: 'Dalisay Reyes',
    ownerEmail: 'owner@salo.ph',
    address: '42 Scout Gandia St., Quezon City',
    phone: '(02) 8-234-5678',
    status: 'Active', // 'Active' | 'Pending Approval' | 'Suspended'
    commissionRate: 10,
    rating: 4.9,
    joinedDate: '2026-08-15',
  },
  {
    id: 'rest-2',
    name: 'Calle Crisologo Silog',
    cuisine: 'Filipino · Breakfast & Bowls',
    ownerName: 'Crisanto Crisologo',
    ownerEmail: 'callecrisologo@gmail.com',
    address: '15 Timog Ave., Quezon City',
    phone: '(02) 8-441-2090',
    status: 'Active',
    commissionRate: 10,
    rating: 4.7,
    joinedDate: '2026-09-02',
  },
  {
    id: 'rest-3',
    name: 'Manila Artisan Pizza',
    cuisine: 'Pizza & Pasta · Italian',
    ownerName: 'Enzo Rossi',
    ownerEmail: 'manilapizza@artisangroup.ph',
    address: '88 E. Rodriguez Jr. Ave., QC',
    phone: '(02) 8-900-3321',
    status: 'Active',
    commissionRate: 12,
    rating: 4.8,
    joinedDate: '2026-09-10',
  },
  {
    id: 'rest-4',
    name: 'Aling Nena Ihaw-Ihaw Express',
    cuisine: 'Street Food · Charcoal BBQ',
    ownerName: 'Nenita Santos',
    ownerEmail: 'alingnena.ihaw@yahoo.com',
    address: 'Brgy. Sacred Heart, Kamuning, QC',
    phone: '0917 443 2189',
    status: 'Pending Approval',
    commissionRate: 10,
    rating: 0,
    joinedDate: '2026-11-04',
  },
  {
    id: 'rest-5',
    name: 'Kapampangan Sisig Republic',
    cuisine: 'Filipino · Sizzling Plates',
    ownerName: 'Gerardo Pineda',
    ownerEmail: 'sisigrepublic@pineda.ph',
    address: 'West Triangle, Quezon City',
    phone: '(02) 8-710-9941',
    status: 'Pending Approval',
    commissionRate: 10,
    rating: 0,
    joinedDate: '2026-11-05',
  },
  {
    id: 'rest-6',
    name: 'Baguio Fresh Salad Bar',
    cuisine: 'Healthy & Organic · Vegetarian',
    ownerName: 'Grace Baguilat',
    ownerEmail: 'freshsalad@baguiofarms.com',
    address: 'Katipunan Ave., Loyola Heights, QC',
    phone: '(02) 8-552-1920',
    status: 'Suspended',
    commissionRate: 10,
    rating: 3.9,
    joinedDate: '2026-07-20',
  },
];

const DEFAULT_RIDERS = [
  {
    id: 'rider-1',
    name: 'Danilo Ramos',
    email: 'rider@salo.ph',
    phone: '0917 889 4210',
    vehicle: 'Honda Click 125i (NQ 4821)',
    licenseNumber: 'N02-18-094120',
    zone: 'Quezon City',
    status: 'Active', // 'Active' | 'Pending Verification' | 'Suspended'
    isOnline: true,
    rating: 4.96,
    totalTrips: 1248,
    cashOnHand: 1450,
  },
  {
    id: 'rider-2',
    name: 'Ramon Bautista',
    email: 'ramon.bautista@gmail.com',
    phone: '0918 331 4452',
    vehicle: 'Yamaha Aerox 155 (ND 9012)',
    licenseNumber: 'N01-19-102941',
    zone: 'Mandaluyong & Pasig',
    status: 'Active',
    isOnline: true,
    rating: 4.88,
    totalTrips: 890,
    cashOnHand: 850,
  },
  {
    id: 'rider-3',
    name: 'Joselito De Vera',
    email: 'jdevera.courier@yahoo.com',
    phone: '0928 440 9182',
    vehicle: 'Suzuki Smash 115 (MA 4190)',
    licenseNumber: 'N03-16-081920',
    zone: 'Makati & BGC',
    status: 'Active',
    isOnline: false,
    rating: 4.92,
    totalTrips: 1420,
    cashOnHand: 0,
  },
  {
    id: 'rider-4',
    name: 'Kevin Soriano',
    email: 'kevinsoriano.ph@gmail.com',
    phone: '0909 881 2341',
    vehicle: 'Honda Beat 110 (AB 1928)',
    licenseNumber: 'N02-21-002931',
    zone: 'Quezon City',
    status: 'Pending Verification',
    isOnline: false,
    rating: 0,
    totalTrips: 0,
    cashOnHand: 0,
  },
  {
    id: 'rider-5',
    name: 'Arnel Mendoza',
    email: 'arnel.mendoza88@gmail.com',
    phone: '0917 990 4123',
    vehicle: 'Kawasaki Barako 175 (WC 8120)',
    licenseNumber: 'N01-15-081290',
    zone: 'Manila & Pasay',
    status: 'Suspended',
    isOnline: false,
    rating: 4.1,
    totalTrips: 215,
    cashOnHand: 4120,
  },
];

const DEFAULT_ORDERS = [
  {
    id: 'SALO-MNL-2041',
    customerName: 'Patricia Gomez',
    customerEmail: 'customer@salo.ph',
    subOrdersCount: 2,
    restaurants: ['Dalisay Heritage Grill', 'Manila Artisan Pizza'],
    deliveryAddress: 'Unit 8B, Scout Rallos, Quezon City',
    totalAmount: 835,
    paymentMethod: 'Cash on Delivery (COD)',
    riderName: 'Danilo Ramos',
    status: 'In Transit',
    disputeStatus: 'None',
    createdAt: '2026-11-05 23:10',
  },
  {
    id: 'SALO-MNL-2040',
    customerName: 'Rico Dela Cruz',
    customerEmail: 'ricodc@yahoo.com',
    subOrdersCount: 1,
    restaurants: ['Calle Crisologo Silog'],
    deliveryAddress: 'Brgy. Sacred Heart, Kamuning, QC',
    totalAmount: 390,
    paymentMethod: 'GCash',
    riderName: 'Ramon Bautista',
    status: 'Completed',
    disputeStatus: 'None',
    createdAt: '2026-11-05 22:45',
  },
  {
    id: 'SALO-MNL-2039',
    customerName: 'Katrina Sy',
    customerEmail: 'katrina.sy@gmail.com',
    subOrdersCount: 3,
    restaurants: ['Dalisay Heritage Grill', 'Manila Artisan Pizza', 'Calle Crisologo Silog'],
    deliveryAddress: 'Eastwood City, Libis, QC',
    totalAmount: 1420,
    paymentMethod: 'Maya',
    riderName: 'Unassigned',
    status: 'Preparing',
    disputeStatus: 'None',
    createdAt: '2026-11-05 22:30',
  },
  {
    id: 'SALO-MNL-2032',
    customerName: 'Benito Aquino',
    customerEmail: 'benito.aquino@outlook.com',
    subOrdersCount: 1,
    restaurants: ['Baguio Fresh Salad Bar'],
    deliveryAddress: 'Loyola Heights, Quezon City',
    totalAmount: 480,
    paymentMethod: 'Credit Card',
    riderName: 'Arnel Mendoza',
    status: 'Cancelled',
    disputeStatus: 'Refund Requested',
    createdAt: '2026-11-05 21:15',
  },
];

const DEFAULT_USERS = [
  { id: 'usr-1', name: 'Patricia Gomez', email: 'customer@salo.ph', role: 'Customer', status: 'Active', joined: '2026-08-10', trips: 14 },
  { id: 'usr-2', name: 'Dalisay Reyes', email: 'owner@salo.ph', role: 'Restaurant Owner', status: 'Active', joined: '2026-08-15', trips: 847 },
  { id: 'usr-3', name: 'Danilo Ramos', email: 'rider@salo.ph', role: 'Delivery Rider', status: 'Active', joined: '2026-08-20', trips: 1248 },
  { id: 'usr-4', name: 'Super Administrator', email: 'admin@salo.ph', role: 'Administrator', status: 'Active', joined: '2026-08-01', trips: 0 },
  { id: 'usr-5', name: 'Crisanto Crisologo', email: 'callecrisologo@gmail.com', role: 'Restaurant Owner', status: 'Active', joined: '2026-09-02', trips: 540 },
  { id: 'usr-6', name: 'Ramon Bautista', email: 'ramon.bautista@gmail.com', role: 'Delivery Rider', status: 'Active', joined: '2026-09-12', trips: 890 },
  { id: 'usr-7', name: 'Grace Baguilat', email: 'freshsalad@baguiofarms.com', role: 'Restaurant Owner', status: 'Suspended', joined: '2026-07-20', trips: 88 },
  { id: 'usr-8', name: 'Arnel Mendoza', email: 'arnel.mendoza88@gmail.com', role: 'Delivery Rider', status: 'Suspended', joined: '2026-08-25', trips: 215 },
];

const DEFAULT_CONFIG = {
  platformCommissionPercent: 10,
  defaultDeliveryFee: 49,
  minimumOrderValue: 150,
  cancellationWindowMinutes: 5,
  maintenanceMode: false,
  payoutSchedule: 'Weekly on Mondays',
  supportHotline: '(02) 8-800-SALO',
  supportEmail: 'support@salo.ph',
};

const KEYS = {
  stats: 'salo_admin_stats',
  restaurants: 'salo_admin_restaurants',
  riders: 'salo_admin_riders',
  orders: 'salo_admin_orders',
  users: 'salo_admin_users',
  config: 'salo_admin_config',
};

function load(key, fallback) {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : fallback;
  } catch {
    return fallback;
  }
}

function save(key, data) {
  localStorage.setItem(key, JSON.stringify(data));
}

export const adminService = {
  // ── Stats ──────────────────────────────────────────────────
  getPlatformStats() {
    return load(KEYS.stats, DEFAULT_STATS);
  },

  // ── Restaurants Management ─────────────────────────────────
  getRestaurants() {
    return load(KEYS.restaurants, DEFAULT_RESTAURANTS);
  },

  updateRestaurantStatus(id, newStatus) {
    const list = this.getRestaurants();
    const updated = list.map((r) => (r.id === id ? { ...r, status: newStatus } : r));
    save(KEYS.restaurants, updated);
    return updated;
  },

  updateRestaurantCommission(id, rate) {
    const list = this.getRestaurants();
    const updated = list.map((r) => (r.id === id ? { ...r, commissionRate: parseFloat(rate) } : r));
    save(KEYS.restaurants, updated);
    return updated;
  },

  // ── Riders Management ──────────────────────────────────────
  getRiders() {
    return load(KEYS.riders, DEFAULT_RIDERS);
  },

  updateRiderStatus(id, newStatus) {
    const list = this.getRiders();
    const updated = list.map((r) => (r.id === id ? { ...r, status: newStatus } : r));
    save(KEYS.riders, updated);
    return updated;
  },

  // ── Platform Orders & Disputes ─────────────────────────────
  getOrders() {
    return load(KEYS.orders, DEFAULT_ORDERS);
  },

  resolveOrderDispute(id, action) {
    const list = this.getOrders();
    const updated = list.map((o) => {
      if (o.id === id) {
        if (action === 'Refund Approved') {
          return { ...o, disputeStatus: 'Refunded (₱' + o.totalAmount + ')', status: 'Cancelled' };
        }
        if (action === 'Dispute Dismissed') {
          return { ...o, disputeStatus: 'Resolved (No Refund)' };
        }
      }
      return o;
    });
    save(KEYS.orders, updated);
    return updated;
  },

  // ── User Directory ─────────────────────────────────────────
  getUsers() {
    return load(KEYS.users, DEFAULT_USERS);
  },

  updateUserStatus(id, newStatus) {
    const list = this.getUsers();
    const updated = list.map((u) => (u.id === id ? { ...u, status: newStatus } : u));
    save(KEYS.users, updated);
    return updated;
  },

  // ── System Configuration ───────────────────────────────────
  getConfig() {
    return load(KEYS.config, DEFAULT_CONFIG);
  },

  updateConfig(data) {
    const current = this.getConfig();
    const updated = { ...current, ...data };
    save(KEYS.config, updated);
    return updated;
  },
};

export default adminService;
