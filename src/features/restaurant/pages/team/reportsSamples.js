// DESIGN SAMPLE DATA - not connected to anything.
export const REPORT_TABS = ['Sales', 'Orders', 'Reservations', 'Inventory'];
export const REPORT_FILTERS = {
  ranges: ['Today', '7 days', '30 days', 'Custom'],
  branches: ['All branches', 'Uptown', 'Riverside'],
  orderStatuses: ['All statuses', 'Completed', 'Pending', 'Cancelled', 'Rejected'],
  categories: ['All categories', 'House Favorites', 'Family Meals', 'Drinks'],
  items: ['All items', 'Chicken Inasal', 'Pandan Latte', 'Sunday Kare-Kare'],
  fulfillment: ['All methods', 'Delivery', 'Pickup', 'Dine-in'],
};
export const SALES_REPORT = {
  today: 12840,
  weekly: 82410,
  monthly: 341220,
  trend: [34, 48, 41, 58, 52, 74, 66, 83, 73, 91, 77, 100],
  days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  items: [{ name: 'Chicken Inasal', value: 54300 }, { name: 'Sunday Kare-Kare', value: 39200 }, { name: 'Pandan Latte', value: 18500 }],
  categories: [{ name: 'House Favorites', value: 68400 }, { name: 'Family Meals', value: 49200 }, { name: 'Drinks', value: 25700 }],
};
export const ORDERS_REPORT = { total: 1248, completed: 1102, cancelled: 54, rejected: 18, average: 482, popular: ['Chicken Inasal', 'Sunday Kare-Kare', 'Pandan Latte'], trend: [22, 38, 31, 55, 49, 72, 65] };
export const RESERVATIONS_REPORT = { total: 382, confirmed: 248, cancelled: 38, completed: 69, noShow: 14, trend: [18, 30, 22, 47, 42, 67, 55], utilization: [{ table: 'T01', value: 82 }, { table: 'T02', value: 67 }, { table: 'T03', value: 91 }, { table: 'T04', value: 54 }, { table: 'T05', value: 76 }] };
export const INVENTORY_REPORT = { currentItems: 42, low: ['Calamansi', 'Coconut milk', 'Jasmine rice'], out: ['Fresh basil'], mostUsed: [{ name: 'Jasmine rice', quantity: '18.5 kg' }, { name: 'Chicken thigh', quantity: '14.2 kg' }, { name: 'Calamansi', quantity: '8.4 kg' }], movements: [{ type: 'Stock received', item: 'Jasmine rice', quantity: '+10 kg', time: 'Today, 10:42 AM' }, { type: 'Usage recorded', item: 'Chicken thigh', quantity: '−3 kg', time: 'Today, 9:18 AM' }, { type: 'Stock adjusted', item: 'Calamansi', quantity: '−1.2 kg', time: 'Yesterday, 5:32 PM' }] };
