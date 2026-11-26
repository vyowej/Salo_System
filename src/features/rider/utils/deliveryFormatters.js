import { formatFormalAddress } from '../../../utils/addressFormatter';

export function formatPeso(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '₱0.00';
  return `₱${num.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatDeliveryAddress(addressObjOrText, fallback = 'Address unavailable') {
  if (addressObjOrText && typeof addressObjOrText === 'object') {
    const formatted = formatFormalAddress(addressObjOrText);
    if (formatted) return formatted;
  }
  const text = typeof addressObjOrText === 'string' ? addressObjOrText.trim() : '';
  return text || fallback;
}

export function formatPlacedAgo(isoTimestamp, nowMs = Date.now()) {
  if (!isoTimestamp) return 'Just now';
  const placedMs = Date.parse(isoTimestamp);
  if (!Number.isFinite(placedMs)) return 'Just now';

  const diffSeconds = Math.max(0, Math.floor((nowMs - placedMs) / 1000));
  if (diffSeconds < 60) return 'Just now';

  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}
