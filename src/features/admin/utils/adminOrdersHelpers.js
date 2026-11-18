export const ORDER_STATUS_OPTIONS = [
  { value: 'all', label: 'All order statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'preparing', label: 'Preparing' },
  { value: 'ready', label: 'Ready' },
  { value: 'out_for_delivery', label: 'Out for delivery' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'failed', label: 'Failed' },
  { value: 'rejected', label: 'Rejected' },
];

export const ORDER_TYPE_OPTIONS = [
  { value: 'all', label: 'All order types' },
  { value: 'delivery', label: 'Delivery' },
  { value: 'pickup', label: 'Pickup' },
  { value: 'dine_in', label: 'Dine-in' },
];

export const PAYMENT_STATUS_OPTIONS = [
  { value: 'all', label: 'All payment statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'paid', label: 'Paid' },
  { value: 'processing', label: 'Processing' },
  { value: 'authorized', label: 'Authorized' },
  { value: 'partially_captured', label: 'Partially captured' },
  { value: 'requires_customer_action', label: 'Requires action' },
  { value: 'declined', label: 'Declined' },
  { value: 'failed', label: 'Failed' },
  { value: 'expired', label: 'Expired' },
  { value: 'voided', label: 'Voided' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'partially_refunded', label: 'Partially refunded' },
  { value: 'refunded', label: 'Refunded' },
  { value: 'disputed', label: 'Disputed' },
  { value: 'reversed', label: 'Reversed' },
];

export function mapAdminOrder(row) {
  return {
    id: row.order_id,
    order_id: row.order_id,
    checkout_id: row.checkout_id ?? null,
    order_reference: row.order_reference || `#${row.order_id}`,
    customer_name: row.customer_name || '—',
    restaurant_name: row.restaurant_name || '—',
    order_type: row.order_type || '—',
    order_status: row.order_status || 'pending',
    payment_method: row.payment_method || '—',
    payment_status: row.payment_status || 'pending',
    subtotal_amount: Number(row.subtotal_amount ?? 0),
    delivery_fee: Number(row.delivery_fee ?? 0),
    total_amount: Number(row.total_amount ?? 0),
    items_count: Number(row.items_count ?? 0),
    total_quantity: Number(row.total_quantity ?? 0),
    delivery_status: row.delivery_status ?? null,
    placed_at: row.placed_at ?? null,
    paid_at: row.paid_at ?? null,
  };
}

export function validateDateRange(dateFrom, dateTo) {
  if (dateFrom && dateTo && dateTo < dateFrom) {
    return 'End date must be on or after start date.';
  }
  return '';
}

export function buildAdminOrdersQuery({
  search = '',
  orderStatus = 'all',
  orderType = 'all',
  paymentStatus = 'all',
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
  if (orderStatus && orderStatus !== 'all') params.order_status = orderStatus;
  if (orderType && orderType !== 'all') params.order_type = orderType;
  if (paymentStatus && paymentStatus !== 'all') params.payment_status = paymentStatus;
  if (dateFrom) params.date_from = dateFrom;
  if (dateTo) params.date_to = dateTo;

  return params;
}
