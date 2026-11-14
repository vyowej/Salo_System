/**
 * SALO — Customer Service
 * Handles data for restaurants, menus, reservations, orders, and addresses.
 * Ready for Laravel backend endpoints with rich mock dataset for seamless UI experience.
 */

import restaurantService from './restaurantService';
import addressService from './addressService';

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
    createdAt: new Date(Date.now() - 3 * 60 * 1000).toISOString(),
    href: '/customer/orders?tab=upcoming',
    read: false,
  },
  {
    id: 'notif-2',
    type: 'reservation',
    title: 'Reservation confirmation',
    description: 'Your table at Dalisay Heritage Grill has been confirmed for Friday at 7:30 PM.',
    time: 'Today, 9:15 AM',
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    href: '/customer/reservations',
    read: true,
  },
  {
    id: 'notif-3',
    type: 'promo',
    title: 'Weekend meal deal',
    description: 'Enjoy ₱150 off on selected Filipino combos when you order before 11:59 PM.',
    time: 'Yesterday',
    createdAt: new Date(Date.now() - 28 * 60 * 60 * 1000).toISOString(),
    href: '/customer',
    read: false,
  },
  {
    id: 'notif-4',
    type: 'invitation',
    title: 'Restaurant team invitation',
    description: 'You received a staff invitation from Casa Reyes Bistro.',
    time: '2 days ago',
    createdAt: new Date(Date.now() - 52 * 60 * 60 * 1000).toISOString(),
    href: '/customer/invitations',
    read: false,
  },
];

const _ensureSingleDefaultAddress = (addresses, preferredId = null) => {
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
    return restaurantService.getRestaurants();
  },

  async getRestaurantById(id) {
    return restaurantService.getRestaurant(id);
  },

  // Saved Addresses (delegated to addressService as single source of truth)
  getSavedAddresses() {
    return addressService.getAddresses();
  },

  saveAddress(newAddress) {
    if (newAddress.id && addressService.getAddresses().some((a) => a.id === newAddress.id)) {
      addressService.updateAddress(newAddress.id, newAddress);
    } else {
      addressService.addAddress(newAddress);
    }
    return addressService.getAddresses();
  },

  updateAddress(addressId, nextAddressData) {
    addressService.updateAddress(addressId, nextAddressData);
    return addressService.getAddresses();
  },

  deleteAddress(addressId) {
    return addressService.deleteAddress(addressId);
  },

  getDefaultAddress() {
    return addressService.getDefaultAddress();
  },

  setDefaultAddress(addressId) {
    return addressService.setDefaultAddress(addressId);
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
    return restaurantService.getCustomerOrders(INITIAL_ORDERS);
  },

  createOrder(orderPayload) {
    return restaurantService.createCustomerOrder(orderPayload, INITIAL_ORDERS);
  },

  cancelOrder(orderId, reason = 'Customer requested cancellation') {
    return restaurantService.requestOrderCancellation(orderId, reason, INITIAL_ORDERS);
  },

  // Reservations
  getReservations() {
    return restaurantService.getCustomerReservations();
  },

  createReservation(reservationPayload) {
    return restaurantService.createCustomerReservation({
      ...reservationPayload,
      guestName: reservationPayload.guestName || reservationPayload.customerName || 'Guest',
      guestEmail: reservationPayload.guestEmail || reservationPayload.customerEmail || '',
      guestPhone: reservationPayload.guestPhone || reservationPayload.customerPhone || '',
      partySize: Number(reservationPayload.partySize ?? reservationPayload.guests ?? 2),
      guests: Number(reservationPayload.guests ?? reservationPayload.partySize ?? 2),
      status: 'Pending',
    });
  },

  cancelReservation(reservationId) {
    restaurantService.cancelCustomerReservation(reservationId);
    return this.getReservations();
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

  markNotificationUnread(notificationId) {
    const notifications = this.getNotifications();
    const updated = notifications.map((item) => (
      item.id === notificationId ? { ...item, read: false } : item
    ));
    localStorage.setItem('salo_notifications', JSON.stringify(updated));
    window.dispatchEvent(new Event('salo:notificationsUpdated'));
    return updated;
  },

  markAllNotificationsRead() {
    const notifications = this.getNotifications();
    const updated = notifications.map((item) => ({ ...item, read: true }));
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
