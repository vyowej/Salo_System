import { ADMIN_MOCK_DATA } from './data';
import { getCodRemittances, getOrdersWithFinancials, getPayoutRecords, getPlatformTotals, getRefundRecords } from './financials';
import { getAdminWorkspaceRecords } from './operations';
import { getDashboardMetrics } from './dashboard';

function platformRows(orders, totals, metrics) {
  const statusCounts = ['Completed', 'In Transit', 'Preparing', 'Cancelled'].map((status) => ({
    metric: `${status} orders`,
    value: orders.filter((order) => order.status === status).length,
  }));
  return [
    ...statusCounts,
    { metric: 'Average order value', value: orders.length ? totals.gmv / orders.length : 0, money: true },
    { metric: 'Customers in selected orders', value: metrics.totalCustomers },
    { metric: 'Active restaurants', value: metrics.approvedRestaurants },
    { metric: 'Active riders', value: metrics.activeRiders },
  ];
}

function financialRows(totals, orders, reservations = []) {
  const payouts = getPayoutRecords().filter((item) => orders.some((order) => order.id === item.orderId));
  const remittances = getCodRemittances().filter((item) => orders.some((order) => order.id === item.orderId));
  const refunds = getRefundRecords().filter((item) => orders.some((order) => order.id === item.relatedRecordId)
    || reservations.some((reservation) => reservation.id === item.relatedRecordId));
  return [
    { metric: 'Order GMV', value: totals.gmv, money: true },
    { metric: 'Platform revenue', value: totals.platformRevenue, money: true },
    { metric: 'Restaurant sales', value: totals.restaurantSales, money: true },
    { metric: 'Platform commissions', value: totals.platformCommission, money: true },
    { metric: 'Delivery fees', value: totals.deliveryFees, money: true },
    { metric: 'Other platform fees', value: totals.serviceFees, money: true },
    { metric: 'Discounts', value: totals.discounts, money: true },
    { metric: 'Refunds and adjustments', value: totals.refunds, money: true },
    { metric: 'Restaurant payable', value: totals.restaurantPayable, money: true },
    { metric: 'Reservation fees', value: totals.reservationFees, money: true },
    { metric: 'Rider earnings', value: payouts.filter((item) => item.kind === 'Rider').reduce((sum, item) => sum + item.netPayable, 0), money: true },
    { metric: 'COD collected', value: remittances.reduce((sum, item) => sum + item.collectedAmount, 0), money: true },
    { metric: 'Outstanding COD remittance', value: remittances.reduce((sum, item) => sum + item.outstandingAmount, 0), money: true },
    { metric: 'Payout total', value: payouts.reduce((sum, item) => sum + item.netPayable, 0), money: true },
    { metric: 'Refund records', value: refunds.length },
    { metric: 'Reservations', value: reservations.length },
  ];
}

export function getAdminReportData(type, filters = {}) {
  const dashboard = getDashboardMetrics(filters);
  let orders = dashboard.orders;
  const reservations = dashboard.reservations;
  if (filters.transactionType === 'COD') orders = orders.filter((order) => order.paymentMethod.includes('(COD)'));
  if (filters.transactionType === 'Online') orders = orders.filter((order) => !order.paymentMethod.includes('(COD)'));
  if (filters.transactionType === 'Reservation') orders = [];
  const selectedIds = new Set(orders.map((order) => order.id));
  const totals = filters.transactionType === 'Reservation'
    ? getPlatformTotals({ orderIds: selectedIds, reservationIds: new Set(reservations.map((item) => item.id)) })
    : filters.transactionType
      ? getPlatformTotals({ orderIds: selectedIds })
      : dashboard.totals;
  const metrics = dashboard.metrics;

  if (type === 'Financial') return {
    rows: financialRows(totals, orders, filters.transactionType === 'Reservation' ? reservations : []),
    totals,
    message: 'Amounts come from the same immutable fee snapshots used by Orders and Finance.',
  };
  if (type === 'Platform') return {
    rows: platformRows(orders, totals, metrics),
    totals,
    message: 'Order GMV is customer order value. Platform revenue is a separate fee and commission measure.',
  };
  if (type === 'Restaurant') {
    const restaurants = dashboard.restaurantRecords;
    return {
      rows: restaurants.map((restaurant) => {
        const restaurantOrders = orders.filter((order) => order.restaurantIds.includes(restaurant.id));
        return {
          restaurant: restaurant.name,
          city: restaurant.zone,
          orders: restaurantOrders.length,
          cancelled: restaurantOrders.filter((order) => order.status === 'Cancelled').length,
          rating: restaurant.rating || 0,
          acceptanceRate: restaurant.acceptanceRate,
          complaints: restaurant.complaints,
          sales: 'Per-restaurant sales are not itemized in the shared multi-restaurant order snapshots.',
        };
      }),
      totals,
      message: 'Store-level sales cannot be safely allocated from multi-restaurant order snapshots; aggregate platform totals remain available.',
    };
  }
  if (type === 'Rider') {
    const payouts = getPayoutRecords().filter((item) => selectedIds.has(item.orderId) && item.kind === 'Rider');
    return {
      rows: dashboard.riderRecords.map((rider) => {
        const riderOrders = orders.filter((order) => order.riderId === rider.id);
        return {
          rider: rider.name,
          zone: rider.zone,
          completedDeliveries: riderOrders.filter((order) => order.status === 'Completed').length,
          failedDeliveries: rider.failedDeliveries,
          availability: rider.isOnline ? 'Online' : 'Offline',
          codStatus: rider.codStatus,
          earnings: payouts.filter((item) => item.recipient === rider.name).reduce((sum, item) => sum + item.netPayable, 0),
        };
      }),
      totals,
      message: 'Rider payout values use the shared payout selector; operational fields are demo records.',
    };
  }
  if (type === 'Customer') {
    const customerOrders = orders.reduce((counts, order) => {
      counts.set(order.customerEmail, (counts.get(order.customerEmail) || 0) + 1);
      return counts;
    }, new Map());
    const repeats = [...customerOrders.values()].filter((count) => count > 1).length;
    return {
      rows: [
        { metric: 'Unique customers with matching orders', value: customerOrders.size },
        { metric: 'Repeat customers in selected orders', value: repeats },
        { metric: 'Repeat customer rate', value: customerOrders.size ? `${Math.round(repeats / customerOrders.size * 100)}%` : '0%' },
        { metric: 'Orders', value: orders.length },
        { metric: 'Discounted orders', value: orders.filter((order) => order.feeBreakdown.discount.amount > 0).length },
      ],
      totals,
      message: 'Customer reporting is aggregated and excludes names, email addresses, and direct identifiers.',
    };
  }
  if (type === 'Discount') {
    const campaigns = getAdminWorkspaceRecords('discounts').filter((campaign) => !filters.promotion || campaign.code === filters.promotion);
    return {
      rows: campaigns.map((campaign) => ({
        campaign: campaign.name,
        status: campaign.status,
        usage: campaign.usageCount,
        customers: campaign.customerCount,
        orders: campaign.ordersGenerated,
        discountTotal: campaign.discountTotal,
        fundingSource: campaign.fundingSource,
        platformFunded: campaign.discountTotal * (campaign.platformShare || 0) / 100,
        restaurantFunded: campaign.discountTotal * (campaign.restaurantShare || 0) / 100,
      })),
      totals,
      message: 'Campaign metrics are simulated. Order-level discounts remain the authoritative historical snapshots.',
    };
  }
  if (type === 'Location') {
    const cities = [...new Set(orders.map((order) => order.city))];
    return {
      rows: cities.map((city) => {
        const cityOrders = orders.filter((order) => order.city === city);
        const cityTotals = getPlatformTotals({ orderIds: new Set(cityOrders.map((order) => order.id)) });
        return {
          location: city,
          orders: cityOrders.length,
          gmv: cityTotals.gmv,
          platformRevenue: cityTotals.platformRevenue,
          activeRestaurants: ADMIN_MOCK_DATA.restaurants.filter((restaurant) => (restaurant.serviceCoverage || []).includes(city) && restaurant.status === 'Active').length,
          availableRiders: ADMIN_MOCK_DATA.riders.filter((rider) => rider.isOnline && (rider.zone.includes(city) || city === 'Quezon City' && rider.zone.startsWith('QC'))).length,
        };
      }),
      totals,
      message: 'Location-level money figures use stored order snapshots. Zone availability is indicative demo data.',
    };
  }
  return {
    rows: getOrdersWithFinancials().filter((order) => selectedIds.has(order.id)).map((order) => ({
      reference: order.id,
      city: order.city,
      status: order.status,
      paymentMethod: order.paymentMethod,
      total: order.feeBreakdown.orderTotal,
    })),
    totals,
    message: 'Report data is filtered from shared demo order records.',
  };
}

export function getReportFilterOptions() {
  return {
    cities: [...new Set(ADMIN_MOCK_DATA.orders.map((order) => order.city))],
    restaurants: ADMIN_MOCK_DATA.restaurants,
    riders: ADMIN_MOCK_DATA.riders,
    statuses: [...new Set(ADMIN_MOCK_DATA.orders.map((order) => order.status))],
    paymentMethods: [...new Set(ADMIN_MOCK_DATA.orders.map((order) => order.paymentMethod))],
    promotions: [...new Set(ADMIN_MOCK_DATA.orders.map((order) => order.feeBreakdown.discount.code).filter(Boolean))],
  };
}
