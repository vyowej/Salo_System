// MOCK DATA ONLY — replace with real data later.
export const activeDelivery = null;
export const deliveryPreview = {
  id: 'SAMPLE-DELIVERY',
  orderReference: 'Sample order reference',
  restaurant: 'Sample Kitchen',
  pickup: 'Sample pickup point',
  customer: 'Sample recipient',
  contact: 'Contact details appear only for an assigned delivery.',
  dropoff: 'Sample delivery area',
  instructions: 'No delivery instructions in the empty assignment state.',
  payment: { type: 'Online paid', state: 'Paid', amount: '₱—' },
  statuses: ['Accepted', 'Arrived', 'Picked Up', 'On the way', 'Delivered'],
  activeStatus: 'Accepted',
  proof: {
    method: 'Hand to customer',
    recipient: 'Sample recipient',
    pin: '',
    image: '',
    completionMessage: 'Required delivery evidence will be shown before completion.',
  },
};
export const map = {
  permission: 'Location is not enabled',
  warning: 'Location is unavailable. The map below is a non-live preview.',
  pickupLabel: 'Sample pickup',
  riderLabel: 'Rider location unavailable',
  dropoffLabel: 'Sample drop-off',
  lastUpdated: 'No location update',
};
