/**
 * SALO — Customer Service
 * Handles data for restaurants, menus, reservations, orders, and addresses.
 * Ready for Laravel backend endpoints with rich mock dataset for seamless UI experience.
 */

import apiClient from './apiClient';

// ── Realistic Philippine Restaurant Dataset ───────────────────
export const INITIAL_RESTAURANTS = [
  {
    id: 'dalisay-heritage',
    name: 'Dalisay Heritage Grill & Bistro',
    tagline: 'Authentic Filipino charcoal-grilled specialties',
    cuisine: 'Filipino · Grill & BBQ',
    rating: 4.9,
    reviewCount: 1420,
    deliveryTime: '25–35 min',
    deliveryFee: 49,
    minOrder: 150,
    isOpen: true,
    operatingHours: '10:00 AM – 10:00 PM',
    address: '42 Scout Gandia St., Tomas Morato, Quezon City',
    coverImage: 'DH',
    reservationDeposit: 500, // ₱500 deposit applied to dining bill
    categories: ['Best Sellers', 'Grilled Mains', 'Silog & Rice', 'Soups', 'Desserts & Beverages'],
    menu: [
      {
        id: 'dh-1',
        name: 'Inasal na Manok (Quarter Leg)',
        description: 'Bacolod-style charbroiled chicken basted in annatto-calamansi glaze, served with chicken oil and sinamak vinegar.',
        price: 195,
        category: 'Best Sellers',
        isAvailable: true,
        image: 'I',
        addOns: [
          {
            name: 'Choice of Rice',
            required: true,
            options: [
              { name: 'Steamed Garlic Rice', price: 0 },
              { name: 'Annatto Inasal Rice', price: 20 },
              { name: 'Java Rice', price: 25 },
            ],
          },
          {
            name: 'Add-ons',
            required: false,
            options: [
              { name: 'Extra Chicken Oil bottle (50ml)', price: 35 },
              { name: 'Ensaladang Talong side', price: 65 },
              { name: 'Fried Atchara', price: 30 },
            ],
          },
        ],
      },
      {
        id: 'dh-2',
        name: 'Crispy Pork Belly Liempo',
        description: 'Thick-cut pork belly roasted with lemongrass and garlic then deep-fried to crackling perfection.',
        price: 320,
        category: 'Best Sellers',
        isAvailable: true,
        image: 'L',
        addOns: [
          {
            name: 'Dip Selection',
            required: true,
            options: [
              { name: 'Spicy Sukang Iloko', price: 0 },
              { name: 'Classic Sweet Liver Sauce', price: 0 },
            ],
          },
        ],
      },
      {
        id: 'dh-3',
        name: 'Sinigang na Hipon sa Sampalok',
        description: 'Plump black tiger prawns in a tangy tamarind broth with kangkong, radish, and finger chili.',
        price: 380,
        category: 'Soups',
        isAvailable: true,
        image: 'S',
      },
      {
        id: 'dh-4',
        name: 'Sizzling Sisig Kapampangan',
        description: 'Crispy minced pork jowl with red onions, calamansi, and fresh bird’s eye chili on a hot plate.',
        price: 260,
        category: 'Grilled Mains',
        isAvailable: true,
        image: 'S',
      },
      {
        id: 'dh-5',
        name: 'Halo-Halo Especial',
        description: 'Crushed ice with homemade leche flan, ube halaya, sweetened macapuno, and pinipig.',
        price: 145,
        category: 'Desserts & Beverages',
        isAvailable: false, // Sold out demonstration
        image: 'H',
      },
    ],
  },
  {
    id: 'manila-artisan-pizza',
    name: 'Manila Artisan Pizza & Pasta',
    tagline: 'Hand-stretched sourdough pizzas & fresh handmade pasta',
    cuisine: 'Pizza & Pasta · Italian-Filipino',
    rating: 4.8,
    reviewCount: 980,
    deliveryTime: '30–45 min',
    deliveryFee: 59,
    minOrder: 250,
    isOpen: true,
    operatingHours: '11:00 AM – 11:00 PM',
    address: 'High Street South Block, BGC, Taguig City',
    coverImage: 'MP',
    reservationDeposit: 600,
    categories: ['Pizzas', 'Pasta', 'Sides & Drinks'],
    menu: [
      {
        id: 'mp-1',
        name: 'Truffle & 4-Cheese Sourdough Pizza (12")',
        description: 'Fior di latte, gorgonzola, parmesan, fontina, and black truffle crema over 48-hour fermented crust.',
        price: 520,
        category: 'Pizzas',
        isAvailable: true,
        image: 'P',
        addOns: [
          {
            name: 'Crust Finish',
            required: true,
            options: [
              { name: 'Hot Honey Drizzle', price: 30 },
              { name: 'Garlic Butter Herb Crust', price: 40 },
              { name: 'Classic Crust', price: 0 },
            ],
          },
        ],
      },
      {
        id: 'mp-2',
        name: 'Longganisa Carbonara Handmade Fettuccine',
        description: 'Sweet and garlicky Lucban longganisa, egg yolk, pecorino romano, and cracked black pepper.',
        price: 360,
        category: 'Pasta',
        isAvailable: true,
        image: 'F',
      },
      {
        id: 'mp-3',
        name: 'Crispy Calamari Fritti',
        description: 'Flash-fried squid rings served with roasted garlic aioli and fresh lemon wedges.',
        price: 290,
        category: 'Sides & Drinks',
        isAvailable: true,
        image: 'C',
      },
    ],
  },
  {
    id: 'calle-silog',
    name: 'Calle Crisologo All-Day Silog',
    tagline: 'Vigan garlic longganisa & comfort Filipino breakfasts',
    cuisine: 'Filipino · Breakfast & Bowls',
    rating: 4.7,
    reviewCount: 2150,
    deliveryTime: '15–25 min',
    deliveryFee: 39,
    minOrder: 100,
    isOpen: true,
    operatingHours: '6:00 AM – 10:00 PM',
    address: '88 Katipunan Ave., Loyola Heights, Quezon City',
    coverImage: 'CS',
    reservationDeposit: 300,
    categories: ['Silog Specials', 'Breakfast Platters', 'Beverages'],
    menu: [
      {
        id: 'cs-1',
        name: 'Vigan Longsilog Supreme',
        description: 'Two pieces authentic garlicky Vigan longganisa, double fried garlic rice, and sunny-side-up egg.',
        price: 165,
        category: 'Silog Specials',
        isAvailable: true,
        image: 'V',
        addOns: [
          {
            name: 'Egg Preparation',
            required: true,
            options: [
              { name: 'Sunny Side Up (Crispy Edges)', price: 0 },
              { name: 'Well Done', price: 0 },
              { name: 'Scrambled Soft', price: 0 },
            ],
          },
          {
            name: 'Extras',
            required: false,
            options: [
              { name: 'Extra Longganisa (1pc)', price: 50 },
              { name: 'Extra Garlic Rice', price: 35 },
            ],
          },
        ],
      },
      {
        id: 'cs-2',
        name: 'Tapsilog Marikina Tender',
        description: 'Marinated beef sirloin strips caramelized with garlic and vinegar.',
        price: 185,
        category: 'Silog Specials',
        isAvailable: true,
        image: 'T',
      },
      {
        id: 'cs-3',
        name: 'Kapeng Barako Batangas Brew (Hot)',
        description: 'Freshly brewed strong native Liberica coffee.',
        price: 75,
        category: 'Beverages',
        isAvailable: true,
        image: 'K',
      },
    ],
  },
];

export const INITIAL_ADDRESSES = [
  {
    id: 'addr-1',
    label: 'Home',
    recipientName: 'Cassidy Santos',
    phone: '09171234567',
    street: 'Unit 12B, Emerald Court, San Antonio',
    city: 'Pasig City',
    isDefault: true,
    notes: 'Ring the doorbell at unit 12B. Gate is unlocked.',
  },
  {
    id: 'addr-2',
    label: 'Office',
    recipientName: 'Cassidy Santos (Work)',
    phone: '09171234567',
    street: '18th Floor, Cyber Sigma Tower, Lawton Ave',
    city: 'Taguig City (BGC)',
    isDefault: false,
    notes: 'Leave with 18F reception desk.',
  },
];

export const INITIAL_ORDERS = [
  {
    id: 'ORD-9821',
    createdAt: '2026-11-05 19:40:00',
    totalAmount: 665,
    paymentMethod: 'Cash on Delivery (COD)',
    paymentStatus: 'Paid on Delivery',
    overallStatus: 'Out for Delivery',
    subOrders: [
      {
        id: 'SUB-9821-A',
        restaurantId: 'dalisay-heritage',
        restaurantName: 'Dalisay Heritage Grill',
        deliveryAddress: 'Unit 12B, Emerald Court, Pasig City (Home)',
        fulfillment: 'delivery',
        deliveryFee: 49,
        status: 'Out for Delivery',
        rider: {
          name: 'Kuya Juan Dela Cruz',
          vehicle: 'Yamaha NMAX (Plate 123-NCR)',
          phone: '09191234567',
          eta: '12 min away',
        },
        items: [
          { name: 'Inasal na Manok (Quarter Leg)', qty: 2, price: 195, addOns: ['Annatto Inasal Rice (+₱20)'] },
        ],
        subtotal: 430,
      },
      {
        id: 'SUB-9821-B',
        restaurantId: 'calle-silog',
        restaurantName: 'Calle Crisologo All-Day Silog',
        deliveryAddress: 'Unit 12B, Emerald Court, Pasig City (Home)',
        fulfillment: 'delivery',
        deliveryFee: 39,
        status: 'Preparing',
        rider: {
          name: 'Assigning rider soon...',
          vehicle: '-',
          phone: '-',
          eta: 'Preparing in kitchen',
        },
        items: [
          { name: 'Vigan Longsilog Supreme', qty: 1, price: 165, addOns: ['Sunny Side Up'] },
        ],
        subtotal: 165,
      },
    ],
  },
];

export const INITIAL_RESERVATIONS = [
  {
    id: 'RES-4012',
    restaurantId: 'dalisay-heritage',
    restaurantName: 'Dalisay Heritage Grill & Bistro',
    date: '2026-11-14',
    time: '7:30 PM',
    guests: 4,
    seatingArea: 'Indoor Main Dining',
    depositAmount: 500,
    serviceFee: 50,
    totalPaid: 550,
    status: 'Confirmed',
    cancellationDeadline: '2026-11-13 7:30 PM (24h before)',
    specialRequests: 'Near window if possible. Celebrating a birthday.',
  },
];

export const INITIAL_FAVORITES = ['dalisay-heritage', 'manila-artisan-pizza'];

export const INITIAL_NOTIFICATIONS = [
  {
    id: 'notif-1',
    type: 'order',
    title: 'Your order is on the way',
    description: 'Dalisay Heritage Grill is preparing your food and rider assignment is in progress.',
    time: '3 minutes ago',
    read: false,
  },
  {
    id: 'notif-2',
    type: 'reservation',
    title: 'Reservation confirmation',
    description: 'Your table at Dalisay Heritage Grill has been confirmed for Friday at 7:30 PM.',
    time: 'Today, 9:15 AM',
    read: true,
  },
  {
    id: 'notif-3',
    type: 'promo',
    title: 'Weekend meal deal',
    description: 'Enjoy ₱150 off on selected Filipino combos when you order before 11:59 PM.',
    time: 'Yesterday',
    read: false,
  },
];

const ensureSingleDefaultAddress = (addresses, preferredId = null) => {
  const next = addresses.map((address) => ({ ...address, isDefault: false }));
  const fallbackId = preferredId || next.find((address) => address.isDefault)?.id || next[0]?.id || null;

  if (fallbackId) {
    const target = next.find((address) => address.id === fallbackId);
    if (target) {
      target.isDefault = true;
    }
  }

  return next;
};

export const customerService = {
  // Restaurants
  async getRestaurants() {
    try {
      const res = await apiClient.get('/customer/restaurants');
      return res?.data || INITIAL_RESTAURANTS;
    } catch {
      return INITIAL_RESTAURANTS;
    }
  },

  async getRestaurantById(id) {
    try {
      const res = await apiClient.get(`/customer/restaurants/${id}`);
      return res?.data || INITIAL_RESTAURANTS.find((r) => r.id === id);
    } catch {
      return INITIAL_RESTAURANTS.find((r) => r.id === id);
    }
  },

  // Saved Addresses
  getSavedAddresses() {
    try {
      const stored = localStorage.getItem('salo_addresses');
      return stored ? JSON.parse(stored) : INITIAL_ADDRESSES;
    } catch {
      return INITIAL_ADDRESSES;
    }
  },

  saveAddress(newAddress) {
    const addresses = this.getSavedAddresses();
    const newId = newAddress.id || `addr-${Date.now()}`;
    const existingDefaultId = addresses.find((address) => address.isDefault)?.id;
    const isEditingDefault = newId === existingDefaultId;
    const shouldSetDefault = Boolean(newAddress.isDefault) || addresses.length === 0 || isEditingDefault;

    const next = [
      ...addresses.filter((address) => address.id !== newId),
      { ...newAddress, id: newId, isDefault: false },
    ];

    const final = ensureSingleDefaultAddress(next, shouldSetDefault ? newId : existingDefaultId || next[0]?.id || null);
    localStorage.setItem('salo_addresses', JSON.stringify(final));
    return final;
  },

  updateAddress(addressId, nextAddressData) {
    const addresses = this.getSavedAddresses();
    const currentAddress = addresses.find((address) => address.id === addressId);
    if (!currentAddress) return addresses;

    const existingDefaultId = addresses.find((address) => address.isDefault)?.id;
    const next = addresses
      .filter((address) => address.id !== addressId)
      .map((address) => ({ ...address, isDefault: false }));

    const updated = {
      ...currentAddress,
      ...nextAddressData,
      id: addressId,
      isDefault: Boolean(nextAddressData.isDefault),
      phone: String(nextAddressData.phone ?? currentAddress.phone ?? '').trim(),
      recipientName: String(nextAddressData.recipientName ?? currentAddress.recipientName ?? '').trim(),
      street: String(nextAddressData.street ?? currentAddress.street ?? '').trim(),
      city: String(nextAddressData.city ?? currentAddress.city ?? '').trim(),
      notes: String(nextAddressData.notes ?? currentAddress.notes ?? '').trim(),
    };

    const fallbackDefaultId = updated.isDefault ? addressId : existingDefaultId || next[0]?.id || null;
    const final = ensureSingleDefaultAddress([...next, { ...updated, isDefault: false }], fallbackDefaultId);
    localStorage.setItem('salo_addresses', JSON.stringify(final));
    return final;
  },

  deleteAddress(addressId) {
    const addresses = this.getSavedAddresses();
    const next = addresses.filter((address) => address.id !== addressId);

    if (next.length === 0) {
      localStorage.removeItem('salo_addresses');
      return [];
    }

    const deletedWasDefault = addresses.find((address) => address.id === addressId)?.isDefault;
    const fallbackDefaultId = deletedWasDefault ? next[0].id : next.find((address) => address.isDefault)?.id || next[0].id;
    const final = ensureSingleDefaultAddress(next, fallbackDefaultId);
    localStorage.setItem('salo_addresses', JSON.stringify(final));
    return final;
  },

  getDefaultAddress() {
    const addresses = this.getSavedAddresses();
    return addresses.find((address) => address.isDefault) || addresses[0] || null;
  },

  setDefaultAddress(addressId) {
    const addresses = this.getSavedAddresses();
    const updated = addresses.map((address) => ({
      ...address,
      isDefault: address.id === addressId,
    }));
    localStorage.setItem('salo_addresses', JSON.stringify(updated));
    return updated;
  },

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
    localStorage.setItem('salo_recent_searches', JSON.stringify(next));
    return next;
  },

  // Orders
  getOrders() {
    try {
      const stored = localStorage.getItem('salo_orders');
      return stored ? JSON.parse(stored) : INITIAL_ORDERS;
    } catch {
      return INITIAL_ORDERS;
    }
  },

  createOrder(orderPayload) {
    const orders = this.getOrders();
    const newOrder = {
      ...orderPayload,
      id: `ORD-${Math.floor(1000 + Math.random() * 9000)}`,
      createdAt: new Date().toISOString().replace('T', ' ').substring(0, 19),
      overallStatus: 'Pending Confirmation',
    };
    const updated = [newOrder, ...orders];
    localStorage.setItem('salo_orders', JSON.stringify(updated));
    return newOrder;
  },

  cancelOrder(orderId, reason = 'Customer requested cancellation') {
    const orders = this.getOrders();
    const updated = orders.map((ord) => {
      if (ord.id === orderId) {
        return {
          ...ord,
          overallStatus: 'Cancelled',
          cancellationReason: reason,
          cancelledAt: new Date().toISOString(),
          subOrders: ord.subOrders.map((so) => ({ ...so, status: 'Cancelled' })),
        };
      }
      return ord;
    });
    localStorage.setItem('salo_orders', JSON.stringify(updated));
    return updated;
  },

  // Reservations
  getReservations() {
    try {
      const stored = localStorage.getItem('salo_reservations');
      return stored ? JSON.parse(stored) : INITIAL_RESERVATIONS;
    } catch {
      return INITIAL_RESERVATIONS;
    }
  },

  createReservation(reservationPayload) {
    const reservations = this.getReservations();
    const newReservation = {
      ...reservationPayload,
      id: `RES-${Math.floor(1000 + Math.random() * 9000)}`,
      status: 'Confirmed',
      createdAt: new Date().toISOString(),
    };
    const updated = [newReservation, ...reservations];
    localStorage.setItem('salo_reservations', JSON.stringify(updated));
    return newReservation;
  },

  cancelReservation(reservationId) {
    const reservations = this.getReservations();
    const updated = reservations.map((res) => {
      if (res.id === reservationId) {
        return {
          ...res,
          status: 'Cancelled',
          cancelledAt: new Date().toISOString(),
        };
      }
      return res;
    });
    localStorage.setItem('salo_reservations', JSON.stringify(updated));
    return updated;
  },

  // Favorites
  getFavoriteRestaurants() {
    try {
      const stored = localStorage.getItem('salo_favorites');
      return stored ? JSON.parse(stored) : INITIAL_FAVORITES;
    } catch {
      return INITIAL_FAVORITES;
    }
  },

  toggleFavoriteRestaurant(restaurantId) {
    const favorites = this.getFavoriteRestaurants();
    const next = favorites.includes(restaurantId)
      ? favorites.filter((id) => id !== restaurantId)
      : [...favorites, restaurantId];
    localStorage.setItem('salo_favorites', JSON.stringify(next));
    window.dispatchEvent(new Event('salo:favoritesUpdated'));
    return next;
  },

  // Notifications
  getNotifications() {
    try {
      const stored = localStorage.getItem('salo_notifications');
      return stored ? JSON.parse(stored) : INITIAL_NOTIFICATIONS;
    } catch {
      return INITIAL_NOTIFICATIONS;
    }
  },

  markNotificationRead(notificationId) {
    const notifications = this.getNotifications();
    const updated = notifications.map((item) => (
      item.id === notificationId ? { ...item, read: true } : item
    ));
    localStorage.setItem('salo_notifications', JSON.stringify(updated));
    window.dispatchEvent(new Event('salo:notificationsUpdated'));
    return updated;
  },

  clearNotifications() {
    localStorage.setItem('salo_notifications', JSON.stringify([]));
    window.dispatchEvent(new Event('salo:notificationsUpdated'));
    return [];
  },
};

export default customerService;
