import {
  ADMIN_MOCK_DATA,
  getAdminDisputes,
  getAdminWorkspaceRecords,
  getCodRemittances,
  getPayoutRecords,
  getRefundRecords,
} from '../mocks';

export function getPendingApplicationsCount() {
  const pendingRestaurants = ADMIN_MOCK_DATA.restaurants.filter(
    (item) => item.status === 'Pending Approval' || item.applicationStatus === 'Pending Review',
  ).length;
  const pendingRiders = ADMIN_MOCK_DATA.riders.filter(
    (item) => item.status === 'Pending Verification' || item.applicationStatus === 'Pending Review',
  ).length;
  return pendingRestaurants + pendingRiders;
}

export function getOpenSupportCount() {
  const tickets = getAdminWorkspaceRecords('support');
  return tickets.filter((ticket) => ticket.status !== 'Resolved' && ticket.status !== 'Closed').length;
}

export function getAdminNotifications() {
  const items = [];

  // 1. Pending applications (restaurants + riders)
  ADMIN_MOCK_DATA.restaurants
    .filter((item) => item.status === 'Pending Approval' || item.applicationStatus === 'Pending Review')
    .forEach((restaurant) => {
      items.push({
        id: `notif-app-${restaurant.id}`,
        type: 'applications',
        groupLabel: 'Pending Applications',
        text: `Restaurant application: ${restaurant.name}`,
        time: `${restaurant.joinedDate}T09:00:00+08:00`,
        href: '/admin/applications',
        module: 'applications',
      });
    });

  ADMIN_MOCK_DATA.riders
    .filter((item) => item.status === 'Pending Verification' || item.applicationStatus === 'Pending Review')
    .forEach((rider) => {
      items.push({
        id: `notif-app-${rider.id}`,
        type: 'applications',
        groupLabel: 'Pending Applications',
        text: `Rider application: ${rider.name}`,
        time: `${rider.joinedDate}T09:00:00+08:00`,
        href: '/admin/applications',
        module: 'applications',
      });
    });

  // 2. Disputes & escalations
  getAdminDisputes()
    .filter((dispute) => dispute.status === 'Open' || dispute.status === 'Investigating')
    .forEach((dispute) => {
      items.push({
        id: `notif-dispute-${dispute.id}`,
        type: 'disputes',
        groupLabel: 'Disputes & Escalations',
        text: `${dispute.type} on ${dispute.relatedRecordId} (${dispute.id})`,
        time: dispute.createdAt,
        href: `/admin/orders/disputes/${dispute.id}`,
        module: 'orders',
      });
    });

  // 3. Support tickets
  getAdminWorkspaceRecords('support')
    .filter((ticket) => ticket.status !== 'Resolved' && ticket.status !== 'Closed')
    .forEach((ticket) => {
      items.push({
        id: `notif-support-${ticket.id}`,
        type: 'support',
        groupLabel: 'Support Tickets',
        text: `${ticket.id}: ${ticket.subject}`,
        time: ticket.createdAt,
        href: '/admin/support',
        module: 'support',
      });
    });

  // 4. Refund & payout approvals waiting
  getRefundRecords()
    .filter((refund) => refund.status === 'Pending Review' || refund.status === 'Pending Second Approval')
    .forEach((refund) => {
      items.push({
        id: `notif-refund-${refund.id}`,
        type: 'finance',
        groupLabel: 'Refund & Payout Approvals',
        text: `Refund approval waiting for ${refund.orderId}`,
        time: refund.requestedAt || '2026-11-06T18:00:00+08:00',
        href: '/admin/finance',
        module: 'finance',
      });
    });

  getPayoutRecords()
    .filter((payout) => payout.status === 'Pending' || payout.status === 'Discrepancy')
    .slice(0, 2)
    .forEach((payout) => {
      items.push({
        id: `notif-payout-${payout.id}`,
        type: 'finance',
        groupLabel: 'Refund & Payout Approvals',
        text: `Payout ${payout.status.toLowerCase()} for ${payout.restaurantName || payout.orderId}`,
        time: payout.createdAt || '2026-11-06T12:00:00+08:00',
        href: '/admin/finance',
        module: 'finance',
      });
    });

  // 5. System alerts
  getCodRemittances()
    .filter((remittance) => remittance.status === 'Discrepancy' || remittance.status === 'Remittance due')
    .slice(0, 2)
    .forEach((remittance) => {
      items.push({
        id: `notif-sys-${remittance.id}`,
        type: 'system',
        groupLabel: 'System Alerts',
        text: `COD ${remittance.status.toLowerCase()}: ${remittance.riderName || remittance.orderId}`,
        time: remittance.updatedAt || '2026-11-06T14:00:00+08:00',
        href: '/admin/finance',
        module: 'finance',
      });
    });

  return items.sort((a, b) => new Date(b.time) - new Date(a.time));
}

export function formatRelativeTime(isoString) {
  if (!isoString) return 'Just now';
  const target = new Date(isoString).getTime();
  if (Number.isNaN(target)) return 'Recently';
  const reference = new Date('2026-11-10T10:00:00+08:00').getTime();
  const diffMs = Math.max(0, reference - target);
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 60) return `${Math.max(1, diffMins)}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}
