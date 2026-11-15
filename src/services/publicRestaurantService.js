/**
 * SALO — Public Restaurants & Menus Service
 * Read-only service backed by /api/restaurant-categories, /api/restaurants,
 * /api/restaurants/{id}, and /api/restaurants/{id}/menu.
 */

import apiClient from './apiClient';

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
    businessType: raw.business_type || '',
    cuisine: categoryNames.join(' · ') || raw.business_type || 'Restaurant',
    categories,
    description: raw.description || '',
    logoImage: raw.logo_path || null,
    coverPhoto: raw.cover_path || null,
    address: raw.short_address || '',
    offers: raw.offers || { delivery: false, pickup: false, dine_in: false, reservations: false },
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

    const categories = Array.isArray(raw.categories) ? raw.categories : [];
    const categoryNames = categories.map((c) => c.name).filter(Boolean);
    const menuCategories = Array.isArray(menuRes?.data?.categories) ? menuRes.data.categories : [];

    const menu = menuCategories.flatMap((cat) =>
      (Array.isArray(cat.items) ? cat.items : []).map((item) => mapMenuItem(item, cat.name)),
    );

    return {
      id: String(raw.id),
      name: raw.name,
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
      },
      operatingSchedule: {
        acceptingOrders: Boolean(raw.availability?.accepting_orders),
        acceptingReservations: Boolean(raw.availability?.accepting_reservations),
      },
      rating: raw.rating_summary?.average_rating ?? null,
      reviewCount: raw.rating_summary?.review_count ?? null,
      categories: menuCategories.map((c) => c.name),
      menu,
    };
  },
};

export default publicRestaurantService;
