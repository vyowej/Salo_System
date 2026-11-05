/**
 * SALO — Owner Service
 * Handles data for restaurant management: menu, orders, reservations, earnings.
 * Uses localStorage for persistence with rich mock data for seamless UI experience.
 * Restaurant: Dalisay Heritage Grill & Bistro — owned by owner@salo.ph
 */

// ── Mock Restaurant Profile ──────────────────────────────────────
const MOCK_RESTAURANT = {
  id: 'dalisay-heritage',
  name: 'Dalisay Heritage Grill & Bistro',
  tagline: 'Authentic Filipino charcoal-grilled specialties',
  cuisine: 'Filipino · Grill & BBQ',
  ownerEmail: 'owner@salo.ph',
  ownerName: 'Dalisay Reyes',
  rating: 4.9,
  reviewCount: 1420,
  deliveryTime: '25–35 min',
  deliveryFee: 49,
  minOrder: 150,
  isOpen: true,
  operatingHours: '10:00 AM – 10:00 PM',
  address: '42 Scout Gandia St., Tomas Morato, Quezon City',
  phone: '(02) 8-234-5678',
  coverImage: '🔥',
  reservationDeposit: 500,
  categories: ['Best Sellers', 'Grilled Mains', 'Beverages'],
  bio: 'A family-run heritage grill celebrating the bold flavors of Filipino charcoal cooking since 2009. Our recipes are passed down from Lola Dalisay herself.',
};

// ── Mock Menu Items ──────────────────────────────────────────────
const MOCK_MENU_ITEMS = [
  {
    id: 'menu-1',
    name: 'Inasal na Manok (Quarter Leg)',
    description: 'Bacolod-style charbroiled chicken basted in annatto-calamansi glaze, served with chicken oil and sinamak vinegar.',
    price: 195,
    category: 'Best Sellers',
    isAvailable: true,
    image: '🍗',
  },
  {
    id: 'menu-2',
    name: 'Crispy Pork Belly Liempo',
    description: 'Thick-cut pork belly roasted with lemongrass and garlic then deep-fried to crackling perfection.',
    price: 320,
    category: 'Best Sellers',
    isAvailable: true,
    image: '🥓',
  },
  {
    id: 'menu-3',
    name: 'Sizzling Sisig Kapampangan',
    description: 'Crispy minced pork jowl with red onions, calamansi, and fresh bird\'s eye chili on a hot plate.',
    price: 260,
    category: 'Best Sellers',
    isAvailable: true,
    image: '🍳',
  },
  {
    id: 'menu-4',
    name: 'Grilled Tilapia sa Dahon ng Saging',
    description: 'Whole tilapia marinated in calamansi and sea salt, wrapped in banana leaf and grilled over live charcoal.',
    price: 285,
    category: 'Grilled Mains',
    isAvailable: true,
    image: '🐟',
  },
  {
    id: 'menu-5',
    name: 'Inihaw na Liempo (1/2 kilo)',
    description: 'Half-kilo of marinated pork belly grilled over charcoal, served with sawsawan and atchara.',
    price: 420,
    category: 'Grilled Mains',
    isAvailable: true,
    image: '🥩',
  },
  {
    id: 'menu-6',
    name: 'Inihaw na Pusit',
    description: 'Whole squid stuffed with tomato and onion, grilled to tender perfection with a soy-calamansi glaze.',
    price: 350,
    category: 'Grilled Mains',
    isAvailable: true,
    image: '🦑',
  },
  {
    id: 'menu-7',
    name: 'Barbeque Chicken Platter (Half)',
    description: 'Half chicken marinated in our signature sweet BBQ sauce, served with pickled papaya and Java rice.',
    price: 445,
    category: 'Grilled Mains',
    isAvailable: false,
    image: '🍖',
  },
  {
    id: 'menu-8',
    name: 'Sago at Gulaman (Large)',
    description: 'Classic Filipino refreshment with pearl sago, brown sugar syrup, and toasted pandan gulaman.',
    price: 65,
    category: 'Beverages',
    isAvailable: true,
    image: '🧃',
  },
  {
    id: 'menu-9',
    name: 'Buko Pandan Shake',
    description: 'Fresh young coconut blended with pandan-infused milk and crushed ice.',
    price: 95,
    category: 'Beverages',
    isAvailable: true,
    image: '🥤',
  },
  {
    id: 'menu-10',
    name: 'Kapeng Barako (Hot)',
    description: 'Strong Batangas Liberica coffee brewed fresh, served with muscovado sugar on the side.',
    price: 75,
    category: 'Beverages',
    isAvailable: true,
    image: '☕',
  },
  {
    id: 'menu-11',
    name: 'Halo-Halo Especial',
    description: 'Crushed ice with leche flan, ube halaya, sweetened macapuno, langka, sago, and pinipig.',
    price: 155,
    category: 'Best Sellers',
    isAvailable: false,
    image: '🍨',
  },
];

// ── Mock Orders ──────────────────────────────────────────────────
const MOCK_ORDERS = [
  {
    id: 'ORD-1101',
    customerName: 'Maria Santos',
    customerPhone: '0917-123-4567',
    items: [
      { name: 'Inasal na Manok (Quarter Leg)', qty: 2, price: 195 },
      { name: 'Buko Pandan Shake', qty: 2, price: 95 },
    ],
    itemCount: 4,
    subtotal: 580,
    deliveryFee: 49,
    total: 629,
    fulfillment: 'delivery',
    address: 'Unit 5A, Jade Tower, Timog Ave, QC',
    status: 'Pending',
    createdAt: '2026-11-05T23:10:00',
    notes: 'Please double wrap the chicken.',
  },
  {
    id: 'ORD-1098',
    customerName: 'Jose Dela Cruz',
    customerPhone: '0918-765-4321',
    items: [
      { name: 'Crispy Pork Belly Liempo', qty: 1, price: 320 },
      { name: 'Sizzling Sisig Kapampangan', qty: 1, price: 260 },
      { name: 'Kapeng Barako (Hot)', qty: 2, price: 75 },
    ],
    itemCount: 4,
    subtotal: 730,
    deliveryFee: 49,
    total: 779,
    fulfillment: 'delivery',
    address: '12 Mapagmahal St., Cubao, QC',
    status: 'Pending',
    createdAt: '2026-11-05T23:05:00',
    notes: '',
  },
  {
    id: 'ORD-1095',
    customerName: 'Ana Reyes',
    customerPhone: '0916-234-5678',
    items: [
      { name: 'Inihaw na Liempo (1/2 kilo)', qty: 1, price: 420 },
      { name: 'Sago at Gulaman (Large)', qty: 2, price: 65 },
    ],
    itemCount: 3,
    subtotal: 550,
    deliveryFee: 49,
    total: 599,
    fulfillment: 'delivery',
    address: '88 Katipunan Ave., Loyola Heights, QC',
    status: 'Preparing',
    createdAt: '2026-11-05T22:50:00',
    notes: 'Extra sawsawan please.',
  },
  {
    id: 'ORD-1092',
    customerName: 'Carlo Bautista',
    customerPhone: '0919-345-6789',
    items: [
      { name: 'Inihaw na Pusit', qty: 1, price: 350 },
      { name: 'Grilled Tilapia sa Dahon ng Saging', qty: 1, price: 285 },
      { name: 'Buko Pandan Shake', qty: 1, price: 95 },
    ],
    itemCount: 3,
    subtotal: 730,
    deliveryFee: 49,
    total: 779,
    fulfillment: 'delivery',
    address: 'B4 L12 Sampaguita St., Project 4, QC',
    status: 'Preparing',
    createdAt: '2026-11-05T22:35:00',
    notes: '',
  },
  {
    id: 'ORD-1089',
    customerName: 'Ligaya Flores',
    customerPhone: '0920-456-7890',
    items: [
      { name: 'Inasal na Manok (Quarter Leg)', qty: 3, price: 195 },
      { name: 'Kapeng Barako (Hot)', qty: 3, price: 75 },
    ],
    itemCount: 6,
    subtotal: 810,
    deliveryFee: 49,
    total: 859,
    fulfillment: 'pickup',
    address: 'Dine-in / Pickup',
    status: 'Ready for Pickup',
    createdAt: '2026-11-05T22:15:00',
    notes: 'Will pick up in 10 mins.',
  },
  {
    id: 'ORD-1085',
    customerName: 'Ramon Garcia',
    customerPhone: '0921-567-8901',
    items: [
      { name: 'Crispy Pork Belly Liempo', qty: 2, price: 320 },
      { name: 'Sago at Gulaman (Large)', qty: 2, price: 65 },
    ],
    itemCount: 4,
    subtotal: 770,
    deliveryFee: 49,
    total: 819,
    fulfillment: 'delivery',
    address: 'Unit 2C, Pacific Gardens, Tomas Morato, QC',
    status: 'Out for Delivery',
    createdAt: '2026-11-05T21:55:00',
    notes: '',
  },
  {
    id: 'ORD-1080',
    customerName: 'Tessie Villanueva',
    customerPhone: '0922-678-9012',
    items: [
      { name: 'Sizzling Sisig Kapampangan', qty: 1, price: 260 },
      { name: 'Buko Pandan Shake', qty: 1, price: 95 },
    ],
    itemCount: 2,
    subtotal: 355,
    deliveryFee: 49,
    total: 404,
    fulfillment: 'delivery',
    address: '34 Scout Fernandez, QC',
    status: 'Completed',
    createdAt: '2026-11-05T21:00:00',
    notes: '',
  },
  {
    id: 'ORD-1076',
    customerName: 'Ben Aquino',
    customerPhone: '0923-789-0123',
    items: [
      { name: 'Inihaw na Liempo (1/2 kilo)', qty: 1, price: 420 },
      { name: 'Grilled Tilapia sa Dahon ng Saging', qty: 1, price: 285 },
    ],
    itemCount: 2,
    subtotal: 705,
    deliveryFee: 49,
    total: 754,
    fulfillment: 'delivery',
    address: '7 Maginoo St., Diliman, QC',
    status: 'Completed',
    createdAt: '2026-11-05T20:30:00',
    notes: '',
  },
  {
    id: 'ORD-1072',
    customerName: 'Carina Lopez',
    customerPhone: '0924-890-1234',
    items: [
      { name: 'Inasal na Manok (Quarter Leg)', qty: 1, price: 195 },
    ],
    itemCount: 1,
    subtotal: 195,
    deliveryFee: 49,
    total: 244,
    fulfillment: 'delivery',
    address: 'Blk 3 Lot 5, Villa Rosa Subd., QC',
    status: 'Cancelled',
    createdAt: '2026-11-05T19:45:00',
    notes: 'Customer requested cancellation.',
  },
];

// ── Mock Reservations ────────────────────────────────────────────
const MOCK_RESERVATIONS = [
  {
    id: 'RES-5501',
    guestName: 'Maricel Soriano',
    guestEmail: 'maricel@example.com',
    guestPhone: '0917-111-2222',
    date: '2026-11-08',
    time: '7:00 PM',
    partySize: 6,
    seatingArea: 'Private Nook',
    depositAmount: 500,
    status: 'Pending',
    specialRequests: 'Anniversary dinner. Please prepare a dessert surprise.',
    createdAt: '2026-11-05T10:00:00',
  },
  {
    id: 'RES-5498',
    guestName: 'Ramon Revilla',
    guestEmail: 'ramon@example.com',
    guestPhone: '0918-222-3333',
    date: '2026-11-09',
    time: '12:30 PM',
    partySize: 4,
    seatingArea: 'Outdoor Garden',
    depositAmount: 500,
    status: 'Pending',
    specialRequests: 'High chair needed for one toddler.',
    createdAt: '2026-11-05T11:30:00',
  },
  {
    id: 'RES-5490',
    guestName: 'Nora Aunor',
    guestEmail: 'nora@example.com',
    guestPhone: '0919-333-4444',
    date: '2026-11-10',
    time: '6:30 PM',
    partySize: 8,
    seatingArea: 'Main Dining Hall',
    depositAmount: 500,
    status: 'Confirmed',
    specialRequests: 'Celebrating a family reunion. Vegetarian option for 2 guests.',
    createdAt: '2026-11-04T09:00:00',
  },
  {
    id: 'RES-5482',
    guestName: 'Dolphy Jr.',
    guestEmail: 'dolphy.jr@example.com',
    guestPhone: '0920-444-5555',
    date: '2026-11-14',
    time: '7:30 PM',
    partySize: 4,
    seatingArea: 'Indoor Main Dining',
    depositAmount: 500,
    status: 'Confirmed',
    specialRequests: 'Near the window if possible. Birthday celebration.',
    createdAt: '2026-11-03T15:00:00',
  },
  {
    id: 'RES-5471',
    guestName: 'Vilma Santos',
    guestEmail: 'vilma@example.com',
    guestPhone: '0921-555-6666',
    date: '2026-11-02',
    time: '1:00 PM',
    partySize: 2,
    seatingArea: 'Outdoor Garden',
    depositAmount: 500,
    status: 'Completed',
    specialRequests: '',
    createdAt: '2026-10-28T08:00:00',
  },
  {
    id: 'RES-5460',
    guestName: 'FPJ Estate',
    guestEmail: 'fpj.estate@example.com',
    guestPhone: '0922-666-7777',
    date: '2026-11-01',
    time: '6:00 PM',
    partySize: 10,
    seatingArea: 'Private Nook',
    depositAmount: 500,
    status: 'Cancelled',
    specialRequests: 'VIP setup.',
    createdAt: '2026-10-25T12:00:00',
  },
];

// ── Mock Earnings ────────────────────────────────────────────────
const MOCK_EARNINGS = {
  today: 4200,
  thisWeek: 28500,
  thisMonth: 112000,
  totalOrders: 847,
  avgOrderValue: 485,
  pendingPayout: 18200,
  revenueByDay: [
    { day: 'Mon', amount: 5200 },
    { day: 'Tue', amount: 4800 },
    { day: 'Wed', amount: 6100 },
    { day: 'Thu', amount: 3900 },
    { day: 'Fri', amount: 5100 },
    { day: 'Sat', amount: 7200 },
    { day: 'Sun', amount: 4200 },
  ],
};

// ── Storage Keys ─────────────────────────────────────────────────
const KEYS = {
  restaurant: 'salo_owner_restaurant',
  menu: 'salo_owner_menu',
  orders: 'salo_owner_orders',
  reservations: 'salo_owner_reservations',
};

// ── Helpers ──────────────────────────────────────────────────────
function load(key, fallback) {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : fallback;
  } catch {
    return fallback;
  }
}

function save(key, data) {
  localStorage.setItem(key, JSON.stringify(data));
}

// ── Owner Service ────────────────────────────────────────────────
export const ownerService = {
  // Restaurant Profile
  getRestaurant() {
    return load(KEYS.restaurant, MOCK_RESTAURANT);
  },

  updateRestaurant(data) {
    const current = this.getRestaurant();
    const updated = { ...current, ...data };
    save(KEYS.restaurant, updated);
    return updated;
  },

  // Menu Items
  getMenuItems() {
    return load(KEYS.menu, MOCK_MENU_ITEMS);
  },

  addMenuItem(item) {
    const items = this.getMenuItems();
    const newItem = {
      ...item,
      id: `menu-${Date.now()}`,
      isAvailable: item.isAvailable !== undefined ? item.isAvailable : true,
    };
    const updated = [...items, newItem];
    save(KEYS.menu, updated);
    return newItem;
  },

  updateMenuItem(id, data) {
    const items = this.getMenuItems();
    const updated = items.map((item) => (item.id === id ? { ...item, ...data } : item));
    save(KEYS.menu, updated);
    return updated.find((item) => item.id === id);
  },

  deleteMenuItem(id) {
    const items = this.getMenuItems();
    const updated = items.filter((item) => item.id !== id);
    save(KEYS.menu, updated);
    return updated;
  },

  // Orders
  getOrders() {
    return load(KEYS.orders, MOCK_ORDERS);
  },

  updateOrderStatus(id, status) {
    const orders = this.getOrders();
    const updated = orders.map((order) =>
      order.id === id ? { ...order, status, updatedAt: new Date().toISOString() } : order
    );
    save(KEYS.orders, updated);
    return updated.find((o) => o.id === id);
  },

  // Reservations
  getReservations() {
    return load(KEYS.reservations, MOCK_RESERVATIONS);
  },

  updateReservationStatus(id, status) {
    const reservations = this.getReservations();
    const updated = reservations.map((res) =>
      res.id === id ? { ...res, status, updatedAt: new Date().toISOString() } : res
    );
    save(KEYS.reservations, updated);
    return updated.find((r) => r.id === id);
  },

  // Earnings
  getEarningsOverview() {
    return { ...MOCK_EARNINGS };
  },

  // Dashboard Stats
  getDashboardStats() {
    const orders = this.getOrders();
    const reservations = this.getReservations();
    const menuItems = this.getMenuItems();
    const earnings = this.getEarningsOverview();

    const todayOrders = orders.filter((o) => o.status !== 'Cancelled');
    const pendingOrders = orders.filter((o) => o.status === 'Pending').length;
    const preparingOrders = orders.filter((o) => o.status === 'Preparing').length;
    const completedToday = orders.filter((o) => o.status === 'Completed').length;
    const pendingReservations = reservations.filter((r) => r.status === 'Pending').length;
    const unavailableItems = menuItems.filter((m) => !m.isAvailable).length;

    return {
      todayRevenue: earnings.today,
      ordersToday: todayOrders.length,
      pendingOrders,
      preparingOrders,
      completedToday,
      pendingReservations,
      totalMenuItems: menuItems.length,
      unavailableItems,
      avgOrderValue: earnings.avgOrderValue,
    };
  },
};

export default ownerService;
