import {
  formatDate,
  formatDateTime,
  formatPeso as formatExistingPeso,
} from '../../rider/utils/format.js';

export { formatDate, formatDateTime };

export function formatPeso(amount) {
  return formatExistingPeso(amount).replace(/^₱₱/, '₱');
}

export function formatDateTimeInput(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const part = Object.fromEntries(parts.map(({ type, value: partValue }) => [type, partValue]));
  return `${part.year}-${part.month}-${part.day}T${part.hour}:${part.minute}`;
}
