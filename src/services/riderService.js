/**
 * SALO — Delivery Rider Service
 * Handles live dispatch, active delivery stepping, available jobs pool,
 * trip history, COD cash-on-hand tracking, and remittances.
 * Persisted in localStorage for seamless multi-page testing.
 */

const DEFAULT_RIDER = {
  id: 'rider-danilo',
  name: 'Danilo Ramos',
  email: 'rider@salo.ph',
  phone: '0917 889 4210',
  avatar: '🛵',
  vehicle: 'Honda Click 125i (Matte Black)',
  plateNumber: 'NQ 4821',
  licenseNumber: 'N02-18-094120',
  rating: 4.96,
  totalTrips: 1248,
  isOnline: true,
  cashOnHand: 1450, // COD amount collected that needs remittance
  zone: 'Quezon City · Tomas Morato & Scout Area',
  emergencyContact: 'Marites Ramos (Spouse) · 0918 554 1120',
};

const DEFAULT_ACTIVE_DELIVERY = {
  id: 'DEL-9041',
  orderId: 'SALO-MNL-2041',
  restaurantName: 'Dalisay Heritage Grill & Bistro',
  restaurantAddress: '42 Scout Gandia St., Tomas Morato, Quezon City',
  restaurantPhone: '(02) 8-234-5678',
  customerName: 'Patricia Gomez',
  customerPhone: '0917 234 5678',
  deliveryAddress: 'Unit 8B, The Sapphire Residences, Scout Rallos St., Quezon City',
  landmarks: 'Across Starbucks Scout Rallos. Lobby guard will allow entry.',
  items: [
    { name: 'Inasal na Manok (Quarter Leg)', qty: 2, price: 195 },
    { name: 'Crispy Pork Belly Liempo', qty: 1, price: 320 },
    { name: 'Steamed Garlic Rice', qty: 2, price: 60 },
  ],
  paymentMethod: 'Cash on Delivery (COD)',
  cashToCollect: 835,
  payout: 85, // delivery fee for rider
  tip: 40,
  distanceKm: 2.4,
  status: 'In Transit', // 'Heading to Restaurant' | 'At Restaurant' | 'Picked Up' | 'In Transit' | 'Arrived' | 'Completed'
  assignedAt: '2026-11-05T23:10:00',
};

const DEFAULT_AVAILABLE_JOBS = [
  {
    id: 'JOB-418',
    orderId: 'SALO-QC-981',
    restaurantName: 'Calle Crisologo Silog',
    restaurantAddress: '15 Timog Ave., Quezon City',
    dropoffAddress: 'Brgy. Sacred Heart, Kamuning, QC',
    distanceKm: 3.1,
    estimatedMinutes: '18 min',
    payout: 78,
    paymentMethod: 'GCash (Prepaid)',
    itemsCount: 3,
    readyStatus: 'Ready in 5 min',
  },
  {
    id: 'JOB-419',
    orderId: 'SALO-QC-984',
    restaurantName: 'Manila Artisan Pizza',
    restaurantAddress: '88 E. Rodriguez Jr. Ave., QC',
    dropoffAddress: 'New Manila, Quezon City',
    distanceKm: 4.5,
    estimatedMinutes: '24 min',
    payout: 95,
    paymentMethod: 'Cash on Delivery',
    cashToCollect: 680,
    itemsCount: 2,
    readyStatus: 'Food Ready for Pickup',
  },
  {
    id: 'JOB-420',
    orderId: 'SALO-QC-992',
    restaurantName: 'Dalisay Heritage Grill',
    restaurantAddress: '42 Scout Gandia St., QC',
    dropoffAddress: 'West Triangle, Quezon City',
    distanceKm: 5.2,
    estimatedMinutes: '26 min',
    payout: 110,
    paymentMethod: 'Maya (Prepaid)',
    itemsCount: 4,
    readyStatus: 'Cooking · Ready in 8 min',
  },
];

const DEFAULT_HISTORY = [
  {
    id: 'DEL-9038',
    orderId: 'SALO-MNL-2022',
    restaurantName: 'Dalisay Heritage Grill',
    customerName: 'Marco Antonio',
    dropoffAddress: 'Scout Fuentebella, QC',
    completedAt: '2026-11-05 21:40',
    payout: 75,
    tip: 30,
    paymentMethod: 'GCash',
    status: 'Completed',
  },
  {
    id: 'DEL-9035',
    orderId: 'SALO-MNL-2015',
    restaurantName: 'Manila Artisan Pizza',
    customerName: 'Katrina Sy',
    dropoffAddress: 'Brgy. Laging Handa, QC',
    completedAt: '2026-11-05 20:15',
    payout: 85,
    tip: 50,
    paymentMethod: 'Cash on Delivery',
    status: 'Completed',
  },
  {
    id: 'DEL-9031',
    orderId: 'SALO-MNL-1998',
    restaurantName: 'Calle Crisologo Silog',
    customerName: 'Eduardo Santos',
    dropoffAddress: 'Diliman, QC',
    completedAt: '2026-11-05 18:50',
    payout: 92,
    tip: 20,
    paymentMethod: 'Maya',
    status: 'Completed',
  },
  {
    id: 'DEL-9024',
    orderId: 'SALO-MNL-1970',
    restaurantName: 'The Milk Tea Hub',
    customerName: 'Clarissa Tan',
    dropoffAddress: 'South Triangle, QC',
    completedAt: '2026-11-05 16:30',
    payout: 65,
    tip: 15,
    paymentMethod: 'GCash',
    status: 'Completed',
  },
  {
    id: 'DEL-9018',
    orderId: 'SALO-MNL-1952',
    restaurantName: 'Dalisay Heritage Grill',
    customerName: 'Jobert Cruz',
    dropoffAddress: 'Kamuning, QC',
    completedAt: '2026-11-05 14:10',
    payout: 78,
    tip: 25,
    paymentMethod: 'Cash on Delivery',
    status: 'Completed',
  },
];

const DEFAULT_REMITTANCES = [
  {
    id: 'RMT-1044',
    date: 'Nov 04, 2026 · 10:30 PM',
    amount: 2450,
    channel: 'GCash Remittance',
    reference: 'GC-994102831',
    status: 'Verified',
  },
  {
    id: 'RMT-1038',
    date: 'Nov 03, 2026 · 9:45 PM',
    amount: 1980,
    channel: 'Maya App',
    reference: 'MY-881290334',
    status: 'Verified',
  },
  {
    id: 'RMT-1029',
    date: 'Nov 02, 2026 · 10:15 PM',
    amount: 3200,
    channel: 'GCash Remittance',
    reference: 'GC-993881023',
    status: 'Verified',
  },
];

const KEYS = {
  rider: 'salo_rider_profile',
  activeDelivery: 'salo_rider_active_delivery',
  jobs: 'salo_rider_jobs',
  history: 'salo_rider_history',
  remittances: 'salo_rider_remittances',
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

export const riderService = {
  // ── Profile & Online Status ────────────────────────────────
  getRiderProfile() {
    return load(KEYS.rider, DEFAULT_RIDER);
  },

  updateRiderProfile(data) {
    const current = this.getRiderProfile();
    const updated = { ...current, ...data };
    save(KEYS.rider, updated);
    return updated;
  },

  toggleOnlineStatus() {
    const profile = this.getRiderProfile();
    profile.isOnline = !profile.isOnline;
    save(KEYS.rider, profile);
    return profile.isOnline;
  },

  // ── Active Delivery ────────────────────────────────────────
  getActiveDelivery() {
    return load(KEYS.activeDelivery, DEFAULT_ACTIVE_DELIVERY);
  },

  updateDeliveryStatus(newStatus) {
    const active = this.getActiveDelivery();
    if (!active) return null;
    active.status = newStatus;
    save(KEYS.activeDelivery, active);
    return active;
  },

  completeActiveDelivery() {
    const active = this.getActiveDelivery();
    if (!active) return null;

    // Add to history
    const history = this.getDeliveryHistory();
    const newHistoryEntry = {
      id: active.id,
      orderId: active.orderId,
      restaurantName: active.restaurantName,
      customerName: active.customerName,
      dropoffAddress: active.deliveryAddress,
      completedAt: new Date().toLocaleString('en-PH', { month: 'short', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
      payout: active.payout,
      tip: active.tip,
      paymentMethod: active.paymentMethod,
      status: 'Completed',
    };
    save(KEYS.history, [newHistoryEntry, ...history]);

    // Update cash on hand if COD
    if (active.paymentMethod.includes('Cash')) {
      const profile = this.getRiderProfile();
      profile.cashOnHand = (profile.cashOnHand || 0) + (active.cashToCollect || 0);
      profile.totalTrips = (profile.totalTrips || 0) + 1;
      save(KEYS.rider, profile);
    }

    // Clear active delivery
    save(KEYS.activeDelivery, null);
    return newHistoryEntry;
  },

  // ── Available Jobs (Dispatch Pool) ─────────────────────────
  getAvailableJobs() {
    return load(KEYS.jobs, DEFAULT_AVAILABLE_JOBS);
  },

  acceptJob(jobId) {
    const jobs = this.getAvailableJobs();
    const job = jobs.find((j) => j.id === jobId);
    if (!job) return null;

    // Remove from pool
    const updatedJobs = jobs.filter((j) => j.id !== jobId);
    save(KEYS.jobs, updatedJobs);

    // Set as active delivery
    const newActiveDelivery = {
      id: `DEL-${Math.floor(1000 + Math.random() * 9000)}`,
      orderId: job.orderId,
      restaurantName: job.restaurantName,
      restaurantAddress: job.restaurantAddress,
      restaurantPhone: '(02) 8-234-5678',
      customerName: 'Customer (SALO App)',
      customerPhone: '0917 555 1234',
      deliveryAddress: job.dropoffAddress,
      landmarks: 'Standard residential/office building.',
      items: [{ name: 'Order Food Package', qty: job.itemsCount, price: job.payout * 4 }],
      paymentMethod: job.paymentMethod,
      cashToCollect: job.cashToCollect || 0,
      payout: job.payout,
      tip: 25,
      distanceKm: job.distanceKm,
      status: 'Heading to Restaurant',
      assignedAt: new Date().toISOString(),
    };

    save(KEYS.activeDelivery, newActiveDelivery);
    return newActiveDelivery;
  },

  declineJob(jobId) {
    const jobs = this.getAvailableJobs();
    const updated = jobs.filter((j) => j.id !== jobId);
    save(KEYS.jobs, updated);
    return updated;
  },

  // ── History & Earnings ─────────────────────────────────────
  getDeliveryHistory() {
    return load(KEYS.history, DEFAULT_HISTORY);
  },

  getRemittances() {
    return load(KEYS.remittances, DEFAULT_REMITTANCES);
  },

  remitCash(amount, channel, reference) {
    const profile = this.getRiderProfile();
    const currentCash = profile.cashOnHand || 0;
    const remitAmount = parseFloat(amount);

    if (remitAmount > 0) {
      profile.cashOnHand = Math.max(0, currentCash - remitAmount);
      save(KEYS.rider, profile);

      const remittances = this.getRemittances();
      const newRemittance = {
        id: `RMT-${Math.floor(1000 + Math.random() * 9000)}`,
        date: new Date().toLocaleString('en-PH', { month: 'short', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
        amount: remitAmount,
        channel: channel || 'GCash Remittance',
        reference: reference || `REF-${Date.now().toString().slice(-8)}`,
        status: 'Verified',
      };

      save(KEYS.remittances, [newRemittance, ...remittances]);
      return newRemittance;
    }
    return null;
  },

  getEarningsSummary() {
    const history = this.getDeliveryHistory();
    const todayPayouts = history.reduce((sum, item) => sum + (item.payout || 0), 0);
    const todayTips = history.reduce((sum, item) => sum + (item.tip || 0), 0);

    return {
      todayEarnings: todayPayouts + todayTips,
      deliveryFees: todayPayouts,
      tips: todayTips,
      completedTrips: history.length,
      weeklyEarnings: 4920,
      monthlyEarnings: 21400,
    };
  },
};

export default riderService;
