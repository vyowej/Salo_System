const moneyFormatter = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  timeZone: 'Asia/Manila',
});

export function formatPeso(amount) {
  if (typeof amount === 'string' && amount.startsWith('₱')) return amount;
  const numericValue = Number(String(amount).replace(/[^0-9.-]/g, '')) || 0;
  return `₱${moneyFormatter.format(numericValue).replace('PHP', '').trim()}`;
}

export function formatDate(value, options = {}) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', ...options }).format(date);
}

export function formatTime(value, options = {}) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit', ...options }).format(date);
}

export function formatDateTime(value, options = {}) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', ...options }).format(date);
}

export function formatRelativeTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const diffMs = date.getTime() - Date.now();
  const diffMinutes = Math.round(diffMs / 60000);
  if (Math.abs(diffMinutes) < 60) return new Intl.RelativeTimeFormat('en', { numeric: 'always' }).format(diffMinutes, 'minute');
  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) return new Intl.RelativeTimeFormat('en', { numeric: 'always' }).format(diffHours, 'hour');
  const diffDays = Math.round(diffHours / 24);
  return new Intl.RelativeTimeFormat('en', { numeric: 'always' }).format(diffDays, 'day');
}

export function formatDistance(valueInKm) {
  const numeric = Number(valueInKm) || 0;
  if (numeric >= 1) return `${numeric.toFixed(1)} km`;
  return `${Math.max(1, Math.round(numeric * 1000))} m`;
}

export const formatters = {
  peso: formatPeso,
  date: formatDate,
  time: formatTime,
  dateTime: formatDateTime,
  relativeTime: formatRelativeTime,
  distance: formatDistance,
};

export default formatters;
