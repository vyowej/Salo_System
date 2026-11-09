import { ADMIN_MOCK_DATA } from './data';
import {
  getCodRemittances,
  getFeeConfigurations,
  getFinancialTransactions,
  getPayoutRecords,
  getPlatformTotals,
  getRefundRecords,
  getOrdersWithFinancials,
} from './financials';
import { getAdminDisputes } from './disputes';

const accountDirectory = [
  ...ADMIN_MOCK_DATA.customers.map((customer) => ({
    id: customer.id,
    name: customer.name,
    username: customer.username,
    email: customer.email,
    phone: customer.phone,
    capabilities: customer.capabilities,
    status: customer.status,
    joined: customer.joined,
    ordersCount: customer.ordersCount,
    reservationsCount: customer.reservationsCount,
    verificationStatus: customer.verificationStatus,
  })),
  ...ADMIN_MOCK_DATA.restaurants.map((restaurant) => ({
    id: `account-${restaurant.id}`,
    name: restaurant.ownerName,
    username: restaurant.ownerEmail.split('@')[0],
    email: restaurant.ownerEmail,
    phone: restaurant.phone,
    capabilities: ['Owner'],
    status: restaurant.status === 'Pending Approval' ? 'Pending Verification' : restaurant.status,
    joined: restaurant.joinedDate,
    ordersCount: restaurant.ordersCount,
    reservationsCount: restaurant.reservationsCount,
    verificationStatus: restaurant.verificationStatus,
  })),
  ...ADMIN_MOCK_DATA.riders.map((rider) => ({
    id: `account-${rider.id}`,
    name: rider.name,
    username: rider.username,
    email: rider.email,
    phone: rider.phone,
    capabilities: ['Rider'],
    status: rider.status,
    joined: '2026-08-20',
    ordersCount: rider.totalTrips,
    reservationsCount: 0,
    verificationStatus: rider.verificationStatus,
  })),
  ...ADMIN_MOCK_DATA.administrators.map((admin) => ({
    id: `account-${admin.id}`,
    name: admin.name,
    username: admin.username,
    email: admin.email,
    phone: null,
    capabilities: ['Admin'],
    status: admin.status === 'Pending Invitation' ? 'Pending Verification' : admin.status,
    joined: admin.invitedAt,
    ordersCount: 0,
    reservationsCount: 0,
    verificationStatus: admin.invitationStatus,
  })),
].reduce((accounts, account) => {
  const existing = accounts.find((item) => item.email.toLowerCase() === account.email.toLowerCase());
  if (!existing) return [...accounts, account];
  return accounts.map((item) => item.email.toLowerCase() === account.email.toLowerCase()
    ? { ...item, capabilities: [...new Set([...item.capabilities, ...account.capabilities])] }
    : item);
}, []);

const topics = {
  dashboard: ADMIN_MOCK_DATA.stats,
  accounts: accountDirectory,
  administrators: ADMIN_MOCK_DATA.administrators,
  restaurants: ADMIN_MOCK_DATA.restaurants,
  riders: ADMIN_MOCK_DATA.riders,
  orders: getOrdersWithFinancials(),
  reservations: ADMIN_MOCK_DATA.reservations,
  finance: { ...ADMIN_MOCK_DATA.finance, totals: getPlatformTotals(), transactions: getFinancialTransactions(), cod: getCodRemittances(), refunds: getRefundRecords(), payouts: getPayoutRecords() },
  fees: getFeeConfigurations(),
  discounts: [],
  reports: { totals: getPlatformTotals(), transactions: getFinancialTransactions() },
  disputes: getAdminDisputes(),
  support: [],
  content: [],
  activity: [],
  settings: ADMIN_MOCK_DATA.settings,
  sessions: ADMIN_MOCK_DATA.sessions,
  administratorActivity: ADMIN_MOCK_DATA.administratorActivity,
  serviceAreas: ADMIN_MOCK_DATA.serviceAreas,
};

export function getAdminMock(topic, scenario = 'default') {
  const data = topics[topic];
  if (data === undefined) throw new Error(`Unknown admin mock topic: ${topic}`);
  if (scenario === 'loading') return { state: 'loading', data: null, error: null };
  if (scenario === 'error') return { state: 'error', data: null, error: 'Unable to load this demo data.' };
  if (scenario === 'empty') return { state: 'empty', data: Array.isArray(data) ? [] : {}, error: null };
  if (scenario !== 'default') throw new Error(`Unknown admin mock scenario: ${scenario}`);
  return { state: 'success', data, error: null };
}

export { ADMIN_MOCK_DATA };
export {
  getFinancialTransactions,
  getCodRemittances,
  getFeeConfigurations,
  getOrderBreakdown,
  getOrdersWithFinancials,
  getPayoutRecords,
  getPlatformTotals,
  getRefundRecords,
  getReservationBreakdown,
  getFeePreview,
  saveFeeConfiguration,
  changeFeeStatus,
  updateCodRemittance,
  updateRefundRecord,
  reconcilePayout,
} from './financials';
export { createAdminDispute, getAdminDisputes, saveAdminDisputes } from './disputes';
