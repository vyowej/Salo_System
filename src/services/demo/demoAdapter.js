import { DEMO_SEED } from './seedData.js';
import { createStockAdjustment, createStockMovement, classifyInventoryItem, validateStockQuantity } from './inventoryRules.js';
import { deriveTableStatus, getTableEditConflicts, getTableReservations } from './tableRules.js';
import {
  createDefaultOperatingHours,
  createOperatingDateTime,
  formatOperatingHours,
  isRestaurantOpen,
  normalizeOperatingHours,
  validateOperatingHours,
} from './operatingHours.js';

const STORAGE_KEY = 'salo_demo_store_v1';
const IMAGE_DB_NAME = 'salo_demo_images';
const IMAGE_STORE_NAME = 'images';
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MIN_IMAGE_DIMENSION = 300;
// TODO: Replace this demo default when the reservation duration policy is approved in RESTAURANT_SIDE.md §20.
export const RESERVATION_DURATION_MINUTES = DEMO_SEED.reservationDurationMinutes;
// TODO: Replace the demo inventory expiration threshold after policy is decided in RESTAURANT_SIDE.md §20.
export const INVENTORY_EXPIRING_SOON_DAYS = DEMO_SEED.inventoryExpiringSoonDays;
const memoryStorage = new Map();
const imageUrlCache = new Map();

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function storedImage(image) {
  if (!image?.id) return null;
  return {
    id: image.id,
    name: image.name || '',
    type: image.type || '',
    size: image.size || 0,
    width: image.width || 0,
    height: image.height || 0,
    alt: image.alt || '',
  };
}

function profileImageSummary(image) {
  return image ? { id: image.id, alt: image.alt || '' } : null;
}

function profileSnapshot(restaurant) {
  return {
    name: restaurant.name,
    description: restaurant.description ?? restaurant.bio ?? '',
    cuisine: restaurant.cuisine || '',
    foodCategories: clone(restaurant.foodCategories || restaurant.categories || []),
    contactEmail: restaurant.contactEmail || '',
    phone: restaurant.phone || '',
    address: restaurant.address || '',
    location: clone(restaurant.location || {}),
    deliveryCoverage: clone(restaurant.deliveryCoverage || {}),
    fulfillment: clone(restaurant.fulfillment || {}),
    logoImage: profileImageSummary(restaurant.logoImage),
    coverPhoto: profileImageSummary(restaurant.coverPhoto),
    profilePhotos: (restaurant.profilePhotos || []).map(profileImageSummary),
  };
}

function normalizedProfilePatch(data) {
  const patch = {};
  const fields = [
    'name',
    'description',
    'bio',
    'cuisine',
    'foodCategories',
    'contactEmail',
    'phone',
    'address',
    'location',
    'deliveryCoverage',
    'fulfillment',
  ];

  fields.forEach((field) => {
    if (Object.hasOwn(data, field)) patch[field] = clone(data[field]);
  });

  if (Object.hasOwn(data, 'logoImage')) patch.logoImage = storedImage(data.logoImage);
  if (Object.hasOwn(data, 'coverPhoto')) patch.coverPhoto = storedImage(data.coverPhoto);
  if (Object.hasOwn(data, 'profilePhotos')) {
    patch.profilePhotos = data.profilePhotos.map(storedImage).filter(Boolean);
  }
  return patch;
}

function normalizedMenuItemPatch(data) {
  const patch = clone(data);
  if (Object.hasOwn(data, 'photo')) patch.photo = storedImage(data.photo);
  return patch;
}

function getStorage() {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch (error) {
    throw new Error(`Demo storage is unavailable: ${error.message}`, { cause: error });
  }
}

function readStore() {
  const storage = getStorage();
  const raw = storage ? storage.getItem(STORAGE_KEY) : memoryStorage.get(STORAGE_KEY);
  if (!raw) return clone(DEMO_SEED);

  try {
    const store = JSON.parse(raw);
    store.reservationDurationMinutes ||= DEMO_SEED.reservationDurationMinutes;
    store.inventoryExpiringSoonDays ??= DEMO_SEED.inventoryExpiringSoonDays;
    store.restaurants = (store.restaurants || []).map((restaurant) => {
      const seedRestaurant = DEMO_SEED.restaurants.find((seed) => seed.id === restaurant.id);
      const seedMenuItems = new Map((seedRestaurant?.menu || []).map((item) => [item.id, item]));
      const menu = (restaurant.menu || []).map((item) => {
        const seedItem = seedMenuItems.get(item.id);
        if (seedItem && Object.hasOwn(seedItem, 'stockQuantity') && !Object.hasOwn(item, 'stockQuantity')) {
          return { ...item, stockQuantity: seedItem.stockQuantity };
        }
        return item;
      });
      return {
        ...restaurant,
        operatingSchedule: normalizeOperatingHours(restaurant.operatingSchedule || seedRestaurant?.operatingSchedule || createDefaultOperatingHours()),
        menu,
        diningAreas: restaurant.diningAreas || clone(seedRestaurant?.diningAreas || []),
        tables: (restaurant.tables || seedRestaurant?.tables || []).map((table) => ({
          ...table,
          number: table.number ?? String(table.name || '').replace(/\D/g, ''),
          description: table.description || '',
          availability: table.availability || (table.status === 'Unavailable' ? 'unavailable' : 'available'),
        })),
        inventoryDeductionMode: restaurant.inventoryDeductionMode || seedRestaurant?.inventoryDeductionMode || 'manual',
        inventoryItems: restaurant.inventoryItems || clone(seedRestaurant?.inventoryItems || []),
        inventoryMovements: restaurant.inventoryMovements || [],
        reservations: (restaurant.reservations || []).map((reservation) => normalizeReservation(reservation, restaurant.id)),
      };
    });
    store.staffMemberships ||= clone(DEMO_SEED.staffMemberships);
    DEMO_SEED.staffMemberships.forEach((seedMembership) => {
      if (!store.staffMemberships.some((membership) => membership.id === seedMembership.id)) {
        store.staffMemberships.push(clone(seedMembership));
      }
    });
    const reservationHandler = store.staffMemberships.find((membership) => membership.id === 'staff-2');
    if (reservationHandler) {
      reservationHandler.permissions ||= [];
      if (!reservationHandler.permissions.includes('tables.view')) reservationHandler.permissions.push('tables.view');
    }
    return store;
  } catch (error) {
    throw new Error(`Demo store data is invalid: ${error.message}`, { cause: error });
  }
}

function writeStore(store) {
  const raw = JSON.stringify(store);
  const storage = getStorage();
  if (storage) {
    storage.setItem(STORAGE_KEY, raw);
  } else {
    memoryStorage.set(STORAGE_KEY, raw);
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('salo:demoStoreUpdated'));
  }
}

function updateStore(update) {
  const store = readStore();
  const result = update(store);
  writeStore(store);
  return clone(result);
}

const RESERVATION_ACTION_PERMISSION = Object.freeze({
  view: 'reservations.view',
  approve: 'reservations.approve',
  reject: 'reservations.reject',
  assignTables: 'reservations.assignTables',
  updateStatus: 'reservations.updateStatus',
  manageArrival: 'reservations.manageArrival',
});

export function canPerformReservationAction(user, memberships, restaurantId, action) {
  const permission = RESERVATION_ACTION_PERMISSION[action];
  if (!permission || !user || !restaurantId) return false;
  const ownsRestaurant = (memberships?.ownershipMemberships || []).some((membership) => (
    membership.restaurantId === restaurantId
    && membership.status === 'approved'
    && (String(membership.userId) === String(user.id) || membership.userEmail?.toLowerCase() === user.email?.toLowerCase())
  ));
  if (ownsRestaurant) return true;
  return (memberships?.staffMemberships || []).some((membership) => (
    membership.restaurantId === restaurantId
    && membership.status === 'active'
    && (String(membership.userId) === String(user.id) || membership.userEmail?.toLowerCase() === user.email?.toLowerCase())
    && membership.permissions?.includes(permission)
  ));
}

function assertReservationPermission(store, restaurantId, action) {
  const user = readSignedInUser();
  const memberships = {
    ownershipMemberships: store.ownershipMemberships || [],
    staffMemberships: store.staffMemberships || [],
  };
  if (!canPerformReservationAction(user, memberships, restaurantId, action)) {
    throw new Error(`You do not have permission to ${action} reservations for this restaurant.`);
  }
}

const SERVICE_PERMISSION_ACTION = Object.freeze({
    'business.hours.manage': 'manage operating hours',
    'tables.view': 'view tables',
    'tables.add': 'add tables',
    'tables.edit': 'edit tables',
    'tables.manageAvailability': 'change table availability',
    'inventory.view': 'view inventory',
    'inventory.addStock': 'add stock',
    'inventory.deductStock': 'deduct stock',
    'inventory.adjustStock': 'adjust stock',
    'inventory.viewHistory': 'view stock history',
  });

export function canPerformRestaurantAction(user, memberships, restaurantId, permission) {
    if (!SERVICE_PERMISSION_ACTION[permission] || !user || !restaurantId) return false;
    const isOwner = (memberships?.ownershipMemberships || []).some((membership) => (
      membership.restaurantId === restaurantId
      && membership.status === 'approved'
      && (String(membership.userId) === String(user.id) || membership.userEmail?.toLowerCase() === user.email?.toLowerCase())
    ));
    if (isOwner) return true;
    return (memberships?.staffMemberships || []).some((membership) => (
      membership.restaurantId === restaurantId
      && membership.status === 'active'
      && (String(membership.userId) === String(user.id) || membership.userEmail?.toLowerCase() === user.email?.toLowerCase())
      && membership.permissions?.includes(permission)
    ));
  }

function assertServicePermission(store, restaurantId, permission) {
    const memberships = {
      ownershipMemberships: store.ownershipMemberships || [],
      staffMemberships: store.staffMemberships || [],
    };
    if (!canPerformRestaurantAction(readSignedInUser(), memberships, restaurantId, permission)) {
      throw new Error(`You do not have permission to ${SERVICE_PERMISSION_ACTION[permission] || 'perform this action'} for this restaurant.`);
    }
  }

function menuStockStatus(item, quantity) {
    const currentAvailability = item.availability || (item.isAvailable === false ? 'sold_out' : 'available');
    if (quantity <= 0) {
      return {
        stockOutOfStock: true,
        availabilityBeforeStockOut: item.stockOutOfStock
          ? item.availabilityBeforeStockOut || 'available'
          : currentAvailability === 'sold_out' ? 'available' : currentAvailability,
        availability: 'sold_out',
        isAvailable: false,
      };
    }
    if (item.stockOutOfStock) {
      const availability = item.availabilityBeforeStockOut || 'available';
      return { stockOutOfStock: false, availabilityBeforeStockOut: null, availability, isAvailable: availability === 'available' };
    }
    return { stockOutOfStock: false };
  }

function addMenuStockMovement(restaurant, item, type, before, after, reason = '') {
    const movement = {
      id: `move-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      itemId: item.id,
      itemName: item.name,
      menuItemId: item.id,
      type,
      quantity: after - before,
      before,
      after,
      date: new Date().toISOString(),
      responsibleUser: readSignedInUser()?.name || readSignedInUser()?.username || 'Unknown user',
      reason,
    };
    restaurant.inventoryMovements ||= [];
    restaurant.inventoryMovements.unshift(movement);
    return movement;
  }

function applyCompletedOrderDeduction(store, restaurant, order) {
    if (restaurant.inventoryDeductionMode !== 'on_completion' || order.inventoryDeductedAt) return [];
    const quantities = new Map();
    (order.items || []).forEach((line) => {
      const menuItem = restaurant.menu.find((item) => (
        item.id === (line.menuItemId || line.itemId || line.id)
        || (line.name && item.name === line.name)
      ));
      if (menuItem?.stockQuantity === null || menuItem?.stockQuantity === undefined || menuItem.stockQuantity === '') return;
      const quantity = Number(line.qty ?? line.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0) throw new Error(`Order quantity for ${menuItem.name} is invalid.`);
      quantities.set(menuItem.id, (quantities.get(menuItem.id) || 0) + quantity);
    });

    const planned = [...quantities].map(([menuItemId, quantity]) => {
      const item = restaurant.menu.find((entry) => entry.id === menuItemId);
      const current = validateStockQuantity(item.stockQuantity, `${item.name} stock`);
      if (current < quantity) throw new Error(`Not enough ${item.name} stock to complete this order.`);
      return { item, quantity, before: current, after: current - quantity };
    });
    const movements = planned.map(({ item, before, after, quantity }) => {
      item.stockQuantity = after;
      Object.assign(item, menuStockStatus(item, after));
      return addMenuStockMovement(restaurant, item, 'deducted', before, after, `Completed order ${order.orderReference || order.id} (${quantity} sold)`);
    });
    order.inventoryDeductedAt = new Date().toISOString();
    return movements;
  }
export const RESERVATION_STATUS_TRANSITIONS = Object.freeze({
  Pending: ['Approved', 'Rejected', 'Cancelled'],
  Approved: ['Awaiting Payment', 'Confirmed', 'Cancelled'],
  'Awaiting Payment': ['Confirmed', 'Cancelled'],
  Confirmed: ['Arrived', 'Cancelled'],
  Arrived: ['Seated', 'No-Show'],
  Seated: ['Completed'],
  Completed: [],
  Cancelled: [],
  Rejected: [],
  'No-Show': [],
  Expired: [],
});

export function canTransitionReservationStatus(from, to) {
  return Boolean(RESERVATION_STATUS_TRANSITIONS[from]?.includes(to));
}

function parseReservationTime(value) {
  if (!value) return 0;
  const match = /^\s?(\d{1,2}):(\d{2})\s*(AM|PM)\s*$/i.exec(String(value).trim());
  if (!match) return 0;
  const [, hours, minutes, meridiem] = match;
  let hour = Number(hours);
  if (meridiem.toUpperCase() === 'PM' && hour !== 12) hour += 12;
  if (meridiem.toUpperCase() === 'AM' && hour === 12) hour = 0;
  return hour * 60 + Number(minutes);
}

function normalizeReservation(reservation = {}, restaurantIdOverride = null) {
  const restaurantId = reservation.restaurantId || restaurantIdOverride || null;
  return {
    id: reservation.id || `RES-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    restaurantId,
    restaurantName: reservation.restaurantName || '',
    guestName: reservation.guestName || reservation.customerName || 'Guest',
    guestEmail: reservation.guestEmail || reservation.customerEmail || '',
    guestPhone: reservation.guestPhone || reservation.customerPhone || '',
    date: reservation.date || '',
    time: reservation.time || '',
    partySize: Number(reservation.partySize ?? reservation.guests ?? 2),
    guests: Number(reservation.guests ?? reservation.partySize ?? 2),
    assignedTable: reservation.assignedTable || null,
    seatingArea: reservation.seatingArea || reservation.area || 'Main Dining Hall',
    specialRequests: reservation.specialRequests || '',
    depositAmount: Number(reservation.depositAmount ?? 0),
    serviceFee: Number(reservation.serviceFee ?? 0),
    totalPaid: Number(reservation.totalPaid ?? (reservation.paymentStatus === 'Paid' ? reservation.depositAmount ?? 0 : 0)),
    paymentStatus: reservation.paymentStatus || 'Pending',
    status: reservation.status || 'Pending',
    statusHistory: Array.isArray(reservation.statusHistory) ? reservation.statusHistory : [{ status: reservation.status || 'Pending', timestamp: new Date().toISOString() }],
    createdAt: reservation.createdAt || new Date().toISOString(),
    submittedAt: reservation.submittedAt || reservation.createdAt || new Date().toISOString(),
    updatedAt: reservation.updatedAt || reservation.createdAt || new Date().toISOString(),
    cancellationDeadline: reservation.cancellationDeadline || null,
    paymentMethod: reservation.paymentMethod || '',
    paymentReference: reservation.paymentReference || '',
    paymentDeadline: reservation.paymentDeadline || null,
    refundStatus: reservation.refundStatus || null,
    cancellationRequest: reservation.cancellationRequest || null,
    tableConfirmedAt: reservation.tableConfirmedAt || null,
    rejectionReason: reservation.rejectionReason || '',
    reviewedAt: reservation.reviewedAt || null,
    reference: reservation.reference || reservation.id || '',
    fee: reservation.fee ?? reservation.depositAmount ?? reservation.totalPaid ?? null,
  };
}

function getRestaurantTables(restaurantId, store = readStore()) {
  const restaurant = findRestaurant(restaurantId, store);
  return Array.isArray(restaurant?.tables) ? restaurant.tables : [];
}

function getReservationDateTime(date, time) {
  const parsedMinutes = parseReservationTime(time);
  const exactDate = new Date(`${date}T00:00:00`);
  const value = new Date(exactDate.getTime());
  value.setHours(Math.floor(parsedMinutes / 60), parsedMinutes % 60, 0, 0);
  return value;
}

function isTableAvailableForReservation(restaurantId, reservation, store = readStore()) {
  const candidate = reservation.assignedTable;
  if (!candidate) return true;
  const tables = getRestaurantTables(restaurantId, store);
  const table = tables.find((entry) => entry.id === candidate.id || entry.name === candidate.name || entry.id === candidate || entry.name === candidate);
  if (!table) return false;
  if (['Unavailable', 'Maintenance'].includes(table.status) || table.availability === 'unavailable') return false;
  const targetGuests = Number(reservation.partySize ?? reservation.guests ?? 0);
  if (Number(table.capacity || 0) < targetGuests) return false;
  const requestedStart = getReservationDateTime(reservation.date, reservation.time).getTime();
  const requestedEnd = requestedStart + Number(store.reservationDurationMinutes || RESERVATION_DURATION_MINUTES) * 60 * 1000;
  const activeStatuses = new Set(['Pending', 'Approved', 'Awaiting Payment', 'Confirmed', 'Arrived', 'Seated']);
  const restaurant = findRestaurant(restaurantId, store);
  const conflicts = (restaurant?.reservations || []).filter((entry) => {
    if (entry.id === reservation.id) return false;
    if (!activeStatuses.has(entry.status)) return false;
    if (entry.assignedTable == null) return false;
    const tableMatch = (entry.assignedTable?.id && candidate.id && entry.assignedTable.id === candidate.id)
      || (entry.assignedTable?.name && candidate.name && entry.assignedTable.name === candidate.name)
      || (entry.assignedTable === candidate.id || entry.assignedTable === candidate.name);
    if (!tableMatch) return false;
    const entryStart = getReservationDateTime(entry.date, entry.time).getTime();
    const entryEnd = entryStart + Number(store.reservationDurationMinutes || RESERVATION_DURATION_MINUTES) * 60 * 1000;
    return requestedStart < entryEnd && requestedEnd > entryStart;
  });
  return conflicts.length === 0;
}

function currentRestaurantId(store = readStore()) {
  return store.selectedRestaurantId || store.restaurants[0]?.id || null;
}

function findRestaurant(id, store = readStore()) {
  return store.restaurants.find((restaurant) => restaurant.id === (id || currentRestaurantId(store))) || null;
}

function readSignedInUser() {
  const storage = getStorage();
  const raw = storage?.getItem('salo_user');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Stored demo user data is invalid: ${error.message}`, { cause: error });
  }
}

function actorDetails(store, input) {
  const user = readSignedInUser() || {};
  const restaurantId = input.restaurantId || currentRestaurantId(store);
  const ownership = store.ownershipMemberships.find((membership) => (
    membership.restaurantId === restaurantId
    && membership.status === 'approved'
    && (String(membership.userId) === String(user.id) || membership.userEmail?.toLowerCase() === user.email?.toLowerCase())
  ));
  const staff = store.staffMemberships.find((membership) => (
    membership.restaurantId === restaurantId
    && membership.status === 'active'
    && (String(membership.userId) === String(user.id) || membership.userEmail?.toLowerCase() === user.email?.toLowerCase())
  ));
  const membership = ownership || staff;
  const actorType = ownership ? ownership.actorType : staff ? 'staff' : 'unknown';

  return {
    actor: {
      id: user.id ?? null,
      name: user.name || user.username || 'Unknown user',
      email: user.email || null,
    },
    actorType,
    role: ownership ? ownership.actorType : staff?.position || user.role || 'unknown',
    restaurantId,
    membershipId: membership?.id || null,
  };
}

function appendActivity(store, { module, action, targetId = null, before = null, after = null, restaurantId }) {
  if (!module || !action) throw new Error('Activity module and action are required.');
  const context = actorDetails(store, { restaurantId });
  const entry = {
    id: `activity-${Date.now()}-${store.activities.length}`,
    module,
    action,
    targetId,
    before: clone(before),
    after: clone(after),
    actor: context.actor,
    actorType: context.actorType,
    role: context.role,
    restaurantId: context.restaurantId,
    timestamp: new Date().toISOString(),
  };
  store.activities.unshift(entry);
  return entry;
}

function validateDiningArea(areaName, restaurant) {
  const normalized = String(areaName || '').trim();
  if (!normalized || normalized.length > 60) throw new Error('Enter a dining area name of 1–60 characters.');
  if (!restaurant.diningAreas.some((area) => area.name.toLowerCase() === normalized.toLowerCase())) {
    throw new Error('Choose a dining area registered for this restaurant.');
  }
  return normalized;
}

function validateTableFields(table, restaurant) {
  const name = String(table.name || '').trim();
  const capacity = Number(table.capacity);
  if (!name || name.length > 60) throw new Error('Enter a table name of 1–60 characters.');
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 100) {
    throw new Error('Table capacity must be a whole number between 1 and 100.');
  }
  const rawType = String(table.type || 'Indoor').trim();
  const validTypes = ['Indoor', 'Outdoor', 'Private', 'Booth', 'Bar / High Top', 'Patio'];
  const matchedType = validTypes.find((t) => t.toLowerCase() === rawType.toLowerCase()) || rawType || 'Indoor';

  return {
    name,
    number: String(table.number ?? '').trim(),
    capacity,
    type: matchedType,
    description: String(table.description || '').trim(),
    area: validateDiningArea(table.area, restaurant),
  };
}

function getInventoryItem(restaurant, id) {
  const item = (restaurant.inventoryItems || []).find((entry) => entry.id === id);
  if (!item) throw new Error('The inventory item could not be found.');
  return item;
}

function saveInventoryMovement(restaurant, item, type, quantity, reason = '') {
  const change = type === 'adjusted'
    ? createStockAdjustment(item, quantity, reason, readSignedInUser() || {})
    : createStockMovement(item, type, quantity, reason, readSignedInUser() || {});
  item.quantity = change.after;
  const movement = change.movement;
  restaurant.inventoryMovements ||= [];
  restaurant.inventoryMovements.unshift(movement);
  return movement;
}

function logMenuStockChange(restaurant, item, nextQuantity, reason) {
  const before = validateStockQuantity(item.stockQuantity, `${item.name} stock`);
  const after = validateStockQuantity(nextQuantity, `${item.name} stock`);
  const movement = addMenuStockMovement(restaurant, item, 'adjusted', before, after, reason);
  item.stockQuantity = after;
  Object.assign(item, menuStockStatus(item, after));
  return movement;
}

function getCustomerOrderStatus(order) {
  const subOrders = order.subOrders || [];
  if (!subOrders.length) return order.overallStatus || 'Pending Confirmation';
  const statuses = subOrders.map((subOrder) => subOrder.status);
  if (statuses.every((status) => status === 'Completed')) return 'Completed';
  if (statuses.every((status) => status === 'Rejected')) return 'Rejected';
  if (statuses.every((status) => status === 'Cancelled')) return 'Cancelled';
  if (statuses.every((status) => ['Completed', 'Cancelled', 'Rejected'].includes(status))) return 'Partially Completed';
  if (subOrders.every((subOrder) => subOrder.cancellationRequest?.status === 'requested')) {
    return 'Cancellation Requested';
  }
  if (statuses.every((status) => status === 'Pending')) return 'Pending Confirmation';
  if (statuses.every((status) => status === statuses[0])) return statuses[0];
  return 'In Progress';
}

function findOrderSubOrder(store, id, restaurantId) {
  const restaurant = findRestaurant(restaurantId, store);
  const seededOrder = restaurant?.orders.find((order) => order.id === id);
  if (seededOrder) return { restaurant, subOrder: seededOrder, parentOrder: null };

  for (const parentOrder of store.customerOrders || []) {
    const subOrder = parentOrder.subOrders?.find((entry) => (
      entry.id === id && entry.restaurantId === restaurantId
    ));
    if (subOrder) return { restaurant, subOrder, parentOrder };
  }
  return { restaurant, subOrder: null, parentOrder: null };
}

function updateParentOrderStatus(parentOrder) {
  parentOrder.overallStatus = getCustomerOrderStatus(parentOrder);
  parentOrder.updatedAt = new Date().toISOString();
}

function openImageDatabase() {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('This browser does not support local demo image storage.'));
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(IMAGE_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(IMAGE_STORE_NAME)) {
        database.createObjectStore(IMAGE_STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error(`Unable to open demo image storage: ${request.error?.message || 'unknown error'}`));
  });
}

function storeImage(record) {
  return openImageDatabase().then((database) => new Promise((resolve, reject) => {
    const transaction = database.transaction(IMAGE_STORE_NAME, 'readwrite');
    transaction.objectStore(IMAGE_STORE_NAME).put(record);
    transaction.oncomplete = () => {
      database.close();
      resolve(record);
    };
    transaction.onerror = () => {
      database.close();
      reject(new Error(`Unable to save demo image: ${transaction.error?.message || 'unknown error'}`));
    };
    transaction.onabort = () => {
      database.close();
      reject(new Error(`Demo image storage was aborted: ${transaction.error?.message || 'unknown error'}`));
    };
  }));
}

function readImage(id) {
  return openImageDatabase().then((database) => new Promise((resolve, reject) => {
    const request = database.transaction(IMAGE_STORE_NAME, 'readonly').objectStore(IMAGE_STORE_NAME).get(id);
    request.onsuccess = () => {
      database.close();
      if (!request.result) {
        reject(new Error('The saved demo image could not be found.'));
        return;
      }
      resolve(request.result.blob);
    };
    request.onerror = () => {
      database.close();
      reject(new Error(`Unable to read demo image: ${request.error?.message || 'unknown error'}`));
    };
  }));
}

function compressImage(file) {
  return createImageBitmap(file).then((bitmap) => {
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) {
      bitmap.close();
      throw new Error('Image processing is unavailable in this browser.');
    }

    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve({ blob, width: canvas.width, height: canvas.height });
        else reject(new Error('The selected image could not be compressed.'));
      }, 'image/webp', 0.78);
    });
  }).catch((error) => {
    if (error instanceof Error && error.message) throw error;
    throw new Error('The selected file could not be read as an image.');
  });
}

export const demoAdapter = {
  active: true,

  getRestaurants() {
    return readStore().restaurants.map((restaurant) => ({
      ...clone(restaurant),
      isOpen: isRestaurantOpen(restaurant.operatingSchedule, restaurant.operatingSchedule?.temporaryClosures),
    }));
  },

  getRestaurant(id) {
    const restaurant = findRestaurant(id);
    return restaurant ? {
      ...clone(restaurant),
      isOpen: isRestaurantOpen(restaurant.operatingSchedule, restaurant.operatingSchedule?.temporaryClosures),
    } : null;
  },

  getOperatingHours(id) {
    const restaurant = findRestaurant(id);
    if (!restaurant) throw new Error('The selected restaurant could not be found.');
    return clone(normalizeOperatingHours(restaurant.operatingSchedule));
  },

  updateOperatingHours(data, id) {
    return updateStore((store) => {
      const restaurant = findRestaurant(id, store);
      if (!restaurant) throw new Error('The selected restaurant could not be found.');
      assertServicePermission(store, restaurant.id, 'business.hours.manage');
      const before = normalizeOperatingHours(restaurant.operatingSchedule);
      const next = normalizeOperatingHours(data);
      const validationError = validateOperatingHours(next);
      if (validationError) throw new Error(validationError);
      restaurant.operatingSchedule = next;
      restaurant.operatingHours = formatOperatingHours(next);
      const after = normalizeOperatingHours(restaurant.operatingSchedule);
      appendActivity(store, {
        module: 'business-profile',
        action: 'operating-hours-updated',
        targetId: restaurant.id,
        before,
        after,
        restaurantId: restaurant.id,
      });
      return next;
    });
  },

  getSelectedRestaurantId() {
    return currentRestaurantId();
  },

  setSelectedRestaurant(id) {
    return updateStore((store) => {
      if (!store.restaurants.some((restaurant) => restaurant.id === id)) {
        throw new Error('The selected restaurant is not available in the demo account.');
      }
      store.selectedRestaurantId = id;
      return id;
    });
  },

  getMemberships(user) {
    const email = user?.email?.toLowerCase();
    const userId = String(user?.id ?? '');
    const store = readStore();
    const matchesUser = (membership) => (
      String(membership.userId) === userId || membership.userEmail?.toLowerCase() === email
    );
    return {
      ownershipMemberships: clone(store.ownershipMemberships.filter(matchesUser)),
      staffMemberships: clone(store.staffMemberships.filter(matchesUser)),
    };
  },

  updateBusinessProfile(data, id) {
    return updateStore((store) => {
      const restaurant = findRestaurant(id, store);
      if (!restaurant) throw new Error('The selected restaurant could not be found.');
      const before = profileSnapshot(restaurant);
      const previousLogo = profileImageSummary(restaurant.logoImage);
      const previousCover = profileImageSummary(restaurant.coverPhoto);
      const previousGallery = (restaurant.profilePhotos || []).map(profileImageSummary);
      Object.assign(restaurant, normalizedProfilePatch(data));
      const after = profileSnapshot(restaurant);
      const nextLogo = profileImageSummary(restaurant.logoImage);
      const nextCover = profileImageSummary(restaurant.coverPhoto);
      const nextGallery = (restaurant.profilePhotos || []).map(profileImageSummary);
      const profileChanged = JSON.stringify(before) !== JSON.stringify(after);
      const logoChanged = JSON.stringify(previousLogo) !== JSON.stringify(nextLogo);
      const coverChanged = JSON.stringify(previousCover) !== JSON.stringify(nextCover);
      const galleryChanged = JSON.stringify(previousGallery) !== JSON.stringify(nextGallery);

      if (profileChanged) {
        appendActivity(store, {
          module: 'business-profile',
          action: 'updated',
          targetId: restaurant.id,
          before,
          after,
          restaurantId: restaurant.id,
        });
      }
      if (logoChanged) {
        appendActivity(store, { module: 'business-profile', action: 'logo-updated', targetId: restaurant.id, before: previousLogo, after: nextLogo, restaurantId: restaurant.id });
      }
      if (coverChanged) {
        appendActivity(store, { module: 'business-profile', action: 'cover-photo-updated', targetId: restaurant.id, before: previousCover, after: nextCover, restaurantId: restaurant.id });
      }
      if (galleryChanged) {
        appendActivity(store, { module: 'business-profile', action: 'gallery-updated', targetId: restaurant.id, before: previousGallery, after: nextGallery, restaurantId: restaurant.id });
      }
      return restaurant;
    });
  },

  updateRestaurant(data, id) {
    return this.updateBusinessProfile(data, id);
  },

  getMenuItems(id) {
    return clone(findRestaurant(id)?.menu || []);
  },

  getMenuCategories(id) {
    const restaurant = findRestaurant(id);
    if (!restaurant) throw new Error('The selected restaurant could not be found.');
    const categories = restaurant.menuCategories?.length
      ? restaurant.menuCategories
      : (restaurant.categories || []).map((category, index) => ({
        id: `category-${index}-${String(category).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        name: category,
        visible: true,
        sortOrder: index,
      }));
    return clone(categories);
  },

  saveMenuCategories(categories, id, categoryChanges = []) {
    if (!Array.isArray(categories) || categories.some((category) => !category.id || !category.name?.trim())) {
      throw new Error('Menu categories need a name and a valid identifier.');
    }
    const categoryNames = categories.map((category) => category.name.trim().toLowerCase());
    if (new Set(categoryNames).size !== categoryNames.length) {
      throw new Error('Menu category names must be unique.');
    }
    return updateStore((store) => {
      const restaurant = findRestaurant(id, store);
      if (!restaurant) throw new Error('The selected restaurant could not be found.');
      const before = clone(restaurant.menuCategories?.length
        ? restaurant.menuCategories
        : (restaurant.categories || []).map((name, index) => ({
          id: `category-${index}-${String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
          name,
          visible: true,
          sortOrder: index,
        })));
      const next = categories.map((category, index) => ({
        id: category.id,
        name: category.name.trim(),
        visible: category.visible !== false,
        sortOrder: index,
      }));
      const changesByCategory = new Map(categoryChanges.map(({ from, to }) => [from, to]));
      const nextNames = new Set(next.map((category) => category.name));
      const hasUnassignedItems = restaurant.menu.some((item) => {
        const nextCategory = changesByCategory.get(item.category) || item.category;
        return !nextNames.has(nextCategory);
      });
      if (hasUnassignedItems) {
        throw new Error('Move menu items to another category before removing their category.');
      }
      categoryChanges.forEach(({ from, to }) => {
        restaurant.menu.forEach((item) => {
          if (item.category !== from) return;
          const previousCategory = item.category;
          item.category = to;
          appendActivity(store, {
            module: 'menu',
            action: 'item-category-updated',
            targetId: item.id,
            before: { category: previousCategory },
            after: { category: to },
            restaurantId: restaurant.id,
          });
        });
      });
      restaurant.menuCategories = next;
      restaurant.categories = next.map((category) => category.name);
      appendActivity(store, {
        module: 'menu',
        action: 'categories-updated',
        targetId: restaurant.id,
        before,
        after: next,
        restaurantId: restaurant.id,
      });
      return next;
    });
  },

  addMenuItem(item, id) {
    return updateStore((store) => {
      const restaurant = findRestaurant(id, store);
      if (!restaurant) throw new Error('The selected restaurant could not be found.');
      const newItem = {
        ...normalizedMenuItemPatch(item),
        id: `menu-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        availability: item.availability || (item.isAvailable === false ? 'sold_out' : 'available'),
        isAvailable: item.availability ? item.availability === 'available' : item.isAvailable !== false,
      };
      if (newItem.stockQuantity !== null && newItem.stockQuantity !== undefined && newItem.stockQuantity !== '') {
        newItem.stockQuantity = validateStockQuantity(newItem.stockQuantity, `${newItem.name} stock`);
        Object.assign(newItem, menuStockStatus(newItem, newItem.stockQuantity));
      }
      restaurant.menu.push(newItem);
      appendActivity(store, { module: 'menu', action: 'item-created', targetId: newItem.id, after: newItem, restaurantId: restaurant.id });
      return newItem;
    });
  },

  updateMenuItem(id, data, restaurantId) {
    const result = updateStore((store) => {
      const restaurant = findRestaurant(restaurantId, store);
      const item = restaurant?.menu.find((entry) => entry.id === id);
      if (!item) throw new Error('The menu item could not be found.');
      const before = clone(item);
      let movement = null;
      if (Object.hasOwn(data, 'stockQuantity') && Number(data.stockQuantity) !== Number(item.stockQuantity)) {
        assertServicePermission(store, restaurant.id, 'inventory.adjustStock');
        movement = logMenuStockChange(restaurant, item, data.stockQuantity, 'Menu stock updated');
      }
      Object.assign(item, normalizedMenuItemPatch(data));
      if (Object.hasOwn(data, 'stockQuantity')) {
        item.stockQuantity = validateStockQuantity(data.stockQuantity, `${item.name} stock`);
        Object.assign(item, menuStockStatus(item, item.stockQuantity));
      }
      if (Object.hasOwn(data, 'availability')) item.isAvailable = data.availability === 'available';
      else if (Object.hasOwn(data, 'isAvailable')) item.availability = data.isAvailable ? 'available' : 'sold_out';
      if (item.stockQuantity !== null && item.stockQuantity !== undefined && Number(item.stockQuantity) <= 0) {
        item.availability = 'sold_out';
        item.isAvailable = false;
      }
      appendActivity(store, { module: 'menu', action: 'item-updated', targetId: id, before, after: item, restaurantId: restaurant.id });
      return { item, movement, before, restaurantId: restaurant.id };
    });
    if (result.movement) {
      this.logActivity({
        module: 'inventory',
        action: 'stock-adjusted',
        targetId: id,
        before: { quantity: result.movement.before },
        after: { quantity: result.movement.after, reason: result.movement.reason },
        restaurantId: result.restaurantId,
      });
    }
    return result.item;
  },

  deleteMenuItem(id, restaurantId) {
    return updateStore((store) => {
      const restaurant = findRestaurant(restaurantId, store);
      const index = restaurant?.menu.findIndex((entry) => entry.id === id) ?? -1;
      if (!restaurant || index < 0) throw new Error('The menu item could not be found.');
      const [removed] = restaurant.menu.splice(index, 1);
      appendActivity(store, { module: 'menu', action: 'item-removed', targetId: id, before: removed, restaurantId: restaurant.id });
      return restaurant.menu;
    });
  },

  getCustomerOrders(fallbackOrders = []) {
    let store = readStore();
    if (!store.customerOrdersInitialized) {
      const storage = getStorage();
      const legacyRaw = storage?.getItem('salo_orders');
      let legacyOrders = [];
      if (legacyRaw) {
        try {
          legacyOrders = JSON.parse(legacyRaw);
        } catch (error) {
          throw new Error(`Saved customer orders are invalid: ${error.message}`, { cause: error });
        }
      }
      store.customerOrders = clone(Array.isArray(legacyOrders) && legacyOrders.length ? legacyOrders : fallbackOrders);
      store.customerOrdersInitialized = true;
      writeStore(store);
    }
    return clone(store.customerOrders || []).map((order) => ({
      ...order,
      overallStatus: getCustomerOrderStatus(order),
    }));
  },

  getCustomerReservations() {
    const store = readStore();
    if (!store.customerReservationsInitialized || !Array.isArray(store.customerReservations)) {
      const storage = getStorage();
      const legacyRaw = storage?.getItem('salo_reservations');
      let legacyReservations = [];
      if (legacyRaw) {
        try {
          legacyReservations = JSON.parse(legacyRaw);
        } catch (error) {
          throw new Error(`Saved customer reservations are invalid: ${error.message}`, { cause: error });
        }
      }
      const seeded = legacyReservations.length ? legacyReservations : (store.restaurants || []).flatMap((restaurant) => (
        (restaurant.reservations || []).map((reservation) => normalizeReservation({ ...reservation, restaurantId: restaurant.id, restaurantName: restaurant.name }, restaurant.id))
      ));
      store.customerReservations = seeded;
      store.customerReservationsInitialized = true;
      writeStore(store);
    }
    return clone(store.customerReservations || []).map((reservation) => normalizeReservation(reservation));
  },

  createCustomerReservation(reservationPayload) {
    if (!reservationPayload?.restaurantId) throw new Error('Choose a restaurant before making a reservation.');
    if (!reservationPayload?.date || !reservationPayload?.time) {
      throw new Error('A reservation date and time are required.');
    }
    const user = readSignedInUser() || {};
    return updateStore((store) => {
      const restaurant = findRestaurant(reservationPayload.restaurantId, store);
      if (!restaurant) throw new Error('The selected restaurant is not available for reservations.');
      if (restaurant.operatingSchedule?.acceptingReservations === false) {
        throw new Error('This restaurant is not accepting reservations right now.');
      }
      const reservationDateTime = createOperatingDateTime(reservationPayload.date, reservationPayload.time);
      if (!reservationDateTime || !isRestaurantOpen(
        restaurant.operatingSchedule,
        restaurant.operatingSchedule?.temporaryClosures,
        reservationDateTime,
      )) {
        throw new Error('The restaurant is closed at the selected reservation time.');
      }
      const normalized = normalizeReservation({
        ...reservationPayload,
        restaurantId: restaurant.id,
        restaurantName: restaurant.name,
        guestName: reservationPayload.guestName || reservationPayload.customerName || user.name || user.username || 'Guest',
        guestEmail: reservationPayload.guestEmail || reservationPayload.customerEmail || user.email || '',
        guestPhone: reservationPayload.guestPhone || reservationPayload.customerPhone || user.phone || '',
        partySize: reservationPayload.partySize ?? reservationPayload.guests ?? 2,
        guests: reservationPayload.guests ?? reservationPayload.partySize ?? 2,
        status: 'Pending',
        createdAt: new Date().toISOString(),
      }, restaurant.id);
      const duplicateTable = (restaurant.reservations || []).find((entry) => (
        entry.assignedTable && normalized.assignedTable &&
        ((entry.assignedTable?.id && normalized.assignedTable?.id && entry.assignedTable.id === normalized.assignedTable.id)
          || (entry.assignedTable?.name && normalized.assignedTable?.name && entry.assignedTable.name === normalized.assignedTable.name))
        && entry.date === normalized.date && entry.time === normalized.time && entry.status !== 'Cancelled'
      ));
      if (duplicateTable) {
        throw new Error('That table is already reserved for the selected time.');
      }
      if (normalized.assignedTable && !isTableAvailableForReservation(restaurant.id, normalized, store)) {
        throw new Error('The selected table is not available at that time.');
      }
      const reservation = {
        ...normalized,
        id: reservationPayload.id || `RES-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        statusHistory: [{ status: 'Pending', timestamp: new Date().toISOString() }],
      };
      restaurant.reservations = [reservation, ...(restaurant.reservations || [])];
      store.customerReservations = [reservation, ...(store.customerReservations || [])];
      store.customerReservationsInitialized = true;
      return clone(reservation);
    });
  },

  cancelCustomerReservation(id, reason = 'Customer requested cancellation') {
    return updateStore((store) => {
      const reservation = (store.customerReservations || []).find((entry) => entry.id === id)
        || (store.restaurants || []).flatMap((restaurant) => restaurant.reservations || []).find((entry) => entry.id === id);
      if (!reservation) throw new Error('The reservation could not be found.');
      const restaurant = findRestaurant(reservation.restaurantId, store);
      const active = restaurant?.reservations?.find((entry) => entry.id === id);
      if (!active) throw new Error('The reservation is not linked to a restaurant.');
      if (!String(reason || '').trim()) throw new Error('Provide a reason for the cancellation request.');
      if (active.cancellationRequest?.status === 'requested') {
        throw new Error('A cancellation request is already awaiting review.');
      }
      active.cancellationRequest = { status: 'requested', reason: String(reason).trim(), requestedAt: new Date().toISOString() };
      active.updatedAt = active.cancellationRequest.requestedAt;
      const customerReservation = (store.customerReservations || []).find((entry) => entry.id === id);
      if (customerReservation) {
        customerReservation.cancellationRequest = clone(active.cancellationRequest);
        customerReservation.updatedAt = active.updatedAt;
      }
      return clone((store.customerReservations || []).find((entry) => entry.id === id) || active);
    });
  },

  getCustomerOrder(id, fallbackOrders = []) {
    const order = this.getCustomerOrders(fallbackOrders).find((entry) => entry.id === id);
    return order ? { ...order, overallStatus: getCustomerOrderStatus(order) } : null;
  },

  createCustomerOrder(orderPayload, fallbackOrders = []) {
    if (!Array.isArray(orderPayload?.subOrders) || orderPayload.subOrders.length === 0) {
      throw new Error('An order must contain at least one restaurant sub-order.');
    }
    const customerOrders = this.getCustomerOrders(fallbackOrders);
    const user = readSignedInUser() || {};
    return updateStore((store) => {
      const id = `ORD-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const subOrders = orderPayload.subOrders.map((subOrder, index) => {
        const restaurant = findRestaurant(subOrder.restaurantId, store);
        if (!restaurant) throw new Error('An order contains a restaurant that is unavailable in the demo data.');
        if (restaurant.operatingSchedule?.acceptingOrders === false
          || !isRestaurantOpen(restaurant.operatingSchedule, restaurant.operatingSchedule?.temporaryClosures)) {
          throw new Error(`${restaurant.name} is not accepting orders right now.`);
        }
        return {
          ...clone(subOrder),
          id: subOrder.id || `${id}-SUB-${index + 1}`,
          orderReference: id,
          restaurantId: restaurant.id,
          restaurantName: restaurant.name,
          status: 'Pending',
          cancellationRequest: null,
        };
      });
      const order = {
        ...clone(orderPayload),
        id,
        customerId: user.id ?? null,
        customerName: orderPayload.customerName || user.name || user.username || 'SALO Customer',
        customerEmail: orderPayload.customerEmail || user.email || '',
        customerPhone: orderPayload.customerPhone || user.phone || '',
        createdAt: new Date().toISOString(),
        subOrders,
      };
      order.overallStatus = getCustomerOrderStatus(order);
      store.customerOrders = [...(store.customerOrders || customerOrders), order];
      return order;
    });
  },

  requestOrderCancellation(orderId, reason, fallbackOrders = []) {
    if (!String(reason || '').trim()) throw new Error('Provide a reason for the cancellation request.');
    this.getCustomerOrders(fallbackOrders);
    return updateStore((store) => {
      const order = store.customerOrders.find((entry) => entry.id === orderId);
      if (!order) throw new Error('The customer order could not be found.');
      const eligible = order.subOrders.filter((subOrder) => (
        !['Completed', 'Cancelled', 'Rejected'].includes(subOrder.status)
        && subOrder.cancellationRequest?.status !== 'requested'
      ));
      if (!eligible.length) throw new Error('No active restaurant sub-orders can receive a cancellation request.');
      const requestedAt = new Date().toISOString();
      eligible.forEach((subOrder) => {
        subOrder.cancellationRequest = {
          status: 'requested',
          reason: reason.trim(),
          requestedAt,
          resolvedAt: null,
          resolutionReason: null,
        };
        appendActivity(store, {
          module: 'orders',
          action: 'customer-cancellation-requested',
          targetId: subOrder.id,
          after: clone(subOrder.cancellationRequest),
          restaurantId: subOrder.restaurantId,
        });
      });
      updateParentOrderStatus(order);
      return order;
    });
  },

  getOrders(id, { canViewCustomer = true } = {}) {
    const store = readStore();
    const restaurant = findRestaurant(id, store);
    if (!restaurant) throw new Error('The selected restaurant could not be found.');
    const customerSubOrders = (store.customerOrders || []).flatMap((parentOrder) => (
      (parentOrder.subOrders || [])
        .filter((subOrder) => subOrder.restaurantId === restaurant.id)
        .map((subOrder) => ({
          ...subOrder,
          id: subOrder.id,
          ...(canViewCustomer ? {
            customerName: parentOrder.customerName,
            customerEmail: parentOrder.customerEmail,
            customerPhone: parentOrder.customerPhone,
          } : {}),
          orderReference: parentOrder.id,
          paymentMethod: parentOrder.paymentMethod,
          paymentStatus: parentOrder.paymentStatus,
          orderNotes: parentOrder.orderNotes,
          createdAt: parentOrder.createdAt,
          scheduledDate: parentOrder.scheduledDate || parentOrder.requestedDate || null,
          scheduledTime: parentOrder.scheduledTime || parentOrder.requestedTime || null,
          priority: Boolean(parentOrder.priority),
          isScheduled: Boolean(parentOrder.scheduledDate || parentOrder.requestedDate || parentOrder.scheduledTime || parentOrder.requestedTime),
          total: Number(subOrder.subtotal || 0) + Number(subOrder.deliveryFee || 0),
          itemCount: (subOrder.items || []).reduce((count, item) => count + Number(item.qty || item.quantity || 0), 0),
          address: subOrder.deliveryAddress || '',
          notes: subOrder.deliveryInstructions || parentOrder.orderNotes || '',
        }))
    ));
    const restaurantOrders = (restaurant.orders || []).map((order) => {
      if (canViewCustomer) return order;
      return Object.fromEntries(Object.entries(order).filter(([key]) => (
        !['customerName', 'customerEmail', 'customerPhone'].includes(key)
      )));
    });
    return clone([...restaurantOrders, ...customerSubOrders]);
  },

  updateOrderStatus(id, status, restaurantId, details = {}) {
    const allowedStatuses = new Set([
      'Accepted',
      'Preparing',
      'Ready for Pickup',
      'Ready for Dispatch',
      'Completed',
      'Rejected',
    ]);
    if (!allowedStatuses.has(status)) throw new Error('That order status cannot be set by restaurant staff.');
    if (status === 'Rejected' && !String(details.reason || '').trim()) {
      throw new Error('A rejection reason is required.');
    }

    const result = updateStore((store) => {
      const { restaurant, subOrder: order, parentOrder } = findOrderSubOrder(store, id, restaurantId);
      if (!restaurant || !order) throw new Error('The order could not be found for the selected restaurant.');
      const previousStatus = order.status;
      const transitions = {
        Pending: ['Accepted', 'Rejected'],
        'Pending Confirmation': ['Accepted', 'Rejected'],
        Accepted: ['Preparing'],
        Preparing: order.fulfillment === 'pickup'
          ? ['Ready for Pickup']
          : ['Ready for Dispatch'],
        'Ready for Pickup': order.fulfillment === 'pickup' ? ['Completed'] : [],
      };
      if (!transitions[previousStatus]?.includes(status)) {
        throw new Error(`An order cannot move from ${previousStatus} to ${status}.`);
      }
      const before = { status: previousStatus };
      const stockMovements = status === 'Completed'
        ? applyCompletedOrderDeduction(store, restaurant, order)
        : [];
      order.status = status;
      order.updatedAt = new Date().toISOString();
      if (status === 'Rejected') {
        order.rejectionReason = details.reason.trim();
        order.rejectedAt = order.updatedAt;
      }
      if (status === 'Completed') order.completedAt = order.updatedAt;
      if (parentOrder) updateParentOrderStatus(parentOrder);
      return {
        order,
        activity: {
        module: 'orders',
        action: status === 'Rejected' ? 'restaurant-rejected' : 'status-updated',
        targetId: id,
        before,
        after: { status, reason: details.reason?.trim() || null },
        restaurantId: restaurant.id,
        },
        stockActivities: stockMovements.map((movement) => ({
          module: 'inventory',
          action: 'stock-deducted',
          targetId: movement.itemId,
          before: { quantity: movement.before },
          after: { quantity: movement.after, reason: movement.reason },
          restaurantId: restaurant.id,
        })),
      };
    });
    this.logActivity(result.activity);
    result.stockActivities.forEach((activity) => this.logActivity(activity));
    return result.order;
  },

  resolveOrderCancellation(id, decision, restaurantId, reason) {
    if (!['approve', 'reject'].includes(decision)) throw new Error('Choose whether to approve or reject the cancellation request.');
    if (decision === 'reject' && !String(reason || '').trim()) {
      throw new Error('Provide a reason when rejecting a cancellation request.');
    }
    const result = updateStore((store) => {
      const { restaurant, subOrder: order, parentOrder } = findOrderSubOrder(store, id, restaurantId);
      if (!restaurant || !order || !parentOrder) {
        throw new Error('The cancellation request could not be found for the selected restaurant.');
      }
      if (order.cancellationRequest?.status !== 'requested') {
        throw new Error('This order has no pending customer cancellation request.');
      }
      const before = clone(order.cancellationRequest);
      const resolvedAt = new Date().toISOString();
      order.cancellationRequest = {
        ...order.cancellationRequest,
        status: decision === 'approve' ? 'approved' : 'rejected',
        resolvedAt,
        resolutionReason: String(reason || '').trim() || null,
      };
      if (decision === 'approve') {
        order.status = 'Cancelled';
        order.cancelledAt = resolvedAt;
        order.cancellationReason = before.reason;
      }
      order.updatedAt = resolvedAt;
      updateParentOrderStatus(parentOrder);
      return {
        order,
        activity: {
        module: 'orders',
        action: decision === 'approve' ? 'customer-cancellation-approved' : 'customer-cancellation-rejected',
        targetId: id,
        before,
        after: {
          ...clone(order.cancellationRequest),
          status: decision === 'approve' ? 'completed' : 'rejected',
          orderStatus: order.status,
        },
        restaurantId: restaurant.id,
        },
      };
    });
    this.logActivity(result.activity);
    return result.order;
  },

  getDiningAreas(restaurantId) {
    const store = readStore();
    const restaurant = findRestaurant(restaurantId, store);
    if (!restaurant) throw new Error('The selected restaurant could not be found.');
    assertServicePermission(store, restaurant.id, 'tables.view');
    return clone(restaurant.diningAreas || []);
  },

  addDiningArea(name, restaurantId) {
    const result = updateStore((store) => {
      const restaurant = findRestaurant(restaurantId, store);
      if (!restaurant) throw new Error('The selected restaurant could not be found.');
      assertServicePermission(store, restaurant.id, 'tables.add');
      const normalized = String(name || '').trim();
      if (!normalized || normalized.length > 60) throw new Error('Enter a dining area name of 1–60 characters.');
      if (restaurant.diningAreas.some((area) => area.name.toLowerCase() === normalized.toLowerCase())) {
        throw new Error('A dining area with that name already exists.');
      }
      const area = { id: `area-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, name: normalized };
      restaurant.diningAreas.push(area);
      return { area, restaurantId: restaurant.id };
    });
    this.logActivity({ module: 'tables', action: 'dining-area-created', targetId: result.area.id, after: result.area, restaurantId: result.restaurantId });
    return result.area;
  },

  updateDiningArea(areaId, name, restaurantId) {
    const result = updateStore((store) => {
      const restaurant = findRestaurant(restaurantId, store);
      if (!restaurant) throw new Error('The selected restaurant could not be found.');
      assertServicePermission(store, restaurant.id, 'tables.edit');
      const area = restaurant.diningAreas.find((entry) => entry.id === areaId);
      if (!area) throw new Error('The dining area could not be found.');
      const before = clone(area);
      const normalized = String(name || '').trim();
      if (!normalized || normalized.length > 60) throw new Error('Enter a dining area name of 1–60 characters.');
      if (restaurant.diningAreas.some((entry) => entry.id !== areaId && entry.name.toLowerCase() === normalized.toLowerCase())) {
        throw new Error('A dining area with that name already exists.');
      }
      restaurant.tables.forEach((table) => {
        if (table.area === area.name) table.area = normalized;
      });
      restaurant.reservations.forEach((reservation) => {
        if (reservation.seatingArea === area.name) reservation.seatingArea = normalized;
        if (reservation.assignedTable?.area === area.name) reservation.assignedTable.area = normalized;
      });
      area.name = normalized;
      return { area, before, restaurantId: restaurant.id };
    });
    this.logActivity({ module: 'tables', action: 'dining-area-updated', targetId: areaId, before: result.before, after: result.area, restaurantId: result.restaurantId });
    return result.area;
  },

  getTables(restaurantId, date = new Date().toISOString().slice(0, 10), time = null) {
    const store = readStore();
    const restaurant = findRestaurant(restaurantId, store);
    if (!restaurant) throw new Error('The selected restaurant could not be found.');
    assertServicePermission(store, restaurant.id, 'tables.view');
    return clone(restaurant.tables.map((table) => ({
      ...table,
      status: deriveTableStatus(table, restaurant.reservations || [], date, time),
      rawStatus: table.status,
    })));
  },

  getTableSchedule(tableId, date, restaurantId) {
    const store = readStore();
    const restaurant = findRestaurant(restaurantId, store);
    if (!restaurant) throw new Error('The selected restaurant could not be found.');
    assertServicePermission(store, restaurant.id, 'tables.view');
    const table = restaurant.tables.find((entry) => entry.id === tableId);
    if (!table) throw new Error('The table could not be found.');
    return clone(getTableReservations(table, restaurant.reservations || [], date)
      .sort((a, b) => parseReservationTime(a.time) - parseReservationTime(b.time)));
  },

  addTable(data, restaurantId) {
    const result = updateStore((store) => {
      const restaurant = findRestaurant(restaurantId, store);
      if (!restaurant) throw new Error('The selected restaurant could not be found.');
      assertServicePermission(store, restaurant.id, 'tables.add');
      const fields = validateTableFields(data, restaurant);
      const isInactive = data.isActive === false || data.status === 'Inactive' || data.status === 'Archived';
      const status = isInactive ? 'Inactive' : (['Available', 'Unavailable', 'Maintenance'].includes(data.status) ? data.status : 'Available');
      if (status !== 'Available' && !isInactive) assertServicePermission(store, restaurant.id, 'tables.manageAvailability');
      const number = fields.number || String(restaurant.tables.length + 1);
      if (restaurant.tables.some((table) => table.name.toLowerCase() === fields.name.toLowerCase()
        || (table.number && table.number.toLowerCase() === number.toLowerCase()))) {
        throw new Error('A table with that name or number already exists.');
      }
      const table = {
        id: `TBL-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        ...fields,
        number,
        type: fields.type,
        isActive: !isInactive,
        isArchived: isInactive && (data.isArchived === true || data.status === 'Archived'),
        status,
        availability: isInactive || status === 'Unavailable' ? 'unavailable' : 'available',
      };
      restaurant.tables.push(table);
      return { table, restaurantId: restaurant.id };
    });
    this.logActivity({ module: 'tables', action: 'table-created', targetId: result.table.id, after: result.table, restaurantId: result.restaurantId });
    return result.table;
  },

  updateTable(tableId, data, restaurantId) {
    const result = updateStore((store) => {
      const restaurant = findRestaurant(restaurantId, store);
      if (!restaurant) throw new Error('The selected restaurant could not be found.');
      assertServicePermission(store, restaurant.id, 'tables.edit');
      const table = restaurant.tables.find((entry) => entry.id === tableId);
      if (!table) throw new Error('The table could not be found.');
      if (Object.hasOwn(data, 'status') || Object.hasOwn(data, 'availability') || Object.hasOwn(data, 'isActive') || Object.hasOwn(data, 'isArchived')) {
        assertServicePermission(store, restaurant.id, 'tables.manageAvailability');
      }
      const fields = validateTableFields({ ...table, ...data }, restaurant);
      const number = fields.number || table.number || '';

      const duplicate = restaurant.tables.find((entry) => entry.id !== tableId && (
        entry.name.toLowerCase() === fields.name.toLowerCase()
        || (entry.number && number && entry.number.toLowerCase() === number.toLowerCase())
      ));
      if (duplicate) {
        throw new Error('A table with that name or number already exists.');
      }

      const isInactive = data.isActive === false || data.status === 'Inactive' || data.status === 'Archived';
      const status = isInactive
        ? (data.status === 'Archived' || table.isArchived ? 'Archived' : 'Inactive')
        : (['Available', 'Unavailable', 'Maintenance'].includes(data.status) ? data.status : 'Available');

      const conflicts = getTableEditConflicts(table, {
        ...fields,
        number,
        status,
        isActive: !isInactive,
        isArchived: isInactive && (data.isArchived === true || data.status === 'Archived' || table.isArchived),
        availability: isInactive || status === 'Unavailable' ? 'unavailable' : 'available',
      }, restaurant.reservations || [], Number(store.reservationDurationMinutes || RESERVATION_DURATION_MINUTES));
      if (conflicts.length) {
        const refs = conflicts.map((reservation) => `#${reservation.reference || reservation.id}`).join(', ');
        throw new Error(`This change conflicts with upcoming reservations: ${refs}. Keep the current table details or resolve those reservations first.`);
      }
      const before = clone(table);
      Object.assign(table, fields, {
        number,
        type: fields.type,
        isActive: !isInactive,
        isArchived: isInactive && (data.isArchived === true || data.status === 'Archived' || table.isArchived),
        status,
        availability: isInactive || status === 'Unavailable' ? 'unavailable' : 'available',
      });
      return { table, before, restaurantId: restaurant.id };
    });
    this.logActivity({ module: 'tables', action: 'table-updated', targetId: tableId, before: result.before, after: result.table, restaurantId: result.restaurantId });
    return result.table;
  },

  archiveTable(tableId, restaurantId) {
    return this.updateTable(tableId, { isActive: false, isArchived: true, status: 'Archived' }, restaurantId);
  },

  deactivateTable(tableId, restaurantId) {
    return this.updateTable(tableId, { isActive: false, status: 'Inactive' }, restaurantId);
  },

  reactivateTable(tableId, restaurantId) {
    return this.updateTable(tableId, { isActive: true, isArchived: false, status: 'Available' }, restaurantId);
  },

  setTableAvailability(tableId, status, restaurantId) {
    if (!['Available', 'Unavailable', 'Maintenance'].includes(status)) {
      throw new Error('Choose Available, Unavailable, or Maintenance. Reservation statuses are derived.');
    }
    const result = updateStore((store) => {
      const restaurant = findRestaurant(restaurantId, store);
      if (!restaurant) throw new Error('The selected restaurant could not be found.');
      assertServicePermission(store, restaurant.id, 'tables.manageAvailability');
      const table = restaurant.tables.find((entry) => entry.id === tableId);
      if (!table) throw new Error('The table could not be found.');
      const conflicts = getTableEditConflicts(table, {
        status,
        availability: status === 'Unavailable' ? 'unavailable' : 'available',
      }, restaurant.reservations || [], Number(store.reservationDurationMinutes || RESERVATION_DURATION_MINUTES));
      if (conflicts.length) {
        const refs = conflicts.map((reservation) => `#${reservation.reference || reservation.id}`).join(', ');
        throw new Error(`This change conflicts with upcoming reservations: ${refs}.`);
      }
      const before = { status: table.status, availability: table.availability };
      table.status = status;
      table.availability = status === 'Unavailable' ? 'unavailable' : 'available';
      return { table, before, restaurantId: restaurant.id };
    });
    this.logActivity({
      module: 'tables',
      action: status === 'Unavailable' ? 'table-marked-unavailable' : 'table-availability-updated',
      targetId: tableId,
      before: result.before,
      after: { status: result.table.status, availability: result.table.availability },
      restaurantId: result.restaurantId,
    });
    return result.table;
  },

  getInventorySettings(restaurantId) {
    const store = readStore();
    const restaurant = findRestaurant(restaurantId, store);
    if (!restaurant) throw new Error('The selected restaurant could not be found.');
    assertServicePermission(store, restaurant.id, 'inventory.view');
    return {
      deductionMode: restaurant.inventoryDeductionMode || 'manual',
      expiringSoonDays: Number(store.inventoryExpiringSoonDays || INVENTORY_EXPIRING_SOON_DAYS),
    };
  },

  setInventoryDeductionMode(mode, restaurantId) {
    if (!['manual', 'on_completion'].includes(mode)) throw new Error('Choose manual or on-completion stock deduction.');
    const result = updateStore((store) => {
      const restaurant = findRestaurant(restaurantId, store);
      if (!restaurant) throw new Error('The selected restaurant could not be found.');
      assertServicePermission(store, restaurant.id, 'inventory.adjustStock');
      const before = restaurant.inventoryDeductionMode || 'manual';
      restaurant.inventoryDeductionMode = mode;
      return { before, after: mode, restaurantId: restaurant.id };
    });
    this.logActivity({ module: 'inventory', action: 'deduction-mode-updated', targetId: result.restaurantId, before: { mode: result.before }, after: { mode }, restaurantId: result.restaurantId });
    return mode;
  },

  getInventoryItems(restaurantId) {
    const store = readStore();
    const restaurant = findRestaurant(restaurantId, store);
    if (!restaurant) throw new Error('The selected restaurant could not be found.');
    assertServicePermission(store, restaurant.id, 'inventory.view');
    const days = Number(store.inventoryExpiringSoonDays || INVENTORY_EXPIRING_SOON_DAYS);
    const inventory = restaurant.inventoryItems.map((item) => ({
      ...item,
      stockStatus: classifyInventoryItem(item, days),
    }));
    const menuItems = restaurant.menu
      .filter((item) => item.stockQuantity !== null && item.stockQuantity !== undefined && item.stockQuantity !== '')
      .map((item) => ({
        id: item.id,
        name: item.name,
        category: item.category || 'Menu items',
        unit: 'item',
        quantity: Number(item.stockQuantity),
        minimumLevel: 0,
        availability: 'available',
        stockStatus: Number(item.stockQuantity) <= 0 ? 'Out of Stock' : 'In Stock',
        kind: 'menu',
      }));
    return clone([...inventory, ...menuItems]);
  },

  getInventoryMovements(restaurantId, itemId = null) {
    const store = readStore();
    const restaurant = findRestaurant(restaurantId, store);
    if (!restaurant) throw new Error('The selected restaurant could not be found.');
    assertServicePermission(store, restaurant.id, 'inventory.viewHistory');
    return clone((restaurant.inventoryMovements || [])
      .filter((movement) => !itemId || movement.itemId === itemId)
      .sort((a, b) => b.date.localeCompare(a.date)));
  },

  createInventoryItem(data, restaurantId) {
    const result = updateStore((store) => {
      const restaurant = findRestaurant(restaurantId, store);
      if (!restaurant) throw new Error('The selected restaurant could not be found.');
      assertServicePermission(store, restaurant.id, 'inventory.addStock');
      const name = String(data.name || '').trim();
      const category = String(data.category || '').trim();
      const unit = String(data.unit || '').trim();
      if (!name || name.length > 100 || !category || category.length > 60 || !unit || unit.length > 20) {
        throw new Error('Enter an item name, category, and unit using the allowed length limits.');
      }
      const quantity = validateStockQuantity(data.quantity ?? 0);
      const minimumLevel = validateStockQuantity(data.minimumLevel ?? 0, 'Minimum level');
      const maximumLevel = data.maximumLevel === '' || data.maximumLevel == null
        ? null : validateStockQuantity(data.maximumLevel, 'Maximum level');
      if (maximumLevel !== null && maximumLevel < minimumLevel) throw new Error('Maximum stock must be at least the minimum level.');
      const expirationDate = String(data.expirationDate || '').trim();
      if (expirationDate && Number.isNaN(new Date(`${expirationDate}T00:00:00`).getTime())) throw new Error('Enter a valid expiration date.');
      if (restaurant.inventoryItems.some((item) => item.name.toLowerCase() === name.toLowerCase())) {
        throw new Error('An inventory item with that name already exists.');
      }
      const item = {
        id: `INV-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name,
        category,
        unit,
        quantity: 0,
        minimumLevel,
        maximumLevel,
        supplier: String(data.supplier || '').trim(),
        expirationDate,
        availability: 'available',
      };
      restaurant.inventoryItems.push(item);
      let movement = null;
      if (quantity > 0) movement = saveInventoryMovement(restaurant, item, 'received', quantity, 'Initial stock');
      return { item, movement, restaurantId: restaurant.id };
    });
    this.logActivity({ module: 'inventory', action: 'inventory-item-created', targetId: result.item.id, after: result.item, restaurantId: result.restaurantId });
    if (result.movement) this.logActivity({
      module: 'inventory',
      action: 'stock-added',
      targetId: result.item.id,
      before: { quantity: result.movement.before },
      after: { quantity: result.movement.after, reason: result.movement.reason },
      restaurantId: result.restaurantId,
    });
    return result.item;
  },

  updateInventoryItem(itemId, data, restaurantId) {
    const result = updateStore((store) => {
      const restaurant = findRestaurant(restaurantId, store);
      if (!restaurant) throw new Error('The selected restaurant could not be found.');
      assertServicePermission(store, restaurant.id, 'inventory.adjustStock');
      const item = getInventoryItem(restaurant, itemId);
      const before = clone(item);
      const name = String(data.name ?? item.name).trim();
      const category = String(data.category ?? item.category).trim();
      const unit = String(data.unit ?? item.unit).trim();
      if (!name || name.length > 100 || !category || category.length > 60 || !unit || unit.length > 20) {
        throw new Error('Enter an item name, category, and unit using the allowed length limits.');
      }
      const minimumLevel = validateStockQuantity(data.minimumLevel ?? item.minimumLevel, 'Minimum level');
      const maximumLevel = data.maximumLevel === '' || data.maximumLevel == null
        ? null : validateStockQuantity(data.maximumLevel, 'Maximum level');
      if (maximumLevel !== null && maximumLevel < minimumLevel) throw new Error('Maximum stock must be at least the minimum level.');
      const expirationDate = String(data.expirationDate ?? item.expirationDate ?? '').trim();
      if (expirationDate && Number.isNaN(new Date(`${expirationDate}T00:00:00`).getTime())) throw new Error('Enter a valid expiration date.');
      Object.assign(item, { name, category, unit, minimumLevel, maximumLevel, supplier: String(data.supplier ?? item.supplier ?? '').trim(), expirationDate });
      return { item, before, restaurantId: restaurant.id };
    });
    this.logActivity({ module: 'inventory', action: 'inventory-item-updated', targetId: itemId, before: result.before, after: result.item, restaurantId: result.restaurantId });
    return result.item;
  },

  receiveInventoryStock(itemId, quantity, restaurantId, reason = '') {
    return this._changeInventoryStock(itemId, 'received', quantity, restaurantId, reason, 'inventory.addStock');
  },

  recordInventoryUsage(itemId, quantity, restaurantId, reason = '') {
    return this._changeInventoryStock(itemId, 'deducted', quantity, restaurantId, reason, 'inventory.deductStock');
  },

  returnInventoryStock(itemId, quantity, restaurantId, reason = '') {
    return this._changeInventoryStock(itemId, 'returned', quantity, restaurantId, reason, 'inventory.addStock');
  },

  adjustInventoryStock(itemId, quantity, reason, restaurantId) {
    if (!String(reason || '').trim()) throw new Error('A reason is required for stock adjustments.');
    const result = updateStore((store) => {
      const restaurant = findRestaurant(restaurantId, store);
      if (!restaurant) throw new Error('The selected restaurant could not be found.');
      assertServicePermission(store, restaurant.id, 'inventory.adjustStock');
      const item = getInventoryItem(restaurant, itemId);
      const before = item.quantity;
      const movement = saveInventoryMovement(restaurant, item, 'adjusted', quantity, reason);
      return { item, before, movement, restaurantId: restaurant.id };
    });
    this.logActivity({ module: 'inventory', action: 'stock-adjusted', targetId: itemId, before: { quantity: result.before }, after: { quantity: result.item.quantity, reason }, restaurantId: result.restaurantId });
    return result.item;
  },

  markInventoryUnavailable(itemId, unavailable, restaurantId) {
    const result = updateStore((store) => {
      const restaurant = findRestaurant(restaurantId, store);
      if (!restaurant) throw new Error('The selected restaurant could not be found.');
      assertServicePermission(store, restaurant.id, 'inventory.adjustStock');
      const item = getInventoryItem(restaurant, itemId);
      const before = { availability: item.availability };
      item.availability = unavailable ? 'unavailable' : 'available';
      const movement = {
        id: `move-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        itemId: item.id,
        itemName: item.name,
        type: unavailable ? 'marked-unavailable' : 'made-available',
        quantity: 0,
        before: item.quantity,
        after: item.quantity,
        date: new Date().toISOString(),
        responsibleUser: readSignedInUser()?.name || readSignedInUser()?.username || 'Unknown user',
        reason: '',
      };
      restaurant.inventoryMovements.unshift(movement);
      return { item, before, restaurantId: restaurant.id };
    });
    this.logActivity({ module: 'inventory', action: 'inventory-item-updated', targetId: itemId, before: result.before, after: { availability: result.item.availability }, restaurantId: result.restaurantId });
    return result.item;
  },

  _changeInventoryStock(itemId, type, quantity, restaurantId, reason, permission) {
    const result = updateStore((store) => {
      const restaurant = findRestaurant(restaurantId, store);
      if (!restaurant) throw new Error('The selected restaurant could not be found.');
      assertServicePermission(store, restaurant.id, permission);
      const item = getInventoryItem(restaurant, itemId);
      const before = item.quantity;
      const movement = saveInventoryMovement(restaurant, item, type, quantity, reason);
      return { item, before, movement, restaurantId: restaurant.id };
    });
    this.logActivity({
      module: 'inventory',
      action: type === 'deducted' ? 'stock-deducted' : type === 'returned' ? 'stock-returned' : 'stock-added',
      targetId: itemId,
      before: { quantity: result.before },
      after: { quantity: result.item.quantity, reason },
      restaurantId: result.restaurantId,
    });
    return result.item;
  },

  updateMenuItemStock(menuItemId, quantity, reason, restaurantId) {
    if (!String(reason || '').trim()) throw new Error('Provide a reason for updating menu stock.');
    const result = updateStore((store) => {
      const restaurant = findRestaurant(restaurantId, store);
      if (!restaurant) throw new Error('The selected restaurant could not be found.');
      assertServicePermission(store, restaurant.id, 'inventory.adjustStock');
      const item = restaurant.menu.find((entry) => entry.id === menuItemId);
      if (!item) throw new Error('The menu item could not be found.');
      const before = validateStockQuantity(item.stockQuantity ?? 0, `${item.name} stock`);
      const movement = logMenuStockChange(restaurant, item, quantity, reason);
      return { item, before, movement, restaurantId: restaurant.id };
    });
    this.logActivity({ module: 'inventory', action: 'stock-adjusted', targetId: menuItemId, before: { quantity: result.before }, after: { quantity: result.item.stockQuantity, reason }, restaurantId: result.restaurantId });
    return result.item;
  },

  getReservations(id) {
    const store = readStore();
    const restaurant = findRestaurant(id, store);
    if (!restaurant) throw new Error('The selected restaurant could not be found.');
    assertReservationPermission(store, restaurant.id, 'view');
    return clone((restaurant.reservations || []).map((reservation) => normalizeReservation(reservation, restaurant.id)));
  },

  getReservationTables(restaurantId, reservationId) {
    const store = readStore();
    const restaurant = findRestaurant(restaurantId, store);
    if (!restaurant) throw new Error('The selected restaurant could not be found.');
    assertReservationPermission(store, restaurant.id, 'view');
    const reservation = (restaurant.reservations || []).find((entry) => entry.id === reservationId);
    if (!reservation) throw new Error('The reservation could not be found.');
    const guests = Number(reservation.partySize ?? reservation.guests ?? 0);
    return clone(getRestaurantTables(restaurant.id, store).filter((table) => (
      table.isActive !== false
      && !table.isArchived
      && table.status !== 'Inactive'
      && table.status !== 'Archived'
      && Number(table.capacity || 0) >= guests
      && !['Unavailable', 'Maintenance'].includes(table.status)
      && table.availability !== 'unavailable'
      && isTableAvailableForReservation(restaurant.id, { ...reservation, assignedTable: table }, store)
    )));
  },

  getReservationTableOptions(restaurantId, reservationId) {
    const store = readStore();
    const restaurant = findRestaurant(restaurantId, store);
    if (!restaurant) throw new Error('The selected restaurant could not be found.');
    assertReservationPermission(store, restaurant.id, 'view');
    const reservation = (restaurant.reservations || []).find((entry) => entry.id === reservationId);
    if (!reservation) throw new Error('The reservation could not be found.');
    const guests = Number(reservation.partySize ?? reservation.guests ?? 0);
    const tables = getRestaurantTables(restaurant.id, store);

    return clone(tables.map((table) => {
      const isAssignedToThis = (reservation.assignedTable?.id && table.id && reservation.assignedTable.id === table.id)
        || (reservation.assignedTable?.name && table.name && reservation.assignedTable.name === table.name)
        || reservation.assignedTable === table.id;
      const isInactive = table.isActive === false || table.isArchived || table.status === 'Inactive' || table.status === 'Archived';
      const isMaintenance = table.status === 'Maintenance' || table.status === 'Unavailable' || table.availability === 'unavailable';
      const isTooSmall = Number(table.capacity || 0) < guests;
      const candidate = { ...reservation, assignedTable: table };
      const canAccommodate = isTableAvailableForReservation(restaurant.id, candidate, store);

      let isAvailable = false;
      let statusLabel;

      if (isInactive) {
        statusLabel = 'Inactive / Archived';
      } else if (isMaintenance) {
        statusLabel = table.status === 'Maintenance' ? 'Under Maintenance' : 'Unavailable';
      } else if (isTooSmall) {
        statusLabel = `Too small (${table.capacity} seats, party is ${guests})`;
      } else if (!canAccommodate && !isAssignedToThis) {
        statusLabel = `Reserved at ${reservation.time}`;
      } else {
        isAvailable = true;
        statusLabel = isAssignedToThis ? 'Currently Assigned' : 'Available';
      }

      return {
        ...table,
        isAvailable: isAvailable || isAssignedToThis,
        isAssignedToThis,
        statusLabel,
      };
    }));
  },

  assignReservationTable(id, tableId, restaurantId) {
    const result = updateStore((store) => {
      const restaurant = findRestaurant(restaurantId, store);
      if (!restaurant) throw new Error('The selected restaurant could not be found.');
      assertReservationPermission(store, restaurant.id, 'assignTables');
      const reservation = (restaurant.reservations || []).find((entry) => entry.id === id);
      if (!reservation) throw new Error('The reservation could not be found.');

      if (!tableId || tableId === 'none' || tableId === 'unassigned') {
        const before = { assignedTable: clone(reservation.assignedTable || null) };
        reservation.assignedTable = null;
        reservation.updatedAt = new Date().toISOString();
        const shared = (store.customerReservations || []).find((entry) => entry.id === id);
        if (shared) Object.assign(shared, { assignedTable: null, updatedAt: reservation.updatedAt });
        return { reservation, before, restaurantId: restaurant.id, table: null };
      }

      const table = getRestaurantTables(restaurant.id, store).find((entry) => entry.id === tableId);
      if (!table) throw new Error('Choose a valid table for this restaurant.');
      if (table.isActive === false || table.isArchived || table.status === 'Inactive' || table.status === 'Archived') {
        throw new Error('This table is inactive or archived and cannot be assigned to reservations.');
      }
      const before = { assignedTable: clone(reservation.assignedTable || null) };
      const candidate = { ...reservation, assignedTable: table };
      if (!isTableAvailableForReservation(restaurant.id, candidate, store)) {
        throw new Error('That table is unavailable, undersized, or overlaps another active reservation.');
      }
      reservation.assignedTable = clone(table);
      reservation.seatingArea = table.area || reservation.seatingArea;
      reservation.updatedAt = new Date().toISOString();
      const shared = (store.customerReservations || []).find((entry) => entry.id === id);
      if (shared) Object.assign(shared, { assignedTable: clone(table), seatingArea: reservation.seatingArea, updatedAt: reservation.updatedAt });
      return { reservation, before, restaurantId: restaurant.id, table };
    });
    this.logActivity({ module: 'reservations', action: 'table-assigned', targetId: id, before: result.before, after: { assignedTable: result.table }, restaurantId: result.restaurantId });
    return result.reservation;
  },

  confirmReservationTable(id, restaurantId) {
    const result = updateStore((store) => {
      const restaurant = findRestaurant(restaurantId, store);
      if (!restaurant) throw new Error('The selected restaurant could not be found.');
      assertReservationPermission(store, restaurant.id, 'manageArrival');
      const reservation = restaurant.reservations.find((entry) => entry.id === id);
      if (!reservation) throw new Error('The reservation could not be found.');
      if (!reservation.assignedTable) throw new Error('Assign a table before confirming the guest arrival.');
      const before = { tableConfirmedAt: reservation.tableConfirmedAt || null };
      reservation.tableConfirmedAt = new Date().toISOString();
      reservation.updatedAt = reservation.tableConfirmedAt;
      const shared = (store.customerReservations || []).find((entry) => entry.id === id);
      if (shared) Object.assign(shared, { tableConfirmedAt: reservation.tableConfirmedAt, updatedAt: reservation.updatedAt });
      return { reservation, before, restaurantId: restaurant.id };
    });
    this.logActivity({ module: 'reservations', action: 'table-confirmed', targetId: id, before: result.before, after: { tableConfirmedAt: result.reservation.tableConfirmedAt }, restaurantId: result.restaurantId });
    return result.reservation;
  },

  resolveReservationCancellation(id, decision, restaurantId, reason = '') {
    if (!['approve', 'decline'].includes(decision)) throw new Error('Choose whether to approve or decline the cancellation request.');
    const result = updateStore((store) => {
      const restaurant = findRestaurant(restaurantId, store);
      if (!restaurant) throw new Error('The selected restaurant could not be found.');
      assertReservationPermission(store, restaurant.id, 'updateStatus');
      const reservation = restaurant.reservations.find((entry) => entry.id === id);
      if (!reservation || reservation.cancellationRequest?.status !== 'requested') {
        throw new Error('There is no pending customer cancellation request for this reservation.');
      }
      if (decision === 'decline' && !String(reason).trim()) throw new Error('A reason is required to decline a cancellation request.');
      const before = clone(reservation.cancellationRequest);
      const timestamp = new Date().toISOString();
      reservation.cancellationRequest = {
        ...reservation.cancellationRequest,
        status: decision === 'approve' ? 'approved' : 'declined',
        resolvedAt: timestamp,
        resolutionReason: String(reason).trim() || null,
      };
      if (decision === 'approve') {
        if (!canTransitionReservationStatus(reservation.status, 'Cancelled')) {
          throw new Error(`An order cannot move from ${reservation.status} to Cancelled.`);
        }
        reservation.status = 'Cancelled';
        reservation.statusHistory = [...(reservation.statusHistory || []), { status: 'Cancelled', timestamp }];
        reservation.refundStatus = reservation.paymentStatus === 'Paid' ? 'Pending review' : 'Not applicable';
      }
      reservation.updatedAt = timestamp;
      const shared = (store.customerReservations || []).find((entry) => entry.id === id);
      if (shared) Object.assign(shared, clone(reservation));
      return { reservation, before, restaurantId: restaurant.id };
    });
    this.logActivity({
      module: 'reservations',
      action: 'cancellation-processed',
      targetId: id,
      before: result.before,
      after: clone(result.reservation.cancellationRequest),
      restaurantId: result.restaurantId,
    });
    return result.reservation;
  },

  recordReservationPayment(id, restaurantId, reference = '') {
    const result = updateStore((store) => {
      const restaurant = findRestaurant(restaurantId, store);
      if (!restaurant) throw new Error('The selected restaurant could not be found.');
      assertReservationPermission(store, restaurant.id, 'updateStatus');
      const reservation = restaurant.reservations.find((entry) => entry.id === id);
      if (!reservation) throw new Error('The reservation could not be found.');
      if (!['Approved', 'Awaiting Payment'].includes(reservation.status)) {
        throw new Error('Approve the reservation and mark it awaiting payment before recording payment.');
      }
      const nextStatus = reservation.status === 'Approved' ? 'Awaiting Payment' : 'Confirmed';
      if (!canTransitionReservationStatus(reservation.status, nextStatus)) {
        throw new Error(`An order cannot move from ${reservation.status} to ${nextStatus}.`);
      }
      const before = { status: reservation.status, paymentStatus: reservation.paymentStatus || 'Pending' };
      const timestamp = new Date().toISOString();
      reservation.status = nextStatus;
      reservation.paymentStatus = nextStatus === 'Confirmed' ? 'Paid' : 'Pending';
      if (nextStatus === 'Confirmed') {
        reservation.paymentMethod = 'Demo payment';
        reservation.totalPaid = Number(reservation.fee ?? reservation.depositAmount ?? 0);
        reservation.paymentReference = String(reference).trim() || `DEMO-${id}`;
      }
      reservation.updatedAt = timestamp;
      reservation.statusHistory = [...(reservation.statusHistory || []), { status: nextStatus, timestamp }];
      const shared = (store.customerReservations || []).find((entry) => entry.id === id);
      if (shared) Object.assign(shared, clone(reservation));
      return { reservation, before, restaurantId: restaurant.id };
    });
    this.logActivity({ module: 'reservations', action: result.reservation.status === 'Confirmed' ? 'payment-confirmed' : 'awaiting-payment', targetId: id, before: result.before, after: { status: result.reservation.status, paymentStatus: result.reservation.paymentStatus }, restaurantId: result.restaurantId });
    return result.reservation;
  },

  updateReservationStatus(id, status, restaurantId, details = {}) {
    const action = status === 'Rejected' ? 'reject'
      : ['Arrived', 'Seated', 'Completed', 'No-Show'].includes(status) ? 'manageArrival'
        : status === 'Approved' ? 'approve' : 'updateStatus';
    const result = updateStore((store) => {
      const restaurant = findRestaurant(restaurantId, store);
      if (!restaurant) throw new Error('The selected restaurant could not be found.');
      assertReservationPermission(store, restaurant.id, action);
      const reservation = restaurant.reservations.find((entry) => entry.id === id);
      if (!reservation) throw new Error('The reservation could not be found.');
      if (status === 'Rejected' && !String(details.reason || '').trim()) {
        throw new Error('A rejection reason is required.');
      }
      if (!canTransitionReservationStatus(reservation.status, status)) {
        throw new Error(`A reservation cannot move from ${reservation.status} to ${status}.`);
      }
      if (status === 'Arrived' && !reservation.assignedTable) {
        throw new Error('Assign a table before marking the guest as arrived.');
      }
      if (status === 'Seated' && !reservation.tableConfirmedAt) {
        throw new Error('Confirm the assigned table before seating the guest.');
      }
      const before = { status: reservation.status, rejectionReason: reservation.rejectionReason || null };
      reservation.status = status;
      reservation.updatedAt = new Date().toISOString();
      if (status === 'Rejected') reservation.rejectionReason = String(details.reason).trim();
      reservation.statusHistory = [...(reservation.statusHistory || []), { status, timestamp: reservation.updatedAt, reason: reservation.rejectionReason || null }];
      const shared = (store.customerReservations || []).find((entry) => entry.id === id);
      if (shared) Object.assign(shared, clone(reservation));
      return { reservation, before, restaurantId: restaurant.id };
    });
    this.logActivity({
      module: 'reservations',
      action: status === 'Approved' ? 'approved' : status === 'Rejected' ? 'rejected' : status.toLowerCase().replaceAll('-', '-'),
      targetId: id,
      before: result.before,
      after: { status, rejectionReason: result.reservation.rejectionReason || null },
      restaurantId: result.restaurantId,
    });
    return result.reservation;
  },

  getEarningsOverview(id) {
    const earnings = findRestaurant(id)?.earnings;
    if (!earnings) throw new Error('Earnings are unavailable for the selected restaurant.');
    return {
      ...clone(earnings),
      recentSales: clone(earnings.revenueByDay || []),
    };
  },

  getDashboardStats(id) {
    const restaurant = findRestaurant(id);
    if (!restaurant) throw new Error('The selected restaurant could not be found.');
    const orders = this.getOrders(restaurant.id);
    const reservations = restaurant.reservations || [];
    const menuItems = restaurant.menu || [];
    const earnings = this.getEarningsOverview(restaurant.id);
    const todayOrders = orders.filter((order) => order.status !== 'Cancelled');

    return {
      todayRevenue: earnings.today,
      ordersToday: todayOrders.length,
      pendingOrders: orders.filter((order) => order.status === 'Pending').length,
      preparingOrders: orders.filter((order) => order.status === 'Preparing').length,
      completedToday: orders.filter((order) => order.status === 'Completed').length,
      pendingReservations: reservations.filter((reservation) => reservation.status === 'Pending').length,
      totalMenuItems: menuItems.length,
      unavailableItems: menuItems.filter((item) => !item.isAvailable).length,
      avgOrderValue: earnings.avgOrderValue,
    };
  },

  getActivityLog(restaurantId) {
    return clone(readStore().activities.filter((entry) => entry.restaurantId === (restaurantId || currentRestaurantId())));
  },

  logActivity({ module, action, targetId = null, before = null, after = null, restaurantId } = {}) {
    return updateStore((store) => appendActivity(store, { module, action, targetId, before, after, restaurantId }));
  },

  async uploadImage(file) {
    if (!file) throw new Error('Choose an image to upload.');
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      throw new Error('Choose a JPG, PNG, or WebP image.');
    }
    if (file.size > MAX_IMAGE_BYTES) {
      throw new Error('The selected image must be 5 MB or smaller.');
    }

    let bitmap;
    try {
      bitmap = await createImageBitmap(file);
    } catch {
      throw new Error('The selected file is not a readable image.');
    }

    const { width, height } = bitmap;
    bitmap.close();
    if (width < MIN_IMAGE_DIMENSION || height < MIN_IMAGE_DIMENSION) {
      throw new Error(`Image dimensions must be at least ${MIN_IMAGE_DIMENSION} × ${MIN_IMAGE_DIMENSION} pixels.`);
    }

    const compressed = await compressImage(file);
    const id = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `image-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await storeImage({ id, blob: compressed.blob, width: compressed.width, height: compressed.height });
    return { id, name: file.name, type: 'image/webp', size: compressed.blob.size, width: compressed.width, height: compressed.height };
  },

  async getImageUrl(image) {
    if (!image?.id) return image?.src || null;
    if (imageUrlCache.has(image.id)) return imageUrlCache.get(image.id);
    const blob = await readImage(image.id);
    const url = URL.createObjectURL(blob);
    imageUrlCache.set(image.id, url);
    return url;
  },

  async removeImage(image) {
    if (!image?.id) return;
    const database = await openImageDatabase();
    try {
      await new Promise((resolve, reject) => {
        const transaction = database.transaction(IMAGE_STORE_NAME, 'readwrite');
        transaction.objectStore(IMAGE_STORE_NAME).delete(image.id);
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(new Error(`Unable to remove demo image: ${transaction.error?.message || 'unknown error'}`));
        transaction.onabort = () => reject(new Error(`Demo image removal was aborted: ${transaction.error?.message || 'unknown error'}`));
      });
    } finally {
      database.close();
    }
    const url = imageUrlCache.get(image.id);
    if (url) URL.revokeObjectURL(url);
    imageUrlCache.delete(image.id);
  },
};

export default demoAdapter;
