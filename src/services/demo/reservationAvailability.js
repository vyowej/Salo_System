import {
  createOperatingDateTime,
  isRestaurantOpen,
  getLocalDateKey,
} from './operatingHours.js';

export const STANDARD_TIME_SLOTS = Object.freeze([
  '10:00 AM',
  '11:00 AM',
  '12:00 PM',
  '1:00 PM',
  '2:00 PM',
  '3:00 PM',
  '4:00 PM',
  '5:00 PM',
  '6:00 PM',
  '7:00 PM',
  '8:00 PM',
  '9:00 PM',
]);

const DEFAULT_RESTAURANT_CAPACITY = 24;

/**
 * Storage helpers for blocked time slots and custom slot capacity
 */
export function getStoredBlockedSlots(restaurantId) {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(`salo_blocked_slots_${restaurantId}`) : null;
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveStoredBlockedSlots(restaurantId, blockedSlots) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(`salo_blocked_slots_${restaurantId}`, JSON.stringify(blockedSlots));
      window.dispatchEvent(new Event('salo:demoStoreUpdated'));
    }
  } catch {
    // ignore
  }
}

export function getStoredSlotCapacity(restaurantId, fallback = DEFAULT_RESTAURANT_CAPACITY) {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(`salo_slot_capacity_${restaurantId}`) : null;
    return raw ? Number(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function saveStoredSlotCapacity(restaurantId, capacity) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(`salo_slot_capacity_${restaurantId}`, String(capacity));
      window.dispatchEvent(new Event('salo:demoStoreUpdated'));
    }
  } catch {
    // ignore
  }
}

/**
 * Calculates total available seating capacity per time slot for a restaurant.
 */
export function getRestaurantSlotCapacity(restaurant, tables = []) {
  if (restaurant?.id) {
    const customCapacity = getStoredSlotCapacity(restaurant.id, null);
    if (customCapacity && Number.isFinite(customCapacity) && customCapacity > 0) {
      return customCapacity;
    }
  }

  if (Array.isArray(tables) && tables.length > 0) {
    const availableTables = tables.filter(
      (t) => t.status !== 'Unavailable' && t.status !== 'Maintenance' && t.availability !== 'unavailable'
    );
    if (availableTables.length > 0) {
      const sum = availableTables.reduce((acc, t) => acc + (Number(t.capacity) || 0), 0);
      return Math.max(sum, 10);
    }
  }

  if (Array.isArray(restaurant?.tables) && restaurant.tables.length > 0) {
    const availableTables = restaurant.tables.filter(
      (t) => t.status !== 'Unavailable' && t.status !== 'Maintenance' && t.availability !== 'unavailable'
    );
    if (availableTables.length > 0) {
      const sum = availableTables.reduce((acc, t) => acc + (Number(t.capacity) || 0), 0);
      return Math.max(sum, 10);
    }
  }

  return Number(restaurant?.slotCapacity) || DEFAULT_RESTAURANT_CAPACITY;
}

/**
 * Checks if a reservation is active (consumes seating capacity).
 */
export function isCapacityConsumingReservation(reservation) {
  if (!reservation) return false;
  const status = reservation.status;
  return ['Pending', 'Approved', 'Confirmed', 'Arrived', 'Seated'].includes(status);
}

/**
 * Computes availability details for a specific time slot on a specific date.
 */
export function computeSlotAvailability(
  slotTime,
  dateStr,
  restaurant,
  reservations = [],
  requestedGuests = 1,
  tables = [],
  blockedSlots = []
) {
  const slotCapacity = getRestaurantSlotCapacity(restaurant, tables);

  // Check if restaurant is accepting reservations generally
  if (restaurant?.operatingSchedule?.acceptingReservations === false) {
    return {
      time: slotTime,
      status: 'unavailable',
      statusLabel: 'Unavailable',
      isClosed: true,
      totalCapacity: slotCapacity,
      reservedSeats: 0,
      remainingSeats: 0,
      canAccommodate: false,
      reason: 'Restaurant is currently not accepting online reservations.',
      reservations: [],
    };
  }

  // Check if slot is explicitly blocked
  const allBlocked = [
    ...(restaurant?.blockedSlots || []),
    ...(blockedSlots || []),
    ...(restaurant?.id ? getStoredBlockedSlots(restaurant.id) : []),
  ];
  const blockedEntry = allBlocked.find((b) => b.date === dateStr && b.time === slotTime);
  if (blockedEntry) {
    return {
      time: slotTime,
      status: 'unavailable',
      statusLabel: 'Blocked',
      isClosed: true,
      isBlocked: true,
      blockReason: blockedEntry.reason || 'Blocked by restaurant',
      totalCapacity: slotCapacity,
      reservedSeats: 0,
      remainingSeats: 0,
      canAccommodate: false,
      reason: blockedEntry.reason || 'Time slot blocked by restaurant',
      reservations: [],
    };
  }

  // Check operating hours & temporary closures
  const dateTime = createOperatingDateTime(dateStr, slotTime);
  const isOpen = dateTime
    ? isRestaurantOpen(
        restaurant?.operatingSchedule,
        restaurant?.operatingSchedule?.temporaryClosures,
        dateTime
      )
    : false;

  if (!isOpen) {
    return {
      time: slotTime,
      status: 'unavailable',
      statusLabel: 'Closed',
      isClosed: true,
      totalCapacity: slotCapacity,
      reservedSeats: 0,
      remainingSeats: 0,
      canAccommodate: false,
      reason: 'Restaurant is closed at this time.',
      reservations: [],
    };
  }

  // Check if slot is in the past
  const now = new Date();
  const isPast = dateTime && dateTime < now;

  // Filter reservations for this restaurant, date, and time
  const activeBookings = (reservations || []).filter((r) => {
    if (!r || r.date !== dateStr) return false;
    if (r.time !== slotTime) return false;
    return isCapacityConsumingReservation(r);
  });

  const reservedSeats = activeBookings.reduce(
    (acc, r) => acc + (Number(r.guests ?? r.partySize) || 2),
    0
  );

  const remainingSeats = Math.max(0, slotCapacity - reservedSeats);
  const isFullyBooked = remainingSeats <= 0;
  const hasBookings = reservedSeats > 0;
  const canAccommodate = !isPast && !isFullyBooked && remainingSeats >= Number(requestedGuests);

  let status = 'available';
  let statusLabel = 'Available';

  if (isPast) {
    status = 'unavailable';
    statusLabel = 'Past Slot';
  } else if (isFullyBooked) {
    status = 'fully_booked';
    statusLabel = 'Fully Booked';
  } else if (hasBookings) {
    status = 'limited';
    statusLabel = 'Limited Availability';
  }

  return {
    time: slotTime,
    status,
    statusLabel,
    isClosed: false,
    isPast,
    totalCapacity: slotCapacity,
    reservedSeats,
    remainingSeats,
    canAccommodate,
    reason: isPast
      ? 'Past time slot'
      : isFullyBooked
      ? 'Maximum slot capacity reached'
      : !canAccommodate
      ? `Only ${remainingSeats} seat${remainingSeats === 1 ? '' : 's'} remaining (requested: ${requestedGuests})`
      : 'Available for reservation',
    reservations: activeBookings,
  };
}

/**
 * Computes date-level availability for an entire day.
 */
export function computeDayAvailability(
  dateStr,
  restaurant,
  reservations = [],
  requestedGuests = 1,
  tables = [],
  blockedSlots = []
) {
  if (!dateStr) {
    return {
      date: dateStr,
      status: 'unavailable',
      statusLabel: 'Unavailable',
      isPast: false,
      isClosed: true,
      totalBookings: 0,
      confirmedBookings: 0,
      pendingBookings: 0,
      slots: [],
    };
  }

  // Check past date
  const now = new Date();
  const todayKey = getLocalDateKey(now);
  const isPast = dateStr < todayKey;

  // Evaluate all standard time slots for this date
  const slots = STANDARD_TIME_SLOTS.map((slotTime) =>
    computeSlotAvailability(slotTime, dateStr, restaurant, reservations, requestedGuests, tables, blockedSlots)
  );

  const openSlots = slots.filter((s) => !s.isClosed);
  const totalBookings = reservations.filter(
    (r) => r && r.date === dateStr && isCapacityConsumingReservation(r)
  ).length;

  const confirmedBookings = reservations.filter(
    (r) => r && r.date === dateStr && ['Approved', 'Confirmed', 'Arrived', 'Seated'].includes(r.status)
  ).length;

  const pendingBookings = reservations.filter(
    (r) => r && r.date === dateStr && r.status === 'Pending'
  ).length;

  // Determine daily overall status
  let status;
  let statusLabel;

  if (openSlots.length === 0) {
    status = 'unavailable';
    statusLabel = 'Unavailable / Closed';
  } else if (isPast) {
    status = 'unavailable';
    statusLabel = 'Past Date';
  } else {
    const availableSlots = openSlots.filter((s) => s.status === 'available' || s.status === 'limited');
    const fullyBookedSlots = openSlots.filter((s) => s.status === 'fully_booked');

    if (availableSlots.length === 0 && fullyBookedSlots.length > 0) {
      status = 'fully_booked';
      statusLabel = 'Fully Booked';
    } else if (fullyBookedSlots.length > 0 || totalBookings > 0) {
      status = 'partially_booked';
      statusLabel = 'Partially Booked';
    } else {
      status = 'available';
      statusLabel = 'Available';
    }
  }

  return {
    date: dateStr,
    status,
    statusLabel,
    isPast,
    isClosed: openSlots.length === 0,
    totalBookings,
    confirmedBookings,
    pendingBookings,
    slots,
  };
}

/**
 * Pre-computes month-level availability map for fast calendar rendering.
 */
export function getMonthAvailabilityMap(
  year,
  month,
  restaurant,
  reservations = [],
  requestedGuests = 1,
  tables = [],
  blockedSlots = []
) {
  const totalDays = new Date(year, month + 1, 0).getDate();
  const map = {};

  for (let day = 1; day <= totalDays; day++) {
    const dayStr = String(day).padStart(2, '0');
    const monthStr = String(month + 1).padStart(2, '0');
    const dateKey = `${year}-${monthStr}-${dayStr}`;
    map[dateKey] = computeDayAvailability(dateKey, restaurant, reservations, requestedGuests, tables, blockedSlots);
  }

  return map;
}

/**
 * Computes reservation statistics filtered by date range.
 */
export function computeReservationStats(reservations = [], range = 'all', referenceDate = new Date()) {
  const refKey = getLocalDateKey(referenceDate);

  const filtered = (reservations || []).filter((r) => {
    if (!r.date) return false;
    if (range === 'today') {
      return r.date === refKey;
    }
    if (range === 'week') {
      const cur = new Date(referenceDate);
      const dayIdx = (cur.getDay() + 6) % 7;
      const mon = new Date(cur);
      mon.setDate(cur.getDate() - dayIdx);
      const sun = new Date(mon);
      sun.setDate(mon.getDate() + 6);
      const monKey = getLocalDateKey(mon);
      const sunKey = getLocalDateKey(sun);
      return r.date >= monKey && r.date <= sunKey;
    }
    if (range === 'month') {
      const year = referenceDate.getFullYear();
      const month = String(referenceDate.getMonth() + 1).padStart(2, '0');
      return r.date.startsWith(`${year}-${month}`);
    }
    return true; // 'all'
  });

  const total = filtered.length;
  const pending = filtered.filter((r) => r.status === 'Pending').length;
  const confirmed = filtered.filter((r) => ['Approved', 'Confirmed', 'Arrived', 'Seated'].includes(r.status)).length;
  const todayCount = (reservations || []).filter((r) => r.date === refKey && r.status !== 'Cancelled').length;
  const cancelled = filtered.filter((r) => ['Cancelled', 'Rejected', 'No-Show'].includes(r.status)).length;
  const totalGuests = filtered.reduce((acc, r) => acc + (Number(r.guests || r.partySize) || 0), 0);

  return {
    total,
    pending,
    confirmed,
    today: todayCount,
    cancelled,
    totalGuests,
  };
}
