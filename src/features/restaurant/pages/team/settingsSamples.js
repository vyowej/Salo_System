// DESIGN SAMPLE DATA - not connected to anything.
export const SETTINGS_TABS = ['Business', 'Orders', 'Reservations', 'Notifications', 'Payments'];
export const SETTINGS_DEFAULTS = {
  delivery: true,
  pickup: true,
  dineIn: true,
  scheduledOrders: true,
  priorityOrders: false,
  preparationTime: '30 minutes',
  deductionMode: 'manual',
  acceptingReservations: true,
  reservationSchedule: 'Use business operating hours',
  reservationTimeSlots: 'Every 30 minutes',
  reservationFee: '150',
  reservationDuration: '90',
  paymentMethod: 'Online payment',
  tablePreference: 'Auto-suggest available table',
  instructions: 'Please arrive 10 minutes before your reservation.',
  notifications: {
    'New orders': true,
    'New reservations': true,
    Cancellations: true,
    'Low stock': true,
    'Staff invitations': true,
    'Ownership invitations': true,
  },
};
export const BUSINESS_SUMMARY = { name: 'Salo Kitchen — Uptown', address: '18 Scout Avenue, Quezon City', phone: '+63 ••• ••• 4821', coverage: 'Configured delivery zones · preview only' };
