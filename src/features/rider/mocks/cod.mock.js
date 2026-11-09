// MOCK DATA ONLY - replace with real data later.
import { formatPeso } from '../utils/format';

export const cod = {
  default: {
    balance: formatPeso(0),
    amountToCollect: formatPeso(620),
    status: 'not_collected',
    statusLabel: 'Not collected',
    incomeNote: 'COD cash is collected on behalf of SALO and is not rider income.',
    remittance: {
      label: 'Pending Admin confirmation',
      amount: formatPeso(620),
      status: 'pending_admin_confirmation',
    },
    history: [
      { reference: 'REF-24-1042', amount: formatPeso(620), submitted: '2026-11-08T09:30:00+08:00', status: 'pending_admin_confirmation' },
      { reference: 'REF-24-921', amount: formatPeso(440), submitted: '2026-11-05T13:00:00+08:00', status: 'remittance_confirmed' },
    ],
    statuses: ['not_collected', 'pending_remittance', 'remittance_confirmed'],
    note: 'Remittance is submitted for Admin review. Only an authorized Admin can confirm receipt.',
  },
  empty: {
    balance: formatPeso(0),
    amountToCollect: formatPeso(0),
    status: 'not_collected',
    statusLabel: 'Not collected',
    incomeNote: 'No COD collection is pending in this preview.',
    remittance: null,
    history: [],
    statuses: ['not_collected'],
    note: 'No remittance record is available in this preview.',
  },
  loading: {
    balance: '—',
    amountToCollect: '—',
    status: 'pending_remittance',
    statusLabel: 'Loading',
    incomeNote: 'Loading COD status...',
    remittance: null,
    history: [],
    statuses: ['pending_remittance'],
    note: 'Loading remittance summary...',
  },
  error: {
    balance: '—',
    amountToCollect: '—',
    status: 'disputed',
    statusLabel: 'Unable to load',
    incomeNote: 'We could not load COD data in this preview.',
    remittance: null,
    history: [],
    statuses: ['disputed'],
    note: 'Please try again later.',
  },
};

export default cod;
