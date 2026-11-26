/**
 * SALO — Public Restaurants & Menus Service
 * Read-only service backed by /api/restaurant-categories, /api/restaurants,
 * /api/restaurants/{id}, and /api/restaurants/{id}/menu.
 */

import apiClient from './apiClient.js';

function formatTime12h(hhmm) {
  if (!hhmm || typeof hhmm !== 'string') return '';
  const [hStr, mStr] = hhmm.split(':');
  const h = Number(hStr);
  const m = Number(mStr || 0);
  if (Number.isNaN(h)) return hhmm;
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

export function formatOperatingHoursSummary(operatingHours = []) {
  if (!Array.isArray(operatingHours) || operatingHours.length === 0) {
    return 'Hours unavailable';
  }

  const todayDow = new Date().getDay();
  const todayPeriods = operatingHours.filter((p) => Number(p.day_of_week) === todayDow && !p.is_closed);

  if (todayPeriods.length === 0) {
    return 'Closed today';
  }

  return todayPeriods
    .map((p) => {
      const open = formatTime12h(p.opening_time);
      const close = formatTime12h(p.closing_time);
      return p.closes_next_day ? `${open} – ${close} (+1d)` : `${open} – ${close}`;
    })
    .join(', ');
}

function mapRestaurantListItem(raw) {
  const categories = Array.isArray(raw.categories) ? raw.categories : [];
  const categoryNames = categories.map((c) => c.name).filter(Boolean);

  return {
    id: String(raw.id),
    name: raw.name,
    branchName: raw.branch_name || null,
    brandRestaurantId: raw.brand_restaurant_id ? String(raw.brand_restaurant_id) : String(raw.id),
    displayName: raw.display_name || raw.name,
    branchCount: Number(raw.branch_count ?? 1),
    businessType: raw.business_type || '',
    cuisine: categoryNames.join(' · ') || raw.business_type || 'Restaurant',
    categories,
    description: raw.description || '',
    logoImage: raw.logo_path || null,
    coverPhoto: raw.cover_path || null,
    address: raw.short_address || '',
    offers: raw.offers || { delivery: false, pickup: false, dine_in: false, reservations: false },
    canReserve:
      raw.can_reserve !== undefined
        ? Boolean(raw.can_reserve)
        : Boolean(raw.availability?.can_reserve ?? (raw.offers?.reservations && raw.availability?.accepting_reservations)),
    availability: raw.availability || {
      is_open: false,
      status_label: 'Closed',
      accepting_orders: true,
      accepting_reservations: true,
      not_accepting_orders: false,
      not_accepting_reservations: false,
      temporarily_unavailable: false,
    },
    isOpen: Boolean(raw.availability?.is_open),
    rating: raw.average_rating ?? null,
    reviewCount: raw.review_count ?? null,
  };
}

function mapMenuItem(rawItem, categoryName) {
  const addOnGroups = Array.isArray(rawItem.add_on_groups) ? rawItem.add_on_groups : [];

  return {
    id: String(rawItem.id),
    name: rawItem.name,
    description: rawItem.description || '',
    price: Number(rawItem.price ?? 0),
    category: categoryName,
    photo: rawItem.photo_path || null,
    availability: rawItem.availability_status || 'available',
    availabilityLabel: rawItem.availability || 'Available',
    isAvailable: rawItem.availability_status === 'available',
    addOns: addOnGroups.map((group) => ({
      id: String(group.id),
      name: group.name,
      required: Boolean(group.is_required),
      minSelection: Number(group.minimum_selections ?? 0),
      maxSelection: Number(group.maximum_selections ?? 1),
      isAvailable: true,
      options: (Array.isArray(group.options) ? group.options : []).map((opt) => ({
        id: String(opt.id),
        name: opt.name,
        price: Number(opt.additional_price ?? 0),
        isAvailable: Boolean(opt.is_available),
      })),
    })),
  };
}

export function normalizeRestaurantWithMenuPayload(raw, menuCategories = []) {
  if (!raw) return null;

  const categories = Array.isArray(raw.categories) ? raw.categories : [];
  const categoryNames = categories.map((c) => c.name).filter(Boolean);
  const safeMenuCategories = Array.isArray(menuCategories) ? menuCategories : [];

  const menu = safeMenuCategories.flatMap((cat) =>
    (Array.isArray(cat.items) ? cat.items : []).map((item) => mapMenuItem(item, cat.name)),
  );

  return {
    id: String(raw.id),
    name: raw.name,
    branchName: raw.branch_name || null,
    brandRestaurantId: raw.brand_restaurant_id ? String(raw.brand_restaurant_id) : String(raw.id),
    displayName: raw.display_name || raw.name,
    branchCount: Number(raw.branch_count ?? 1),
    siblings: Array.isArray(raw.siblings)
      ? raw.siblings.map((sib) => ({
        id: String(sib.id),
        branchName: sib.branch_name || null,
        displayName: sib.display_name || sib.branch_name || raw.name,
        shortAddress: sib.short_address || '',
        availability: sib.availability || {},
      }))
      : [],
    businessType: raw.business_type || '',
    cuisine: categoryNames.join(' · ') || raw.business_type || 'Restaurant',
    foodCategories: categoryNames,
    description: raw.description || '',
    logoImage: raw.logo_path || null,
    coverPhoto: raw.cover_path || null,
    address: raw.address?.full || raw.address?.short || '',
    shortAddress: raw.address?.short || '',
    phone: raw.contact_phone || null,
    operatingHours: formatOperatingHoursSummary(raw.operating_hours),
    operatingHoursList: Array.isArray(raw.operating_hours) ? raw.operating_hours : [],
    availability: raw.availability || {},
    isOpen: Boolean(raw.availability?.is_open),
    fulfillment: {
      delivery: Boolean(raw.offers?.delivery),
      pickup: Boolean(raw.offers?.pickup),
      dineIn: Boolean(raw.offers?.dine_in),
      reservations: Boolean(raw.offers?.reservations),
    },
    canReserve:
      raw.can_reserve !== undefined
        ? Boolean(raw.can_reserve)
        : Boolean(raw.availability?.can_reserve ?? (raw.offers?.reservations && raw.availability?.accepting_reservations)),
    reservationMinNoticeHours: Number(raw.reservation_min_notice_hours ?? 2),
    reservationMaxPartySize: Number(raw.reservation_max_party_size ?? 8),
    reservationNotes: raw.reservation_notes ?? null,
    reservationDurationMinutes: Number(raw.reservation_duration_minutes ?? 90),
    reservationMaxAdvanceDays: Number(raw.reservation_max_advance_days ?? 30),
    reservationCancellationCutoffMinutes: Number(raw.reservation_cancellation_cutoff_minutes ?? 120),
    reservationDepositRequired: Boolean(raw.reservation_deposit_required ?? false),
    reservationDepositAmount: Number(raw.reservation_deposit_amount ?? 0),
    reservationServiceFee: Number(raw.reservation_service_fee ?? 0),
    operatingSchedule: {
      acceptingOrders: Boolean(raw.availability?.accepting_orders),
      acceptingReservations: Boolean(raw.availability?.accepting_reservations),
    },
    rating: raw.rating_summary?.average_rating ?? null,
    reviewCount: raw.rating_summary?.review_count ?? null,
    categories: safeMenuCategories.map((c) => c.name),
    menu,
  };
}

export const publicRestaurantService = {
  async getCategories() {
    const response = await apiClient.get('/restaurant-categories', {
      skipAuthInvalidEvent: true,
    });
    return response?.data?.categories || [];
  },

  async getRestaurants(params = {}) {
    const query = new URLSearchParams();
    if (params.page) query.set('page', String(params.page));
    if (params.per_page) query.set('per_page', String(params.per_page));
    if (params.search?.trim()) query.set('search', params.search.trim());
    if (params.category && params.category !== 'All') query.set('category', params.category);
    if (params.offers_delivery) query.set('offers_delivery', 'true');
    if (params.offers_pickup) query.set('offers_pickup', 'true');
    if (params.offers_dine_in) query.set('offers_dine_in', 'true');
    if (params.sort) query.set('sort', params.sort);

    const qs = query.toString();
    const response = await apiClient.get(`/restaurants${qs ? `?${qs}` : ''}`, {
      skipAuthInvalidEvent: true,
    });

    const rawList = response?.data?.restaurants || [];
    const pagination = response?.data?.pagination || {
      current_page: 1,
      per_page: 12,
      total: rawList.length,
      last_page: 1,
    };

    return {
      restaurants: rawList.map(mapRestaurantListItem),
      pagination,
    };
  },

  async getRestaurantWithMenu(id) {
    const [detailRes, menuRes] = await Promise.all([
      apiClient.get(`/restaurants/${encodeURIComponent(id)}`, { skipAuthInvalidEvent: true }),
      apiClient.get(`/restaurants/${encodeURIComponent(id)}/menu`, { skipAuthInvalidEvent: true }),
    ]);

    const raw = detailRes?.data?.restaurant;
    if (!raw) return null;

    const menuCategories = Array.isArray(menuRes?.data?.categories) ? menuRes.data.categories : [];
    return normalizeRestaurantWithMenuPayload(raw, menuCategories);
  },

  async getReservationInfo(restaurantId) {
    const response = await apiClient.get(
      `/restaurants/${encodeURIComponent(restaurantId)}/reservation-info`,
      { skipAuthInvalidEvent: true },
    );
    return normalizeReservationInfo(response?.data ?? null);
  },

  async getReservationMonthOverview(restaurantId, month, partySize) {
    const query = new URLSearchParams();
    if (month !== undefined && month !== null) query.set('month', String(month));
    if (partySize !== undefined && partySize !== null) query.set('party_size', String(partySize));
    const qs = query.toString();

    const response = await apiClient.get(
      `/restaurants/${encodeURIComponent(restaurantId)}/reservation-availability/month${qs ? `?${qs}` : ''}`,
      { skipAuthInvalidEvent: true },
    );
    return normalizeReservationMonthOverview(response?.data ?? null);
  },

  async getReservationAvailability(restaurantId, date, partySize, diningArea = '') {
    const query = new URLSearchParams();
    if (date !== undefined && date !== null) query.set('date', String(date));
    if (partySize !== undefined && partySize !== null) query.set('party_size', String(partySize));
    if (diningArea && String(diningArea).trim() && diningArea !== 'all') {
      query.set('dining_area', String(diningArea).trim());
    }
    const qs = query.toString();

    const response = await apiClient.get(
      `/restaurants/${encodeURIComponent(restaurantId)}/reservation-availability${qs ? `?${qs}` : ''}`,
      { skipAuthInvalidEvent: true },
    );
    return normalizeReservationDayAvailability(response?.data ?? null);
  },

  async getReservationTables(restaurantId, start, partySize, diningArea = '') {
    const query = new URLSearchParams();
    if (start !== undefined && start !== null) query.set('start', String(start));
    if (partySize !== undefined && partySize !== null) query.set('party_size', String(partySize));
    if (diningArea && String(diningArea).trim() && diningArea !== 'all') {
      query.set('dining_area', String(diningArea).trim());
    }
    const qs = query.toString();

    const response = await apiClient.get(
      `/restaurants/${encodeURIComponent(restaurantId)}/reservation-availability/tables${qs ? `?${qs}` : ''}`,
      { skipAuthInvalidEvent: true },
    );
    return normalizeReservationSlotTables(response?.data ?? null);
  },
};

export function normalizeReservationInfo(raw) {
  if (!raw || typeof raw !== 'object') return null;

  return {
    restaurantId: Number(raw.restaurant_id ?? raw.restaurantId ?? 0),
    restaurantName: raw.restaurant_name ?? raw.restaurantName ?? '',
    bookable: Boolean(raw.bookable ?? false),
    canReserve: Boolean(raw.can_reserve ?? raw.canReserve ?? false),
    reasonCode: raw.reason_code ?? raw.reasonCode ?? null,
    message: raw.message ?? '',
    offersDineIn: Boolean(raw.offers_dine_in ?? raw.offersDineIn ?? false),
    acceptsReservations: Boolean(raw.accepts_reservations ?? raw.acceptsReservations ?? false),
    acceptingReservations: Boolean(raw.accepting_reservations ?? raw.acceptingReservations ?? false),
    isOpen: Boolean(raw.is_open ?? raw.isOpen ?? false),
    statusLabel: raw.status_label ?? raw.statusLabel ?? 'Closed',
    temporarilyUnavailable: Boolean(raw.temporarily_unavailable ?? raw.temporarilyUnavailable ?? false),
    closureReason: raw.closure_reason ?? raw.closureReason ?? null,
    reservationMinNoticeHours: Number(raw.reservation_min_notice_hours ?? raw.reservationMinNoticeHours ?? 2),
    reservationMaxPartySize: Number(raw.reservation_max_party_size ?? raw.reservationMaxPartySize ?? 8),
    effectiveMaxPartySize: Number(raw.effective_max_party_size ?? raw.effectiveMaxPartySize ?? raw.reservation_max_party_size ?? 8),
    smallestMinPartySize: Number(raw.smallest_min_party_size ?? raw.smallestMinPartySize ?? 1),
    reservationNotes: raw.reservation_notes ?? raw.reservationNotes ?? null,
    reservationDurationMinutes: Number(raw.reservation_duration_minutes ?? raw.reservationDurationMinutes ?? 90),
    reservationMaxAdvanceDays: Number(raw.reservation_max_advance_days ?? raw.reservationMaxAdvanceDays ?? 30),
    reservationCancellationCutoffMinutes: Number(
      raw.reservation_cancellation_cutoff_minutes ?? raw.reservationCancellationCutoffMinutes ?? 120,
    ),
    reservationAutoConfirm: Boolean(raw.reservation_auto_confirm ?? raw.reservationAutoConfirm ?? false),
    reservationDepositRequired: Boolean(raw.reservation_deposit_required ?? raw.reservationDepositRequired ?? false),
    reservationDepositAmount: Number(raw.reservation_deposit_amount ?? raw.reservationDepositAmount ?? 0),
    reservationServiceFee: Number(raw.reservation_service_fee ?? raw.reservationServiceFee ?? 0),
    slotIntervalMinutes: Number(raw.slot_interval_minutes ?? raw.slotIntervalMinutes ?? 30),
    diningAreas: Array.isArray(raw.dining_areas ?? raw.diningAreas)
      ? (raw.dining_areas ?? raw.diningAreas).filter(Boolean)
      : [],
    activeTableCount: Number(raw.active_table_count ?? raw.activeTableCount ?? 0),
    largestTableCapacity: Number(raw.largest_table_capacity ?? raw.largestTableCapacity ?? 0),
  };
}

export function normalizeReservationSlot(raw) {
  if (!raw || typeof raw !== 'object') return null;

  return {
    start: raw.start ?? null,
    end: raw.end ?? null,
    time: raw.time ?? null,
    timeLabel: raw.time_label ?? raw.timeLabel ?? '',
    available: Boolean(raw.available ?? false),
    availableTableCount: Number(raw.available_table_count ?? raw.availableTableCount ?? 0),
    reasonCode: raw.reason_code ?? raw.reasonCode ?? null,
    diningAreasAvailable: Array.isArray(raw.dining_areas_available ?? raw.diningAreasAvailable)
      ? (raw.dining_areas_available ?? raw.diningAreasAvailable).filter(Boolean)
      : [],
  };
}

export function normalizeReservationDayAvailability(raw) {
  if (!raw || typeof raw !== 'object') return null;

  return {
    restaurantId: Number(raw.restaurant_id ?? raw.restaurantId ?? 0),
    date: raw.date ?? '',
    partySize: Number(raw.party_size ?? raw.partySize ?? 0),
    diningArea: raw.dining_area ?? raw.diningArea ?? null,
    durationMinutes: Number(raw.duration_minutes ?? raw.durationMinutes ?? 90),
    bookable: Boolean(raw.bookable ?? false),
    isClosed: Boolean(raw.is_closed ?? raw.isClosed ?? false),
    closureReason: raw.closure_reason ?? raw.closureReason ?? null,
    totalSlots: Number(raw.total_slots ?? raw.totalSlots ?? 0),
    availableSlots: Number(raw.available_slots ?? raw.availableSlots ?? 0),
    firstAvailableSlot: raw.first_available_slot ?? raw.firstAvailableSlot ?? null,
    reasonCode: raw.reason_code ?? raw.reasonCode ?? null,
    message: raw.message ?? '',
    slots: Array.isArray(raw.slots) ? raw.slots.map(normalizeReservationSlot).filter(Boolean) : [],
  };
}

export function normalizeReservationMonthDay(raw) {
  if (!raw || typeof raw !== 'object') return null;

  return {
    date: raw.date ?? '',
    status: raw.status ?? 'unavailable',
    availableSlots: Number(raw.available_slots ?? raw.availableSlots ?? 0),
    totalSlots: Number(raw.total_slots ?? raw.totalSlots ?? 0),
    reasonCode: raw.reason_code ?? raw.reasonCode ?? null,
  };
}

export function normalizeReservationMonthOverview(raw) {
  if (!raw || typeof raw !== 'object') return null;

  return {
    restaurantId: Number(raw.restaurant_id ?? raw.restaurantId ?? 0),
    month: raw.month ?? '',
    partySize: Number(raw.party_size ?? raw.partySize ?? 0),
    bookable: Boolean(raw.bookable ?? false),
    reasonCode: raw.reason_code ?? raw.reasonCode ?? null,
    message: raw.message ?? '',
    days: Array.isArray(raw.days) ? raw.days.map(normalizeReservationMonthDay).filter(Boolean) : [],
  };
}

export function normalizeAvailableReservationTable(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const capacity = Number(raw.seating_capacity ?? raw.capacity ?? 0);
  const tableId = Number(raw.table_id ?? raw.tableId ?? raw.id ?? 0);

  return {
    tableId,
    id: tableId,
    tableName: String(raw.table_name ?? raw.tableName ?? ''),
    capacity,
    seatingCapacity: capacity,
    minPartySize: Number(raw.min_party_size ?? raw.minPartySize ?? 1),
    diningArea: raw.dining_area ?? raw.diningArea ?? null,
    description: raw.description ?? null,
  };
}

export function normalizeReservationSlotTables(raw) {
  if (!raw || typeof raw !== 'object') return null;

  return {
    restaurantId: Number(raw.restaurant_id ?? raw.restaurantId ?? 0),
    start: raw.start ?? null,
    end: raw.end ?? null,
    partySize: Number(raw.party_size ?? raw.partySize ?? 0),
    diningArea: raw.dining_area ?? raw.diningArea ?? null,
    durationMinutes: Number(raw.duration_minutes ?? raw.durationMinutes ?? 90),
    bookable: Boolean(raw.bookable ?? false),
    reasonCode: raw.reason_code ?? raw.reasonCode ?? null,
    message: raw.message ?? '',
    availableTables: Array.isArray(raw.available_tables ?? raw.availableTables)
      ? (raw.available_tables ?? raw.availableTables).map(normalizeAvailableReservationTable).filter(Boolean)
      : [],
    suggestedAlternatives: Array.isArray(raw.suggested_alternatives ?? raw.suggestedAlternatives)
      ? (raw.suggested_alternatives ?? raw.suggestedAlternatives)
          .map((alt) => normalizeReservationSlot({ ...alt, available: true }))
          .filter(Boolean)
      : [],
  };
}

export default publicRestaurantService;
