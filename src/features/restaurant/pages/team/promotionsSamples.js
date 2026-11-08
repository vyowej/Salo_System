// DESIGN SAMPLE DATA - not connected to anything.
export const PROMOTION_SAMPLES = [
  { id: 'promo-1', name: 'Weekday Merienda', description: 'A little afternoon treat for your next visit.', type: 'Percent', value: 15, status: 'Active', start: 'Nov 01, 2026', end: 'Nov 30, 2026', usage: 86, limit: 150, performance: '₱18,420', items: ['Pandan Latte', 'Ube Cheese Pandesal'], categories: ['Drinks', 'Merienda'], minimum: 250 },
  { id: 'promo-2', name: 'Family Table', description: 'A set amount off shared family favorites.', type: 'Fixed amount', value: 120, status: 'Scheduled', start: 'Nov 15, 2026', end: 'Dec 15, 2026', usage: 0, limit: 200, performance: '₱0', items: ['Sunday Kare-Kare'], categories: ['Family Meals'], minimum: 900 },
  { id: 'promo-3', name: 'Founders Week', description: 'A past celebration of local flavors.', type: 'Percent', value: 10, status: 'Expired', start: 'Oct 01, 2026', end: 'Oct 07, 2026', usage: 124, limit: 150, performance: '₱24,860', items: ['Chicken Inasal'], categories: ['House Favorites'], minimum: 300 },
  { id: 'promo-4', name: 'Rainy Day Special', description: 'Paused while the kitchen reviews its seasonal menu.', type: 'Fixed amount', value: 50, status: 'Inactive', start: 'Oct 20, 2026', end: 'Nov 20, 2026', usage: 12, limit: 100, performance: '₱2,100', items: ['Bulalo Bowl'], categories: ['Comfort Food'], minimum: 400 },
];

export const PROMOTION_FILTERS = ['All', 'Active', 'Scheduled', 'Expired'];
export const PROMOTION_ITEM_SAMPLES = ['Chicken Inasal', 'Sunday Kare-Kare', 'Pandan Latte', 'Ube Cheese Pandesal', 'Bulalo Bowl'];
export const PROMOTION_CATEGORY_SAMPLES = ['House Favorites', 'Family Meals', 'Drinks', 'Merienda', 'Comfort Food'];
