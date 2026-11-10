import { ADMIN_MOCK_DATA } from './data';
import { getOrdersWithFinancials, getPlatformTotals } from './financials';

function dateBounds(filters) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date()).map(({ type, value }) => [type, value]));
  const todayKey = `${parts.year}-${parts.month}-${parts.day}`;
  const date = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)));
  if (filters.range === 'Today') return [todayKey, todayKey];
  if (filters.range === 'Yesterday') {
    date.setUTCDate(date.getUTCDate() - 1);
    const value = date.toISOString().slice(0, 10);
    return [value, value];
  }
  if (filters.range === 'This Week') {
    const day = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() - day + 1);
    return [date.toISOString().slice(0, 10), todayKey];
  }
  if (filters.range === 'This Year') return [`${parts.year}-01-01`, todayKey];
  if (filters.range === 'Custom Date Range') return [filters.from || '', filters.to || ''];
  return [`${parts.year}-${parts.month}-01`, todayKey];
}

export function getDashboardMetrics(filters = {}) {
  const [from, to] = dateBounds(filters);
  const orders = getOrdersWithFinancials().filter((order) => {
    const day = order.createdAt.slice(0, 10);
    const orderZone = ADMIN_MOCK_DATA.riders.find((rider) => rider.id === order.riderId)?.zone;
    const zoneMatches = !filters.zone || (order.riderId ? orderZone === filters.zone : filters.zone === 'Unassigned');
    return (!from || day >= from)
      && (!to || day <= to)
      && (!filters.city || order.city === filters.city)
      && (!filters.restaurantId || order.restaurantIds.includes(filters.restaurantId))
      && (!filters.riderId || order.riderId === filters.riderId)
      && (!filters.status || order.status === filters.status)
      && (!filters.paymentMethod || order.paymentMethod === filters.paymentMethod)
      && zoneMatches
      && (!filters.promotion || order.feeBreakdown.discount.code === filters.promotion);
  });
  const serviceZones = ADMIN_MOCK_DATA.serviceAreas.flatMap((area) => area.zones.map((zone) => ({ ...zone, city: area.city })));
  const restaurants = ADMIN_MOCK_DATA.restaurants.filter((restaurant) => (
    (!filters.restaurantId || restaurant.id === filters.restaurantId)
    && (!filters.city || restaurant.zone === filters.city || restaurant.serviceCoverage?.includes(filters.city))
    && (!filters.zone || serviceZones.some((zone) => zone.name === filters.zone && zone.restaurantIds.includes(restaurant.id)))
  ));
  const riders = ADMIN_MOCK_DATA.riders.filter((rider) => {
    const assignedZone = serviceZones.find((zone) => zone.riderIds.includes(rider.id));
    return (!filters.riderId || rider.id === filters.riderId)
      && (!filters.city || assignedZone?.city === filters.city)
      && (!filters.zone || assignedZone?.name === filters.zone);
  });
  const reservations = ADMIN_MOCK_DATA.reservations.filter((reservation) => {
    const day = reservation.reservedAt.slice(0, 10);
    const restaurant = ADMIN_MOCK_DATA.restaurants.find((item) => item.id === reservation.restaurantId);
    return (!from || day >= from) && (!to || day <= to)
      && (!filters.restaurantId || reservation.restaurantId === filters.restaurantId)
      && (!filters.city || restaurant?.zone === filters.city)
      && !(filters.zone || filters.status || filters.paymentMethod || filters.riderId);
  });
  const ids = new Set(orders.map((order) => order.id));
  const reservationIds = new Set(reservations.map((reservation) => reservation.id));
  const totals = getPlatformTotals({ orderIds: ids, reservationIds });

  return {
    orders,
    reservations,
    totals,
    metrics: {
      totalCustomers: new Set(orders.map((order) => order.customerEmail)).size,
      activeCustomers: new Set(orders.filter((order) => order.status !== 'Cancelled').map((order) => order.customerEmail)).size,
      totalRestaurants: restaurants.length,
      pendingRestaurantApplications: restaurants.filter((restaurant) => restaurant.status === 'Pending Approval').length,
      approvedRestaurants: restaurants.filter((restaurant) => restaurant.status === 'Active').length,
      suspendedRestaurants: restaurants.filter((restaurant) => restaurant.status === 'Suspended').length,
      totalRiders: riders.length,
      activeRiders: riders.filter((rider) => rider.isOnline).length,
      pendingRiderApplications: riders.filter((rider) => rider.status === 'Pending Verification').length,
      totalOrders: orders.length,
      activeOrders: orders.filter((order) => !['Completed', 'Cancelled'].includes(order.status)).length,
      completedOrders: orders.filter((order) => order.status === 'Completed').length,
      cancelledOrders: orders.filter((order) => order.status === 'Cancelled').length,
      totalReservations: reservations.length,
      pendingReservations: reservations.filter((reservation) => reservation.status === 'Pending').length,
      pendingPayouts: totals.pendingPayouts,
      outstandingCodRemittances: totals.outstandingCodRemittances,
    },
    restaurantRecords: restaurants,
    riderRecords: riders,
    restaurants: restaurants.filter((restaurant) => restaurant.status === 'Pending Approval'),
    riders: riders.filter((rider) => rider.status === 'Pending Verification'),
  };
}
