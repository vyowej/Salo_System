const ACTIVE_RESERVATION_STATUSES = new Set([
  'Pending',
  'Approved',
  'Awaiting Payment',
  'Confirmed',
  'Arrived',
  'Seated',
]);

function reservationTableMatches(reservation, table) {
  const assigned = reservation.assignedTable;
  return assigned === table.id
    || assigned === table.name
    || assigned?.id === table.id
    || assigned?.name === table.name;
}

function reservationEnd(reservation, durationMinutes) {
  const match = /^\s?(\d{1,2}):(\d{2})\s*(AM|PM)\s*$/i.exec(String(reservation.time || '').trim());
  if (!match) return 0;
  let hour = Number(match[1]);
  if (match[3].toUpperCase() === 'PM' && hour !== 12) hour += 12;
  if (match[3].toUpperCase() === 'AM' && hour === 12) hour = 0;
  const start = new Date(`${reservation.date}T00:00:00`);
  start.setHours(hour, Number(match[2]), 0, 0);
  return start.getTime() + durationMinutes * 60 * 1000;
}

export function getTableReservations(table, reservations, date) {
  return reservations.filter((reservation) => (
    reservation.date === date
    && ACTIVE_RESERVATION_STATUSES.has(reservation.status)
    && reservationTableMatches(reservation, table)
  ));
}

export function deriveTableStatus(table, reservations, date) {
  if (table.status === 'Unavailable' || table.availability === 'unavailable') return 'Unavailable';
  if (table.status === 'Maintenance') return 'Maintenance';
  const scheduled = getTableReservations(table, reservations, date);
  return scheduled.some((reservation) => ['Arrived', 'Seated'].includes(reservation.status))
    ? 'Occupied'
    : scheduled.length ? 'Reserved' : 'Available';
}

export function getTableEditConflicts(table, changes, reservations, durationMinutes, now = new Date()) {
  const active = reservations.filter((reservation) => (
    ACTIVE_RESERVATION_STATUSES.has(reservation.status)
    && reservationTableMatches(reservation, table)
    && reservationEnd(reservation, durationMinutes) > now.getTime()
  ));
  const newCapacity = Number(changes.capacity ?? table.capacity);
  const changedArea = changes.area != null && changes.area !== table.area;
  const unavailable = ['Unavailable', 'Maintenance'].includes(changes.status)
    || changes.availability === 'unavailable';

  return active.filter((reservation) => (
    Number(reservation.partySize ?? reservation.guests ?? 0) > newCapacity
    || changedArea
    || unavailable
  ));
}

export function isReservationActiveForTable(status) {
  return ACTIVE_RESERVATION_STATUSES.has(status);
}
