export const filterOptions = {
  datePresets: ['All dates', 'Today', 'Last 7 days', 'Last 30 days', 'Custom range'],
  statuses: ['All statuses', 'Offered', 'Accepted', 'Picked up', 'Delivered', 'Failed', 'Cancelled'],
  restaurants: ['All restaurants'],
  paymentTypes: ['All payment types', 'Cash on Delivery', 'Online paid', 'Payment pending'],
  codStatuses: ['All COD statuses', 'Not collected', 'Collected', 'Disputed', 'Pending remittance', 'Remitted', 'Remittance confirmed'],
};

export const historyFilterFields = [
  { key: 'dateRange', label: 'Date range', options: filterOptions.datePresets },
  { key: 'status', label: 'Delivery status', options: filterOptions.statuses },
  { key: 'restaurant', label: 'Restaurant', options: filterOptions.restaurants },
  { key: 'paymentType', label: 'Payment type', options: filterOptions.paymentTypes },
  { key: 'codStatus', label: 'COD status', options: filterOptions.codStatuses },
];

export const initialHistoryFilters = {
  dateRange: 'All dates',
  status: 'All statuses',
  restaurant: 'All restaurants',
  paymentType: 'All payment types',
  codStatus: 'All COD statuses',
};

export function updateHistoryFilter(current, key, value) {
  return { ...current, [key]: value };
}

export function getHistoryFilterFields(restaurants) {
  return historyFilterFields.map((field) => (
    field.key === 'restaurant'
      ? { ...field, options: [...filterOptions.restaurants, ...restaurants.filter((restaurant) => !filterOptions.restaurants.includes(restaurant))] }
      : field
  ));
}

export default filterOptions;
