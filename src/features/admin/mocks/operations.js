import { ADMIN_MOCK_DATA } from './data';
import { getAdminAuditLog } from '../utils/auditLog';

const STORAGE_KEYS = {
  support: 'salo_admin_support_tickets',
  banners: 'salo_admin_content_banners',
  featuredRestaurants: 'salo_admin_featured_restaurants',
  featuredCategories: 'salo_admin_featured_categories',
  announcements: 'salo_admin_announcements',
  categories: 'salo_admin_categories',
  discounts: 'salo_admin_discount_campaigns',
};

const NOW = '2026-11-10T09:00:00+08:00';
const CATEGORIES = [...new Set(ADMIN_MOCK_DATA.restaurants.map((item) => item.cuisine))].map((name, index) => ({
  id: `category-${index + 1}`,
  name,
  description: `${name} restaurants`,
  status: 'Active',
  updatedAt: NOW,
}));

const INITIAL_RECORDS = {
  support: [
    { id: 'TKT-2601', requester: 'Patricia Gomez', requesterType: 'Customer', email: 'customer@salo.ph', category: 'Missing or incorrect item', subject: 'Missing side dish from order', relatedRecordId: 'SALO-MNL-2041', status: 'Under Review', priority: 'High', assignedAdminId: 'admin-2', createdAt: '2026-11-09T14:15:00+08:00', messages: [{ author: 'Patricia Gomez', type: 'Customer', body: 'The grilled vegetables were not in the delivery bag.', time: '2026-11-09T14:15:00+08:00' }], notes: [], history: [{ title: 'Ticket submitted', description: 'Customer submitted an order complaint.', time: '2026-11-09T14:15:00+08:00' }] },
    { id: 'TKT-2602', requester: 'Dalisay Reyes', requesterType: 'Restaurant Owner', email: 'owner@salo.ph', category: 'Payment issue', subject: 'COD settlement needs review', relatedRecordId: 'SALO-MNL-2039', status: 'Submitted', priority: 'Normal', assignedAdminId: null, createdAt: '2026-11-08T10:30:00+08:00', messages: [{ author: 'Dalisay Reyes', type: 'Restaurant Owner', body: 'Please confirm the payment status for the completed order.', time: '2026-11-08T10:30:00+08:00' }], notes: [], history: [{ title: 'Ticket submitted', description: 'Restaurant owner submitted a payment question.', time: '2026-11-08T10:30:00+08:00' }] },
    { id: 'TKT-2603', requester: 'Danilo Ramos', requesterType: 'Rider', email: 'rider@salo.ph', category: 'Safety incident', subject: 'Delivery access issue', relatedRecordId: 'SALO-MNL-2037', status: 'Escalated', priority: 'Urgent', assignedAdminId: 'admin-3', createdAt: '2026-11-07T18:40:00+08:00', messages: [{ author: 'Danilo Ramos', type: 'Rider', body: 'Building security would not allow access to the drop-off area.', time: '2026-11-07T18:40:00+08:00' }], notes: ['Follow up with building management.'], history: [{ title: 'Ticket submitted', description: 'Rider submitted an incident.', time: '2026-11-07T18:40:00+08:00' }, { title: 'Escalated', description: 'Safety review requested.', time: '2026-11-08T08:00:00+08:00' }] },
    { id: 'TKT-2604', requester: 'Katrina Sy', requesterType: 'Restaurant Owner', email: 'katrina.sy@gmail.com', category: 'Restaurant complaint', subject: 'Restaurant listing information update', relatedRecordId: 'rest-2', status: 'Resolved', priority: 'Low', assignedAdminId: 'admin-2', createdAt: '2026-11-03T11:00:00+08:00', messages: [{ author: 'Katrina Sy', type: 'Restaurant Owner', body: 'Please update our listed business hours.', time: '2026-11-03T11:00:00+08:00' }, { author: 'Mika Santos', type: 'Admin', body: 'The request has been recorded for the restaurant profile team.', time: '2026-11-04T09:30:00+08:00' }], notes: [], history: [{ title: 'Ticket submitted', description: 'Restaurant profile request received.', time: '2026-11-03T11:00:00+08:00' }, { title: 'Resolved', description: 'Updated business hours per restaurant request.', time: '2026-11-04T09:30:00+08:00' }] },
    { id: 'TKT-2605', requester: 'Maria Santos', requesterType: 'Customer', email: 'maria.santos@example.ph', category: 'Reservation complaint', subject: 'Reservation confirmation question', relatedRecordId: 'RSV-1102', status: 'Awaiting Response', priority: 'Normal', assignedAdminId: 'admin-1', createdAt: '2026-11-02T13:00:00+08:00', messages: [{ author: 'Maria Santos', type: 'Customer', body: 'I have a question about my reservation confirmation.', time: '2026-11-02T13:00:00+08:00' }], notes: [], history: [{ title: 'Ticket submitted', description: 'Customer requested reservation assistance.', time: '2026-11-02T13:00:00+08:00' }, { title: 'Awaiting response', description: 'Requested additional reservation details.', time: '2026-11-02T14:00:00+08:00' }] },
  ],
  banners: [
    { id: 'banner-1', title: 'SALO November Picks', placement: 'Homepage hero', imageLabel: 'November campaign artwork', link: '/customer/restaurants', startAt: '2026-11-01T00:00:00+08:00', endAt: '2026-11-30T23:59:00+08:00', status: 'Active' },
    { id: 'banner-2', title: 'Discover Filipino favourites', placement: 'Homepage secondary', imageLabel: 'Filipino favourites artwork', link: '/customer/restaurants', startAt: '2026-11-15T00:00:00+08:00', endAt: '2026-12-15T23:59:00+08:00', status: 'Scheduled' },
  ],
  featuredRestaurants: [
    { id: 'feature-rest-1', restaurantId: 'rest-1', placement: 'Homepage', rank: 1, startAt: '2026-11-01T00:00:00+08:00', endAt: '2026-11-30T23:59:00+08:00', status: 'Active' },
    { id: 'feature-rest-2', restaurantId: 'rest-3', placement: 'Popular near you', rank: 2, startAt: '2026-11-01T00:00:00+08:00', endAt: '2026-11-30T23:59:00+08:00', status: 'Active' },
  ],
  featuredCategories: [
    { id: 'feature-category-1', categoryId: CATEGORIES[0]?.id, placement: 'Homepage', rank: 1, status: 'Active' },
    { id: 'feature-category-2', categoryId: CATEGORIES[1]?.id, placement: 'Homepage', rank: 2, status: 'Active' },
  ],
  announcements: [
    { id: 'notice-1', title: 'Scheduled service update', body: 'Some platform features may be unavailable during scheduled maintenance.', audience: 'All users', startAt: '2026-11-20T01:00:00+08:00', endAt: '2026-11-20T03:00:00+08:00', status: 'Scheduled' },
    { id: 'notice-2', title: 'Welcome to SALO', body: 'Find local restaurants, order meals, and reserve a table.', audience: 'Customers', startAt: '2026-11-01T00:00:00+08:00', endAt: '2026-11-30T23:59:00+08:00', status: 'Active' },
  ],
  categories: CATEGORIES,
  discounts: [
    { id: 'promo-1', name: 'November Welcome', description: 'Percentage discount for first-time customers.', type: 'Percentage discount', value: 15, minimumSpend: 300, maximumDiscount: 120, startsAt: '2026-11-01T00:00:00+08:00', endsAt: '2026-11-30T23:59:00+08:00', restaurants: [], locations: ['Quezon City'], customerGroups: ['First order'], usageLimit: 500, perCustomerLimit: 1, orderTypes: ['Delivery', 'Pickup'], paymentMethods: ['All'], code: 'SALO30', fundingSource: 'Platform-funded', platformShare: 100, restaurantShare: 0, budget: 30000, usageCount: 126, discountTotal: 11850, customerCount: 121, ordersGenerated: 126, status: 'Active' },
    { id: 'promo-2', name: 'Dalisay Shared Delivery', description: 'Shared-funded delivery fee promotion.', type: 'Discounted delivery fee', value: 30, minimumSpend: 0, maximumDiscount: 30, startsAt: '2026-11-15T00:00:00+08:00', endsAt: '2026-12-15T23:59:00+08:00', restaurants: ['rest-1'], locations: ['Quezon City'], customerGroups: ['All customers'], usageLimit: 300, perCustomerLimit: 2, orderTypes: ['Delivery'], paymentMethods: ['All'], code: 'DALISAY30', fundingSource: 'Shared-funded', platformShare: 50, restaurantShare: 50, budget: 9000, usageCount: 0, discountTotal: 0, customerCount: 0, ordersGenerated: 0, status: 'Scheduled' },
    { id: 'promo-3', name: 'October Fixed Savings', description: 'Expired fixed amount promotion; retained for historical reporting.', type: 'Fixed amount discount', value: 50, minimumSpend: 250, maximumDiscount: 50, startsAt: '2026-10-01T00:00:00+08:00', endsAt: '2026-10-31T23:59:00+08:00', restaurants: [], locations: [], customerGroups: ['Returning customers'], usageLimit: 800, perCustomerLimit: 2, orderTypes: ['Delivery', 'Pickup'], paymentMethods: ['All'], code: 'SILOG10', fundingSource: 'Restaurant-funded', platformShare: 0, restaurantShare: 100, budget: 40000, usageCount: 273, discountTotal: 13650, customerCount: 248, ordersGenerated: 273, status: 'Expired' },
  ],
};

function readStorage(key, fallback) {
  if (typeof localStorage === 'undefined') return fallback;
  const stored = localStorage.getItem(key);
  return stored ? JSON.parse(stored) : fallback;
}

export function getAdminWorkspaceRecords(topic) {
  if (topic === 'activity') {
    const audit = getAdminAuditLog();
    const samples = [
      { id: 'audit-seed-1', who: 'Mika Santos', role: 'Super Admin', action: 'Updated restaurant application', record: { type: 'Restaurant', id: 'rest-4' }, time: '2026-11-09T10:15:00+08:00', previousValue: 'Pending Review', newValue: 'Under Review', reason: 'Application documents received', reference: 'rest-4' },
      { id: 'audit-seed-2', who: 'Jules Navarro', role: 'Finance', action: 'Reviewed COD remittance', record: { type: 'Order', id: 'SALO-MNL-2039' }, time: '2026-11-08T16:25:00+08:00', previousValue: 'Submitted', newValue: 'Discrepancy', reason: 'Submitted amount requires reconciliation', reference: 'SALO-MNL-2039' },
      { id: 'audit-seed-3', who: 'Mika Santos', role: 'Super Admin', action: 'Scheduled platform announcement', record: { type: 'Announcement', id: 'notice-1' }, time: '2026-11-08T12:00:00+08:00', previousValue: null, newValue: 'Scheduled', reason: 'Notify users of maintenance window', reference: 'notice-1' },
    ];
    const ids = new Set(audit.map((item) => item.id));
    return [...audit, ...samples.filter((item) => !ids.has(item.id))]
      .sort((a, b) => new Date(b.time || b.createdAt) - new Date(a.time || a.createdAt));
  }
  const key = STORAGE_KEYS[topic];
  if (!key || !INITIAL_RECORDS[topic]) throw new Error(`Unknown admin workspace topic: ${topic}`);
  return readStorage(key, INITIAL_RECORDS[topic]);
}

export function saveAdminWorkspaceRecords(topic, records) {
  const key = STORAGE_KEYS[topic];
  if (!key || !INITIAL_RECORDS[topic]) throw new Error(`Unknown admin workspace topic: ${topic}`);
  if (typeof localStorage !== 'undefined') localStorage.setItem(key, JSON.stringify(records));
  return records;
}

export function getAdminCategories() {
  return getAdminWorkspaceRecords('categories');
}

export function getAdminContentData() {
  return {
    banners: getAdminWorkspaceRecords('banners'),
    featuredRestaurants: getAdminWorkspaceRecords('featuredRestaurants'),
    featuredCategories: getAdminWorkspaceRecords('featuredCategories'),
    announcements: getAdminWorkspaceRecords('announcements'),
    categories: getAdminWorkspaceRecords('categories'),
  };
}
