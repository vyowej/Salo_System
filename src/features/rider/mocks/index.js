import { profile, application } from './profile.mock';
import { dashboard } from './dashboard.mock';
import { offers } from './offers.mock';
import { activeDelivery, deliveryPreview, map } from './deliveries.mock';
import { shifts } from './shifts.mock';
import { earnings } from './earnings.mock';
import { cod } from './cod.mock';
import { history } from './history.mock';
import { notifications } from './notifications.mock';
import { support } from './support.mock';
import { safety } from './safety.mock';
import { previewCopy, applicationPreview } from './ui.mock';

export const riderMockData = {
  profile,
  application,
  dashboard,
  offers,
  activeDelivery,
  deliveryPreview,
  map,
  shifts,
  earnings,
  cod,
  history,
  notifications,
  support,
  safety,
  previewCopy,
  applicationPreview,
};

export const riderPreviewState = {
  sample: 'Sample data',
  loading: 'Loading',
  empty: 'Empty',
  error: 'Error',
  success: 'Success',
};

export function getRiderMockData() {
  return riderMockData;
}

export function formatRiderCurrency(amount) {
  if (typeof amount === 'string') return amount.startsWith('₱') ? amount : `₱${amount}`;
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    timeZone: 'Asia/Manila',
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatRiderDate(value, options = {}) {
  if (!value || value === '—' || value.startsWith('Sample') || value.startsWith('No ')) return value || '—';
  return new Intl.DateTimeFormat('en-PH', { ...options, timeZone: 'Asia/Manila' }).format(new Date(value));
}
