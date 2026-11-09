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

export function getRiderMock(topic, scenario = 'default') {
  const base = topic ? riderMockData[topic] : riderMockData;
  if (base === undefined) return null;

  if (scenario === 'default') return base;

  if (scenario === 'loading') {
    if (Array.isArray(base)) return [];
    if (typeof base === 'object') return { ...base, isLoading: true, status: 'loading' };
    return { value: null, status: 'loading' };
  }

  if (scenario === 'empty') {
    if (Array.isArray(base)) return [];
    if (typeof base === 'object') return { ...base, items: [], list: [], results: [], status: 'empty' };
    return null;
  }

  if (scenario === 'error') {
    if (Array.isArray(base)) return [{ id: 'error', title: 'Unable to load rider data', error: true }];
    if (typeof base === 'object') return { ...base, error: true, status: 'error', message: 'Unable to load rider data preview.' };
    return { error: true, message: 'Unable to load rider data preview.' };
  }

  return base;
}

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
