// MOCK DATA ONLY - replace with real data later.
import { formatDateTime, formatPeso } from '../utils/format';

const activeDeliveryPreview = {
  id: 'RDR-1042',
  orderReference: 'ORD-1042',
  restaurant: 'Bahay ng Sawsawan',
  restaurantAddress: '12 Sampaguita St, Quezon City',
  pickup: 'Front counter pickup',
  customerName: 'Maria Santos',
  dropoff: 'Block 7, Unit 4, Cubao',
  instructions: 'Ring the unit bell and leave the order at the lobby desk.',
  payment: { type: 'COD', state: 'Payment pending', paymentStatus: 'payment_pending', codStatus: 'not_collected', amount: formatPeso(640) },
  status: 'accepted',
  timestamp: formatDateTime('2026-11-09T09:15:00+08:00'),
  nextAction: 'Arrived at restaurant',
};

export const deliveries = {
  default: {
    active: null,
    list: [],
  },
  empty: {
    active: null,
    list: [],
  },
  loading: {
    active: null,
    list: [],
    status: 'loading',
    message: 'Loading delivery preview...',
  },
  error: {
    active: null,
    list: [],
    status: 'error',
    message: 'Unable to load delivery details.',
  },
  active: {
    active: activeDeliveryPreview,
    list: [activeDeliveryPreview],
  },
};

export const deliveryPreview = deliveries.active.active;
export const map = {
  permission: 'Location is not enabled',
  warning: 'Location is unavailable. The map below is a non-live preview.',
  pickupLabel: 'Pickup',
  riderLabel: 'You',
  dropoffLabel: 'Drop-off',
  lastUpdated: 'No location update',
};

export default deliveries;
