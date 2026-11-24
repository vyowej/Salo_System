export const DAY_OPTIONS = [
  { value: 'mon', label: 'Monday', short: 'Mon' },
  { value: 'tue', label: 'Tuesday', short: 'Tue' },
  { value: 'wed', label: 'Wednesday', short: 'Wed' },
  { value: 'thu', label: 'Thursday', short: 'Thu' },
  { value: 'fri', label: 'Friday', short: 'Fri' },
  { value: 'sat', label: 'Saturday', short: 'Sat' },
  { value: 'sun', label: 'Sunday', short: 'Sun' },
];

export const SHIFT_OPTIONS = [
  { value: 'breakfast', label: 'Morning / Breakfast', hours: '6:00 AM – 10:00 AM' },
  { value: 'lunch', label: 'Midday / Lunch', hours: '10:00 AM – 2:00 PM' },
  { value: 'afternoon', label: 'Afternoon', hours: '2:00 PM – 5:00 PM' },
  { value: 'dinner', label: 'Evening / Dinner', hours: '5:00 PM – 10:00 PM' },
  { value: 'late_night', label: 'Late Night', hours: '10:00 PM – 6:00 AM' },
  { value: 'flexible', label: 'Flexible (Anytime)', hours: 'All available hours' },
];

const VALID_DAYS = new Set(DAY_OPTIONS.map((d) => d.value));
const VALID_SHIFTS = new Set(SHIFT_OPTIONS.map((s) => s.value));
const DAY_LABEL_MAP = new Map(DAY_OPTIONS.map((d) => [d.value, d]));
const SHIFT_LABEL_MAP = new Map(SHIFT_OPTIONS.map((s) => [s.value, s]));

export function parseHubTags(hubsString) {
  if (!hubsString || typeof hubsString !== 'string') return [];
  return hubsString
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function formatHubTags(tags) {
  if (!Array.isArray(tags) || tags.length === 0) return '';
  return tags
    .map((t) => String(t || '').trim())
    .filter(Boolean)
    .join(', ');
}

export function getDayLabel(dayValue, { short = false } = {}) {
  const entry = DAY_LABEL_MAP.get(dayValue);
  if (!entry) return dayValue;
  return short ? entry.short : entry.label;
}

export function getShiftMeta(shiftValue) {
  return SHIFT_LABEL_MAP.get(shiftValue) || { value: shiftValue, label: shiftValue, hours: '' };
}

export function getTodayIsoDate(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatScheduleDate(value) {
  if (!value) return '—';
  const str = String(value).trim();
  if (!str) return '—';

  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str);
  const parsed = dateOnlyMatch
    ? new Date(Number(dateOnlyMatch[1]), Number(dateOnlyMatch[2]) - 1, Number(dateOnlyMatch[3]))
    : new Date(str);

  if (Number.isNaN(parsed.getTime())) return str;

  return parsed.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Toggle a shift while preventing conflicting selections between
 * `flexible` (all available hours) and specific shift windows.
 */
export function toggleShiftSelection(currentShifts, shiftValue) {
  const list = Array.isArray(currentShifts) ? currentShifts : [];
  if (!VALID_SHIFTS.has(shiftValue)) return list;

  if (shiftValue === 'flexible') {
    return list.includes('flexible') ? [] : ['flexible'];
  }

  const withoutFlexible = list.filter((s) => s !== 'flexible');
  if (withoutFlexible.includes(shiftValue)) {
    return withoutFlexible.filter((s) => s !== shiftValue);
  }
  return [...withoutFlexible, shiftValue];
}

export function validateScheduleChangeRequest(form, todayIso = getTodayIsoDate()) {
  const errors = {};
  const days = Array.isArray(form?.available_days)
    ? form.available_days.filter((d) => VALID_DAYS.has(d))
    : [];
  const shifts = Array.isArray(form?.preferred_shifts)
    ? form.preferred_shifts.filter((s) => VALID_SHIFTS.has(s))
    : [];
  const hubsString = formatHubTags(form?.preferred_hubs);
  const effectiveDate = String(form?.effective_date || '').trim();
  const reason = String(form?.reason || '').trim();

  if (days.length === 0) {
    errors.available_days = 'Select at least one available day.';
  }

  if (shifts.length === 0) {
    errors.preferred_shifts = 'Select at least one preferred shift or choose Flexible (Anytime).';
  } else if (shifts.includes('flexible') && shifts.length > 1) {
    errors.preferred_shifts = 'Flexible (Anytime) cannot be combined with specific shift windows.';
  }

  if (hubsString.length > 255) {
    errors.preferred_hubs = 'Preferred delivery hubs must be 255 characters or fewer.';
  }

  if (!effectiveDate) {
    errors.effective_date = 'Select a requested effective date.';
  } else if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) {
    errors.effective_date = 'Enter a valid effective date.';
  } else if (effectiveDate < todayIso) {
    errors.effective_date = 'Effective date cannot be in the past.';
  }

  if (!reason) {
    errors.reason = 'Provide a reason for your schedule change request.';
  } else if (reason.length < 5) {
    errors.reason = 'Please provide at least 5 characters explaining the change.';
  } else if (reason.length > 500) {
    errors.reason = 'Reason must be 500 characters or fewer.';
  }

  return {
    errors,
    isValid: Object.keys(errors).length === 0,
  };
}

export function hasPendingScheduleRequest(requests) {
  return Array.isArray(requests) && requests.some((req) => req?.status === 'pending');
}

export function getPendingScheduleRequest(requests) {
  if (!Array.isArray(requests)) return null;
  return requests.find((req) => req?.status === 'pending') || null;
}

export function createScheduleChangeRequest(form, now = new Date()) {
  const idSuffix = Math.floor(1000 + Math.random() * 9000);
  const hubTags = Array.isArray(form?.preferred_hubs)
    ? form.preferred_hubs.map((t) => String(t || '').trim()).filter(Boolean)
    : parseHubTags(form?.preferred_hubs);

  return {
    id: `SCR-${now.getFullYear()}-${idSuffix}`,
    status: 'pending',
    available_days: Array.isArray(form?.available_days)
      ? form.available_days.filter((d) => VALID_DAYS.has(d))
      : [],
    preferred_shifts: Array.isArray(form?.preferred_shifts)
      ? form.preferred_shifts.filter((s) => VALID_SHIFTS.has(s))
      : [],
    preferred_hubs: hubTags,
    effective_date: String(form?.effective_date || '').trim(),
    reason: String(form?.reason || '').trim(),
    submitted_at: now.toISOString(),
    reviewed_at: null,
    admin_remarks: '',
  };
}

export function cancelScheduleChangeRequest(requests, requestId, now = new Date()) {
  if (!Array.isArray(requests)) return [];
  return requests.map((req) => {
    if (req.id !== requestId || req.status !== 'pending') {
      return req;
    }
    return {
      ...req,
      status: 'cancelled',
      reviewed_at: now.toISOString(),
      admin_remarks: req.admin_remarks || 'Cancelled by rider prior to review.',
    };
  });
}

/**
 * Frontend-only mock schedule change request history for SALO demonstration.
 * In production, schedule change requests are reviewed by an administrator.
 */
export const INITIAL_MOCK_SCHEDULE_REQUESTS = [
  {
    id: 'SCR-2026-1042',
    status: 'approved',
    available_days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'],
    preferred_shifts: ['lunch', 'dinner'],
    preferred_hubs: ['Diliman', 'Katipunan'],
    effective_date: '2026-10-15',
    reason: 'Added Saturday availability to cover weekend lunch and dinner peak demand.',
    submitted_at: '2026-10-10T09:30:00Z',
    reviewed_at: '2026-10-11T14:15:00Z',
    admin_remarks: 'Approved. Saturday peak coverage confirmed for Diliman and Katipunan hubs.',
  },
  {
    id: 'SCR-2026-0918',
    status: 'rejected',
    available_days: ['mon', 'tue', 'wed', 'thu', 'fri'],
    preferred_shifts: ['late_night'],
    preferred_hubs: ['Cubao'],
    effective_date: '2026-09-20',
    reason: 'Requesting switch to late night only shifts for September.',
    submitted_at: '2026-09-14T11:20:00Z',
    reviewed_at: '2026-09-15T16:40:00Z',
    admin_remarks: 'Late-night slots in Cubao are currently at full capacity. Please retain midday/evening shifts.',
  },
];
