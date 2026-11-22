export const RESERVATION_STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'awaiting_payment', label: 'Awaiting Deposit' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'arrived', label: 'Arrived' },
  { value: 'seated', label: 'Seated' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'no_show', label: 'No-Show' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'expired', label: 'Expired' },
];

export const RESERVATION_ATTENTION_OPTIONS = [
  { value: 'all', label: 'All reservations' },
  { value: 'any', label: 'Needs attention (any)' },
  { value: 'pending_expiring', label: 'Pending expiring' },
  { value: 'no_show_candidate', label: 'No-show candidate' },
  { value: 'overdue_seated', label: 'Overdue seated' },
];

export function formatAttentionLabel(attention) {
  if (attention === 'pending_expiring') return 'Pending expiring';
  if (attention === 'no_show_candidate') return 'No-show candidate';
  if (attention === 'overdue_seated') return 'Overdue seated';
  return '';
}

export function getAttentionTone(attention) {
  if (attention === 'no_show_candidate' || attention === 'overdue_seated') return 'danger';
  if (attention === 'pending_expiring') return 'warning';
  return 'neutral';
}

export function validateDateRange(dateFrom, dateTo) {
  if (dateFrom && dateTo && dateTo < dateFrom) {
    return 'End date must be on or after start date.';
  }
  return '';
}

export function buildAdminReservationsQuery({
  search = '',
  status = 'all',
  attention = 'all',
  restaurantId = '',
  dateFrom = '',
  dateTo = '',
  page = 1,
  perPage = 15,
  direction = 'desc',
} = {}) {
  const safePage = Math.max(1, Number.parseInt(String(page || 1), 10) || 1);
  const safePerPage = Math.max(1, Math.min(100, Number.parseInt(String(perPage || 15), 10) || 15));

  const params = {
    page: safePage,
    per_page: safePerPage,
    direction: direction === 'asc' ? 'asc' : 'desc',
  };

  const trimmedSearch = String(search || '').trim();
  if (trimmedSearch) params.search = trimmedSearch;
  if (status && status !== 'all') params.status = status;
  if (attention && attention !== 'all') params.attention = attention;
  const parsedRestaurantId = Number.parseInt(String(restaurantId || ''), 10);
  if (Number.isFinite(parsedRestaurantId) && parsedRestaurantId > 0) {
    params.restaurant_id = parsedRestaurantId;
  }
  if (dateFrom) params.date_from = dateFrom;
  if (dateTo) params.date_to = dateTo;

  return params;
}
