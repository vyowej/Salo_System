export function formatPeso(amount) {
  return `₱${Number(amount || 0).toLocaleString('en-PH')}`;
}

export function getOrderStatusBadge(status) {
  const norm = String(status || '').toLowerCase();
  const map = {
    pending: 'warning',
    accepted: 'info',
    preparing: 'primary',
    ready: 'success',
    out_for_delivery: 'info',
    delivered: 'success',
    completed: 'success',
    rejected: 'error',
    cancelled: 'default',
  };
  return map[norm] || 'default';
}

export function formatOrderStatusLabel(status, fulfillment) {
  const norm = String(status || '').toLowerCase();
  if (norm === 'ready') {
    return fulfillment === 'pickup' ? 'Ready for Pickup' : 'Ready for Dispatch';
  }
  const labels = {
    pending: 'Pending',
    accepted: 'Accepted',
    preparing: 'Preparing',
    out_for_delivery: 'Out for Delivery',
    delivered: 'Delivered',
    completed: 'Completed',
    rejected: 'Rejected',
    cancelled: 'Cancelled',
  };
  return labels[norm] || status || 'Pending';
}

export function toLocalDateKey(dateValue) {
  const d = dateValue instanceof Date ? dateValue : new Date(dateValue);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function computeDashboardStatsFromOrders(orders = [], reservations = [], now = new Date()) {
  const todayKey = toLocalDateKey(now);
  const weekAgoMs = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  let todayRevenue = 0;
  let ordersToday = 0;
  let pendingOrders = 0;
  let preparingOrders = 0;
  let completedToday = 0;
  let weeklyRevenue = 0;
  let monthlyRevenue = 0;
  let validOrderCount = 0;
  let validOrderSum = 0;

  for (const order of orders) {
    const status = String(order.status || '').toLowerCase();
    const total = Number(order.total || 0);
    const createdDate = order.createdAt ? new Date(order.createdAt) : null;
    const isValidDate = createdDate && !Number.isNaN(createdDate.getTime());
    const isToday = isValidDate && toLocalDateKey(createdDate) === todayKey;
    const isCompleted = status === 'completed' || status === 'delivered';

    if (isToday) ordersToday += 1;
    if (status === 'pending') pendingOrders += 1;
    if (status === 'preparing') preparingOrders += 1;
    if (isToday && isCompleted) {
      completedToday += 1;
      todayRevenue += total;
    }

    if (isValidDate && isCompleted) {
      if (createdDate.getTime() >= weekAgoMs) weeklyRevenue += total;
      if (createdDate.getMonth() === currentMonth && createdDate.getFullYear() === currentYear) {
        monthlyRevenue += total;
      }
    }

    if (status !== 'rejected' && status !== 'cancelled') {
      validOrderCount += 1;
      validOrderSum += total;
    }
  }

  return {
    stats: {
      todayRevenue,
      ordersToday,
      pendingOrders,
      preparingOrders,
      completedToday,
      pendingReservations: reservations.filter((r) => r.status === 'Pending').length,
      avgOrderValue: validOrderCount > 0 ? Math.round((validOrderSum / validOrderCount) * 100) / 100 : 0,
      totalMenuItems: 0,
      unavailableItems: 0,
    },
    weeklyRevenue,
    monthlyRevenue,
  };
}

export function getReservationStatusBadge(status) {
  const map = {
    Pending: 'warning',
    Approved: 'info',
    'Awaiting Deposit': 'warning',
    Confirmed: 'success',
    Arrived: 'info',
    Seated: 'primary',
    Completed: 'success',
    Cancelled: 'default',
    'No-Show': 'error',
    Rejected: 'error',
    Expired: 'default',
  };
  return map[status] || 'default';
}
