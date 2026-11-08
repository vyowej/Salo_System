export const OPERATING_DAYS = Object.freeze([
  { key: 'monday', label: 'Monday' },
  { key: 'tuesday', label: 'Tuesday' },
  { key: 'wednesday', label: 'Wednesday' },
  { key: 'thursday', label: 'Thursday' },
  { key: 'friday', label: 'Friday' },
  { key: 'saturday', label: 'Saturday' },
  { key: 'sunday', label: 'Sunday' },
]);

const DAY_KEYS_BY_INDEX = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MINUTES_PER_DAY = 24 * 60;
const MINUTES_PER_WEEK = OPERATING_DAYS.length * MINUTES_PER_DAY;

export function createDefaultOperatingHours() {
  return {
    weeklySchedule: Object.fromEntries(OPERATING_DAYS.map(({ key }) => [
      key,
      {
        closed: false,
        periods: [
          { id: `${key}-period-1`, open: '10:00', close: '14:00' },
          { id: `${key}-period-2`, open: '17:00', close: '22:00' },
        ],
      },
    ])),
    temporaryClosures: [],
    acceptingOrders: true,
    acceptingReservations: true,
  };
}

export function normalizeOperatingHours(value = {}) {
  value ||= {};
  const defaults = createDefaultOperatingHours();
  const source = value.weeklySchedule || {};
  const weeklySchedule = Object.fromEntries(OPERATING_DAYS.map(({ key }) => {
    const day = source[key] || defaults.weeklySchedule[key];
    return [key, {
      closed: Boolean(day.closed),
      periods: Array.isArray(day.periods)
        ? day.periods.map((period, index) => ({
          id: period.id || `${key}-period-${index + 1}`,
          open: period.open ?? '10:00',
          close: period.close ?? '22:00',
        }))
        : [],
    }];
  }));
  return {
    weeklySchedule,
    temporaryClosures: Array.isArray(value.temporaryClosures)
      ? value.temporaryClosures.map((closure) => ({ ...closure }))
      : [],
    acceptingOrders: value.acceptingOrders ?? true,
    acceptingReservations: value.acceptingReservations ?? true,
  };
}

function timeToMinutes(value) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || ''))) return null;
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

export function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function closureApplies(closure, dateKey) {
  return Boolean(closure.startDate && closure.endDate
    && closure.startDate <= dateKey
    && dateKey <= closure.endDate);
}

function validDateKey(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function isRestaurantOpen(hours, closures = hours?.temporaryClosures, now = new Date()) {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) return false;
  const schedule = hours?.weeklySchedule || {};
  const closureList = Array.isArray(closures) ? closures : [];
  const todayKey = getLocalDateKey(now);
  if (closureList.some((closure) => closureApplies(closure, todayKey))) return false;

  const today = DAY_KEYS_BY_INDEX[now.getDay()];
  const previousDay = DAY_KEYS_BY_INDEX[(now.getDay() + 6) % 7];
  const currentMinute = now.getHours() * 60 + now.getMinutes();
  const todaySchedule = schedule[today];
  const previousSchedule = schedule[previousDay];

  const inPeriod = (period, includeOvernightSpillover = false) => {
    const start = timeToMinutes(period.open);
    const end = timeToMinutes(period.close);
    if (start === null || end === null || start === end) return false;
    if (end < start) {
      return includeOvernightSpillover ? currentMinute < end : currentMinute >= start;
    }
    return !includeOvernightSpillover && currentMinute >= start && currentMinute < end;
  };

  if (!todaySchedule?.closed && (todaySchedule?.periods || []).some((period) => inPeriod(period))) return true;
  return Boolean((previousSchedule?.periods || []).some((period) => (
    inPeriod(period, true) && timeToMinutes(period.close) < timeToMinutes(period.open)
  )));
}

export function validateOperatingHours(value) {
  const hours = normalizeOperatingHours(value);
  const intervals = [];

  for (const { key, label } of OPERATING_DAYS) {
    const day = hours.weeklySchedule[key];
    if (day.closed) continue;
    if (!day.periods.length) return `${label} needs at least one period or must be marked closed.`;

    for (const [index, period] of day.periods.entries()) {
      const start = timeToMinutes(period.open);
      const end = timeToMinutes(period.close);
      if (start === null || end === null) {
        return `${label}: enter valid opening and closing times.`;
      }
      if (start === end) {
        return `${label}: a period cannot have the same opening and closing time.`;
      }
      const dayIndex = OPERATING_DAYS.findIndex((entry) => entry.key === key);
      const absoluteStart = dayIndex * MINUTES_PER_DAY + start;
      const absoluteEnd = dayIndex * MINUTES_PER_DAY + end + (end < start ? MINUTES_PER_DAY : 0);
      intervals.push({ label, index, start: absoluteStart, end: absoluteEnd });
    }
  }

  for (let left = 0; left < intervals.length; left += 1) {
    for (let right = left + 1; right < intervals.length; right += 1) {
      for (const shift of [-MINUTES_PER_WEEK, 0, MINUTES_PER_WEEK]) {
        const shiftedStart = intervals[right].start + shift;
        const shiftedEnd = intervals[right].end + shift;
        if (Math.max(intervals[left].start, shiftedStart) < Math.min(intervals[left].end, shiftedEnd)) {
          return `Operating periods overlap: ${intervals[left].label} and ${intervals[right].label}.`;
        }
      }
    }
  }

  for (const closure of hours.temporaryClosures) {
    if (!['Holiday', 'Renovation', 'Private Event', 'Emergency', 'Maintenance'].includes(closure.type)) {
      return 'Choose a valid temporary closure type.';
    }
    if (!validDateKey(closure.startDate) || !validDateKey(closure.endDate) || closure.endDate < closure.startDate) {
      return 'Each temporary closure needs a valid date range.';
    }
    if (!String(closure.reason || '').trim()) return 'Provide a reason for each temporary closure.';
  }

  return '';
}

export function formatOperatingHours(hours) {
  const schedule = normalizeOperatingHours(hours).weeklySchedule;
  const openDays = OPERATING_DAYS.filter(({ key }) => !schedule[key].closed);
  if (openDays.length === 0) return 'Closed every day';
  const uniquePeriods = new Set(openDays.flatMap(({ key }) => (
    schedule[key].periods.map((period) => `${period.open}–${period.close}`)
  )));
  if (uniquePeriods.size === 1 && openDays.length === OPERATING_DAYS.length) {
    return [...uniquePeriods][0];
  }
  return `${openDays.length} days · ${[...uniquePeriods].join(', ') || 'hours not set'}`;
}

export function createOperatingDateTime(date, time) {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date || ''));
  const timeMatch = /^(\d{1,2}):([0-5]\d)\s*(AM|PM)$/i.exec(String(time || '').trim());
  if (!dateMatch || !timeMatch) return null;
  const [, year, month, day] = dateMatch;
  let hour = Number(timeMatch[1]) % 12;
  if (timeMatch[3].toUpperCase() === 'PM') hour += 12;
  const result = new Date(Number(year), Number(month) - 1, Number(day), hour, Number(timeMatch[2]));
  if (result.getFullYear() !== Number(year)
    || result.getMonth() !== Number(month) - 1
    || result.getDate() !== Number(day)) return null;
  return result;
}
