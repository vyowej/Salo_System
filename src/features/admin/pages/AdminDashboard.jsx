import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import AdminLayout from '../../../layouts/AdminLayout';
import { DataTable, PageHeader, StatCard, StatusBadge } from '../components';
import useAdminSession from '../contexts/useAdminSession';
import { ADMIN_MOCK_DATA, getDashboardMetrics } from '../mocks';
import { hasAdminPermission } from '../constants';
import { formatDateTime, formatPeso } from '../utils/format';
import './AdminPages.css';

const INITIAL_FILTERS = {
  range: 'This Month',
  from: '',
  to: '',
  city: '',
  zone: '',
  restaurantId: '',
  riderId: '',
  status: '',
  paymentMethod: '',
};

const DATE_RANGES = ['Today', 'Yesterday', 'This Week', 'This Month', 'This Year', 'Custom Date Range'];

export default function AdminDashboard() {
  const { currentAdmin } = useAdminSession();
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const snapshot = useMemo(() => getDashboardMetrics(filters), [filters]);
  const stats = snapshot.metrics;
  const totals = snapshot.totals;
  const orders = snapshot.orders;
  const statuses = [...new Set(ADMIN_MOCK_DATA.orders.map((order) => order.status))];
  const paymentMethods = [...new Set(ADMIN_MOCK_DATA.orders.map((order) => order.paymentMethod))];
  const zones = [...new Set(ADMIN_MOCK_DATA.serviceAreas.flatMap((area) => area.zones.map((zone) => zone.name)))];
  const canAccess = (module) => hasAdminPermission(currentAdmin.role, module, 'view');

  function updateFilter(key, value) {
    setFilters((previous) => ({ ...previous, [key]: value }));
  }

  const statCards = [
    { label: 'Customers in filtered orders', value: stats.totalCustomers },
    { label: 'Active customers', value: stats.activeCustomers },
    { label: 'Restaurant partners', value: stats.totalRestaurants },
    { label: 'Pending restaurant applications', value: stats.pendingRestaurantApplications },
    { label: 'Approved restaurants', value: stats.approvedRestaurants },
    { label: 'Suspended restaurants', value: stats.suspendedRestaurants },
    { label: 'Registered riders', value: stats.totalRiders },
    { label: 'Online riders', value: stats.activeRiders },
    { label: 'Pending rider applications', value: stats.pendingRiderApplications },
    { label: 'Orders in selected period', value: stats.totalOrders },
    { label: 'Active orders', value: stats.activeOrders },
    { label: 'Completed orders', value: stats.completedOrders },
    { label: 'Cancelled orders', value: stats.cancelledOrders },
    { label: 'Reservations in selected period', value: stats.totalReservations },
    { label: 'Pending reservations', value: stats.pendingReservations },
    { label: 'Pending payouts', value: formatPeso(totals.pendingPayouts) },
    { label: 'Outstanding COD remittances', value: formatPeso(totals.outstandingCodRemittances) },
    { label: 'Total customer transaction value · GMV', value: formatPeso(totals.gmv), hint: 'Not platform revenue' },
    { label: 'Platform revenue', value: formatPeso(totals.platformRevenue), hint: 'Commission and fee snapshots net of platform-funded discounts' },
  ];

  const quickActions = [
    { title: 'Review pending applications', to: '/admin/restaurants', module: 'restaurants' },
    { title: 'Manage accounts', to: '/admin/accounts', module: 'accounts' },
    { title: 'Monitor active deliveries', to: '/admin/riders', module: 'riders' },
    { title: 'Review reported problems', to: '/admin/support', module: 'support' },
    { title: 'Manage discounts', to: '/admin/discounts', module: 'discounts' },
    { title: 'Configure fees', to: '/admin/fees', module: 'fees' },
    { title: 'View financial reports', to: '/admin/reports', module: 'reports' },
  ].filter((item) => canAccess(item.module));

  const orderColumns = [
    { key: 'id', label: 'Reference', render: (order) => <Link to={`/admin/orders/${order.id}`}>{order.id}</Link> },
    { key: 'customerName', label: 'Customer' },
    { key: 'restaurants', label: 'Restaurant', render: (order) => order.restaurants.join(', ') },
    { key: 'riderName', label: 'Rider' },
    { key: 'orderTotal', label: 'Order total', render: (order) => formatPeso(order.feeBreakdown.orderTotal) },
    { key: 'paymentMethod', label: 'Payment' },
    { key: 'status', label: 'Status', render: (order) => <StatusBadge status={order.status} /> },
    { key: 'createdAt', label: 'Date', render: (order) => formatDateTime(order.createdAt) },
  ];
  const statusCounts = statuses.map((status) => ({ status, count: orders.filter((order) => order.status === status).length }));
  const maximumStatusCount = Math.max(1, ...statusCounts.map((item) => item.count));

  return (
    <AdminLayout>
      <section className="admin-shell-page admin-dashboard">
        <PageHeader title="Platform Dashboard" description="Monitor platform activity and authoritative financial snapshots for the selected filters." />
        <section className="admin-record-panel" aria-label="Dashboard filters">
          <h2>Filter dashboard</h2>
          <div className="admin-dashboard-filters">
            <label className="admin-filter-control">Date range<select value={filters.range} onChange={(event) => updateFilter('range', event.target.value)}>{DATE_RANGES.map((range) => <option key={range}>{range}</option>)}</select></label>
            {filters.range === 'Custom Date Range' && <>
              <label className="admin-filter-control">From<input aria-label="Dashboard from date" type="date" value={filters.from} onChange={(event) => updateFilter('from', event.target.value)} /></label>
              <label className="admin-filter-control">To<input aria-label="Dashboard to date" type="date" value={filters.to} onChange={(event) => updateFilter('to', event.target.value)} /></label>
            </>}
            <label className="admin-filter-control">City<select value={filters.city} onChange={(event) => updateFilter('city', event.target.value)}><option value="">All cities</option>{[...new Set(ADMIN_MOCK_DATA.orders.map((order) => order.city))].map((city) => <option key={city}>{city}</option>)}</select></label>
            <label className="admin-filter-control">Service zone<select value={filters.zone} onChange={(event) => updateFilter('zone', event.target.value)}><option value="">All zones</option><option>Unassigned</option>{zones.map((zone) => <option key={zone}>{zone}</option>)}</select></label>
            <label className="admin-filter-control">Restaurant<select value={filters.restaurantId} onChange={(event) => updateFilter('restaurantId', event.target.value)}><option value="">All restaurants</option>{ADMIN_MOCK_DATA.restaurants.map((restaurant) => <option key={restaurant.id} value={restaurant.id}>{restaurant.name}</option>)}</select></label>
            <label className="admin-filter-control">Rider<select value={filters.riderId} onChange={(event) => updateFilter('riderId', event.target.value)}><option value="">All riders</option>{ADMIN_MOCK_DATA.riders.map((rider) => <option key={rider.id} value={rider.id}>{rider.name}</option>)}</select></label>
            <label className="admin-filter-control">Order status<select value={filters.status} onChange={(event) => updateFilter('status', event.target.value)}><option value="">All statuses</option>{statuses.map((status) => <option key={status}>{status}</option>)}</select></label>
            <label className="admin-filter-control">Payment method<select value={filters.paymentMethod} onChange={(event) => updateFilter('paymentMethod', event.target.value)}><option value="">All methods</option>{paymentMethods.map((method) => <option key={method}>{method}</option>)}</select></label>
          </div>
        </section>

        <div className="admin-stat-grid">
          {statCards.map((card) => <StatCard key={card.label} label={card.label} value={card.value} hint={card.hint} />)}
        </div>

        <section className="admin-record-panel">
          <div className="admin-workspace-heading"><div><h2>Order status distribution</h2><p className="admin-muted">Counts follow the active dashboard filters.</p></div><Link to="/admin/orders">Open orders</Link></div>
          <div className="admin-dashboard-chart" role="img" aria-label="Bar chart showing matching orders by status">
            {statusCounts.map((item) => <div className="admin-dashboard-chart__row" key={item.status}><span>{item.status}</span><div className="admin-dashboard-chart__track"><span style={{ width: `${item.count / maximumStatusCount * 100}%` }} /></div><strong>{item.count}</strong></div>)}
          </div>
        </section>

        <section className="admin-record-panel">
          <div className="admin-workspace-heading"><div><h2>Quick actions</h2><p className="admin-muted">Only destinations visible to your demo role are shown.</p></div></div>
          <div className="admin-dashboard-actions">{quickActions.map((action) => <Link className="admin-action-button" key={action.to} to={action.to}>{action.title}</Link>)}</div>
        </section>

        <section className="admin-record-panel">
          <div className="admin-workspace-heading"><div><h2>Pending restaurant applications</h2><p className="admin-muted">{snapshot.restaurants.length} matching applications</p></div>{canAccess('restaurants') && <Link to="/admin/restaurants">Review applications</Link>}</div>
          <div className="admin-queue-list">{snapshot.restaurants.map((restaurant) => <article key={restaurant.id}><strong>{restaurant.name}</strong><span>{restaurant.zone} · {restaurant.applicationStatus}</span></article>)}{!snapshot.restaurants.length && <p>No pending restaurants match these filters.</p>}</div>
        </section>

        <section className="admin-record-panel">
          <div className="admin-workspace-heading"><div><h2>Pending rider applications</h2><p className="admin-muted">{snapshot.riders.length} matching applications</p></div>{canAccess('riders') && <Link to="/admin/riders">Review riders</Link>}</div>
          <div className="admin-queue-list">{snapshot.riders.map((rider) => <article key={rider.id}><strong>{rider.name}</strong><span>{rider.zone} · {rider.applicationStatus}</span></article>)}{!snapshot.riders.length && <p>No pending riders match these filters.</p>}</div>
        </section>

        <section className="admin-record-panel">
          <div className="admin-workspace-heading"><div><h2>Orders in selected period</h2><p className="admin-muted">Order totals come directly from immutable stored mock breakdowns.</p></div></div>
          <DataTable columns={orderColumns} rows={orders} emptyTitle="No matching orders" emptyDescription="Adjust the dashboard date range or filters." />
        </section>
      </section>
    </AdminLayout>
  );
}
