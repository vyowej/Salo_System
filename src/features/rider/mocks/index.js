import { profile, application } from './profile.mock';
import { dashboard } from './dashboard.mock';
import { offers } from './offers.mock';
import { deliveries, deliveryPreview, map } from './deliveries.mock';
import { shifts, scheduleCalendar } from './shifts.mock';
import { earnings } from './earnings.mock';
import { cod } from './cod.mock';
import { history } from './history.mock';
import { notifications } from './notifications.mock';
import { support } from './support.mock';
import { safety } from './safety.mock';
import { previewCopy, applicationPreview } from './ui.mock';
import { locationStatus } from './locationStatus.mock';
import { formatDate, formatPeso } from '../utils/format';

export const riderMockData = {
  profile,
  application,
  dashboard,
  offers: offers.default,
  deliveries: deliveries.default,
  deliveryPreview,
  map,
  shifts,
  scheduleCalendar,
  earnings,
  cod: cod.default,
  history,
  notifications,
  support,
  safety,
  previewCopy,
  applicationPreview,
  locationStatus,
};

export const riderPreviewState = {
  sample: 'Sample data',
  loading: 'Loading',
  empty: 'Empty',
  error: 'Error',
  success: 'Success',
};

export function getRiderMock(topic, scenario = 'default') {
  const source = topic === 'riderProfile'
    ? profile
    : topic
      ? riderMockData[topic]
      : riderMockData;
  if (source === undefined) return null;

  if (topic === 'offers') {
    return offers[scenario] ?? offers.default ?? [];
  }

  if (topic === 'deliveries') {
    return deliveries[scenario] ?? deliveries.default ?? { active: null, list: [] };
  }

  if (topic === 'cod') {
    return cod[scenario] ?? cod.default ?? {};
  }

  if (topic === 'locationStatus') {
    return locationStatus[scenario] ?? locationStatus.default ?? {};
  }

  const base = topic === 'riderProfile' ? profile : source;
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
  if (scenario === 'active') {
    if (topic === 'deliveries') return deliveries.active;
    return base;
  }

  return base;
}

export function getRiderMockData() {
  return riderMockData;
}

export function formatRiderCurrency(amount) {
  return formatPeso(amount);
}

export function formatRiderDate(value, options = {}) {
  return value === '—' || (typeof value === 'string' && (value.startsWith('Sample') || value.startsWith('No ')))
    ? value
    : formatDate(value, options);
}
