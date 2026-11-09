// MOCK DATA ONLY - replace with real data later.
import { formatPeso } from '../utils/format';

export const history = [
  {
    id: 'ORD-1042',
    reference: 'ORD-1042',
    restaurant: 'Bahay ng Sawsawan',
    date: '2026-11-09T15:15:00+08:00',
    status: 'delivered',
    area: 'Cubao, Quezon City',
    pickup: '12 Sampaguita St, Quezon City',
    dropoff: 'Block 7, Unit 4, Cubao',
    paymentType: 'paid_online',
    paymentStatus: 'paid',
    codStatus: 'not_collected',
    earnings: formatPeso(180),
    timeline: [
      { label: 'Accepted', time: '2026-11-09T14:35:00+08:00', complete: true },
      { label: 'Picked up', time: '2026-11-09T14:52:00+08:00', complete: true },
      { label: 'Delivered', time: '2026-11-09T15:15:00+08:00', complete: true },
    ],
    proof: {
      method: 'Contactless photo',
      capturedAt: '2026-11-09T15:14:00+08:00',
      metadata: 'Photo proof recorded at the delivery location.',
    },
  },
  {
    id: 'ORD-1029',
    reference: 'ORD-1029',
    restaurant: 'Kusina ni Lola',
    date: '2026-11-09T11:40:00+08:00',
    status: 'failed',
    area: 'Marikina Heights',
    pickup: '8 Makata St, Marikina',
    dropoff: 'Marikina Heights',
    paymentType: 'cod',
    paymentStatus: 'payment_pending',
    codStatus: 'disputed',
    earnings: formatPeso(0),
    failureReason: 'Customer could not be contacted after arrival.',
    timeline: [
      { label: 'Accepted', time: '2026-11-09T10:52:00+08:00', complete: true },
      { label: 'Arrived at customer', time: '2026-11-09T11:20:00+08:00', complete: true },
      { label: 'Failed', time: '2026-11-09T11:40:00+08:00', complete: true },
    ],
    proof: {
      method: 'No proof recorded',
      capturedAt: null,
      metadata: 'No delivery photo was submitted for this failed delivery.',
    },
  },
  {
    id: 'ORD-1018',
    reference: 'ORD-1018',
    restaurant: 'Timpla House',
    date: '2026-11-08T19:05:00+08:00',
    status: 'delivered',
    area: 'Project 4, Quezon City',
    pickup: '55 Molave Ave, Quezon City',
    dropoff: 'Project 4, Quezon City',
    paymentType: 'cod',
    paymentStatus: 'payment_pending',
    codStatus: 'pending_remittance',
    earnings: formatPeso(160),
    timeline: [
      { label: 'Accepted', time: '2026-11-08T18:24:00+08:00', complete: true },
      { label: 'Picked up', time: '2026-11-08T18:42:00+08:00', complete: true },
      { label: 'Delivered', time: '2026-11-08T19:05:00+08:00', complete: true },
    ],
    proof: {
      method: 'Hand-to-customer',
      capturedAt: '2026-11-08T19:05:00+08:00',
      metadata: 'Recipient handoff recorded.',
    },
  },
];

export default history;
