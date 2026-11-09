// MOCK DATA ONLY - replace with real data later.
import { formatPeso } from '../utils/format';

export const earnings = {
  summaries: [
    { key: 'today', label: 'Today', amount: formatPeso(1240), detail: '3 completed deliveries' },
    { key: 'week', label: 'This week', amount: formatPeso(5680), detail: 'Across 14 deliveries' },
    { key: 'month', label: 'This month', amount: formatPeso(18240), detail: 'Across 47 deliveries' },
  ],
  chartSeries: [
    { key: 'mon', label: 'Mon', amount: 610 },
    { key: 'tue', label: 'Tue', amount: 920 },
    { key: 'wed', label: 'Wed', amount: 480 },
    { key: 'thu', label: 'Thu', amount: 1060 },
    { key: 'fri', label: 'Fri', amount: 780 },
    { key: 'sat', label: 'Sat', amount: 1240 },
    { key: 'sun', label: 'Sun', amount: 590 },
  ],
  breakdown: [
    { key: 'compensation', label: 'Compensation', amount: formatPeso(5100) },
    { key: 'bonuses', label: 'Bonuses', amount: formatPeso(360) },
    { key: 'tips', label: 'Tips', amount: formatPeso(180) },
    { key: 'adjustments', label: 'Adjustments', amount: formatPeso(40) },
  ],
  records: [
    { reference: 'ORD-1042', date: '2026-11-09T15:15:00+08:00', amount: 180, status: 'delivered' },
    { reference: 'ORD-1029', date: '2026-11-09T11:40:00+08:00', amount: 220, status: 'delivered' },
    { reference: 'ORD-1018', date: '2026-11-08T19:05:00+08:00', amount: 160, status: 'pending_remittance' },
  ],
  payoutMethod: {
    provider: 'E-wallet',
    accountName: 'Maria Santos',
    maskedAccount: '•••• 4821',
    note: 'Payout details are shown in masked form.',
  },
  payoutHistory: [
    { reference: 'PAY-1108', date: '2026-11-08T18:00:00+08:00', amount: formatPeso(2840), status: 'paid' },
    { reference: 'PAY-1101', date: '2026-11-01T18:00:00+08:00', amount: formatPeso(3160), status: 'paid' },
  ],
};

export default earnings;
