export function formatPeso(amount) {
  const num = Number(amount || 0);
  if (!Number.isFinite(num)) return '₱0';
  return `₱${new Intl.NumberFormat('en-PH', {
    minimumFractionDigits: Number.isInteger(num) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(num)}`;
}

export function formatDateTimeManila(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const datePart = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
  const timePart = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
  return `${datePart} - ${timePart}`;
}

export function formatShortOrderId(id) {
  if (!id) return '#ORD-000000';
  const str = String(id).replace(/^#/, '');
  if (str.length <= 10) return `#${str}`;
  return `#ORD-${str.slice(-6).toUpperCase()}`;
}

export function getNotificationTarget(notification) {
  if (notification?.href) return notification.href;
  if (notification?.type === 'order') return '/customer/orders?tab=upcoming';
  if (notification?.type === 'reservation') return '/customer/reservations';
  if (notification?.type === 'invitation') return '/customer/invitations';
  return '/customer';
}
