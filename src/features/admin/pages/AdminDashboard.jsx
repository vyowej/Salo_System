import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { DataTable, PageHeader, StatCard, StatusBadge } from '../components';
import { useAdminPageSearch } from '../contexts/useAdminSearch';
import AdminLayout from '../../../layouts/AdminLayout';
import {
  getAdminDisputes,
  getCodRemittances,
  getDashboardMetrics,
  getRefundRecords,
} from '../mocks';
import { formatDateTime, formatPeso } from '../utils/format';
import './AdminPages.css';

const INITIAL_FILTERS = {
  dateRange: 'all',
  fromDate: '',
  toDate: '',
  city: 'All',
  zone: 'All',
  restaurantId: 'All',
  riderId: 'All',
  orderStatus: 'All',
  paymentMethod: 'All',
};

function getDateRangeBounds(preset) {
  if (preset === 'all') return { fromDate: '', toDate: '' };
  const now = new Date();
  const toIso = now.toISOString().slice(0, 10);
  const start = new Date(now);
  if (preset === '7d') start.setDate(start.getDate() - 6);
  if (preset === '30d') start.setDate(start.getDate() - 29);
  return { fromDate: start.toISOString().slice(0, 10), toDate: toIso };
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { query: globalQuery } = useAdminPageSearch({
    placeholder: 'Search dashboard orders, metrics, or statuses...',
    searchHint: 'Search orders, status distribution, or platform overview metrics',
  });
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false);
  const [distributionView, setDistributionView] = useState('table');
  const popoverRef = useRef(null);

  useEffect(() => {
    if (!moreFiltersOpen) return undefined;
    function handleKeyDown(event) {
      if (event.key === 'Escape') setMoreFiltersOpen(false);
    }
    function handlePointerDown(event) {
      if (popoverRef.current && !popoverRef.current.contains(event.target)) {
        setMoreFiltersOpen(false);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [moreFiltersOpen]);

  const baseData = useMemo(() => getDashboardMetrics({}), []);
  const cities = useMemo(
    () => ['All', ...new Set(baseData.restaurantRecords.map((item) => item.city).filter(Boolean))],
    [baseData.restaurantRecords],
  );
  const zones = useMemo(
    () => ['All', ...new Set(baseData.restaurantRecords.map((item) => item.zone).filter(Boolean))],
    [baseData.restaurantRecords],
  );

  const dashboard = useMemo(() => getDashboardMetrics(filters), [filters]);
  const { metrics, totals, orders } = dashboard;

  const pendingApplicationsCount =
    metrics.pendingRestaurantApplications + metrics.pendingRiderApplications;

  const recentOrders = useMemo(
    () =>
      [...orders]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 8),
    [orders],
  );

  const needsAttentionRows = useMemo(() => {
    const disputes = getAdminDisputes().filter((item) => item.status !== 'Resolved');
    const pendingRefunds = getRefundRecords().filter((item) =>
      ['Pending review', 'Pending second approver'].includes(item.approvalStatus),
    );
    const pendingCod = getCodRemittances().filter((item) =>
      ['submitted', 'discrepancy'].includes(item.status),
    );

    return [
      {
        id: 'att-apps',
        item: 'Pending applications',
        detail: `${metrics.pendingRestaurantApplications} restaurant, ${metrics.pendingRiderApplications} rider`,
        count: pendingApplicationsCount,
        status: pendingApplicationsCount > 0 ? 'Pending' : 'Clear',
        to: '/admin/applications',
      },
      {
        id: 'att-disputes',
        item: 'Open disputes',
        detail: 'Customer and order escalations',
        count: disputes.length,
        status: disputes.length > 0 ? 'Pending' : 'Clear',
        to: '/admin/orders/disputes',
      },
      {
        id: 'att-refunds',
        item: 'Pending refund approvals',
        detail: 'Awaiting finance approval',
        count: pendingRefunds.length,
        status: pendingRefunds.length > 0 ? 'Pending' : 'Clear',
        to: '/admin/finance',
      },
      {
        id: 'att-cod',
        item: 'COD remittances awaiting confirmation',
        detail: 'Submitted or flagged discrepancies',
        count: pendingCod.length,
        status: pendingCod.length > 0 ? 'Pending' : 'Clear',
        to: '/admin/finance',
      },
    ];
  }, [
    metrics.pendingRestaurantApplications,
    metrics.pendingRiderApplications,
    pendingApplicationsCount,
  ]);

  const statusDistribution = useMemo(() => {
    const statuses = ['Pending', 'Preparing', 'Out for Delivery', 'Delivered', 'Cancelled'];
    const totalCount = orders.length || 1;
    return statuses.map((status) => {
      const matching = orders.filter((order) => order.status === status);
      const amount = matching.reduce((sum, order) => sum + Number(order.total || 0), 0);
      return {
        id: status,
        status,
        count: matching.length,
        amount,
        percent: Math.round((matching.length / totalCount) * 100),
      };
    });
  }, [orders]);

  const maxStatusCount = Math.max(1, ...statusDistribution.map((row) => row.count));

  const overviewRows = useMemo(
    () => [
      {
        id: 'ov-customers',
        metric: 'Customers',
        value: String(metrics.totalCustomers),
        scope: `${metrics.activeCustomers} active`,
        to: '/admin/users',
      },
      {
        id: 'ov-restaurants',
        metric: 'Restaurants',
        value: String(metrics.totalRestaurants),
        scope: `${metrics.approvedRestaurants} approved, ${metrics.suspendedRestaurants} suspended`,
        to: '/admin/restaurants',
      },
      {
        id: 'ov-reservations',
        metric: 'Reservations',
        value: String(metrics.totalReservations),
        scope: `${metrics.pendingReservations} pending`,
        to: '/admin/reservations',
      },
      {
        id: 'ov-gmv',
        metric: 'Order GMV',
        value: formatPeso(totals.gmv),
        scope: 'Filtered order total',
        to: '/admin/finance',
      },
      {
        id: 'ov-sales',
        metric: 'Restaurant sales',
        value: formatPeso(totals.restaurantSales),
        scope: 'Before commission and adjustments',
        to: '/admin/finance',
      },
      {
        id: 'ov-cod',
        metric: 'COD outstanding',
        value: formatPeso(totals.outstandingCodRemittances),
        scope: 'Pending rider remittance',
        to: '/admin/finance',
      },
      {
        id: 'ov-refunds',
        metric: 'Refunds / adjustments',
        value: formatPeso(totals.refunds),
        scope: 'Recorded refund adjustments',
        to: '/admin/finance',
      },
    ],
    [metrics, totals],
  );

  function updateFilter(key, value) {
    if (key === 'dateRange') {
      const bounds = getDateRangeBounds(value);
      setFilters((previous) => ({ ...previous, dateRange: value, ...bounds }));
      return;
    }
    setFilters((previous) => ({ ...previous, [key]: value }));
  }

  function resetFilters() {
    setFilters(INITIAL_FILTERS);
    setMoreFiltersOpen(false);
  }

  const activeChips = useMemo(() => {
    const chips = [];
    if (filters.dateRange !== 'all') {
      const labels = { today: 'Today', '7d': 'Last 7 days', '30d': 'Last 30 days' };
      chips.push({ key: 'dateRange', label: `Date: ${labels[filters.dateRange] || filters.dateRange}` });
    }
    if (filters.city !== 'All') chips.push({ key: 'city', label: `City: ${filters.city}` });
    if (filters.zone !== 'All') chips.push({ key: 'zone', label: `Zone: ${filters.zone}` });
    if (filters.restaurantId !== 'All') {
      const restaurant = baseData.restaurants.find((item) => item.id === filters.restaurantId);
      chips.push({ key: 'restaurantId', label: `Restaurant: ${restaurant?.name || filters.restaurantId}` });
    }
    if (filters.riderId !== 'All') {
      const rider = baseData.riders.find((item) => item.id === filters.riderId);
      chips.push({ key: 'riderId', label: `Rider: ${rider?.name || filters.riderId}` });
    }
    if (filters.orderStatus !== 'All') {
      chips.push({ key: 'orderStatus', label: `Status: ${filters.orderStatus}` });
    }
    if (filters.paymentMethod !== 'All') {
      chips.push({ key: 'paymentMethod', label: `Payment: ${filters.paymentMethod}` });
    }
    return chips;
  }, [filters, baseData.restaurants, baseData.riders]);

  const recentOrderColumns = [
    {
      key: 'id',
      title: 'Order',
      render: (order) => <Link to={`/admin/orders/${order.id}`}>{order.id}</Link>,
    },
    { key: 'customerName', title: 'Customer' },
    { key: 'restaurant', title: 'Restaurant' },
    {
      key: 'total',
      title: 'Total',
      align: 'right',
      sortValue: (order) => Number(order.total || 0),
      render: (order) => formatPeso(order.total),
    },
    {
      key: 'status',
      title: 'Status',
      render: (order) => <StatusBadge status={order.status} />,
    },
    {
      key: 'createdAt',
      title: 'Placed',
      sortValue: (order) => new Date(order.createdAt).getTime(),
      render: (order) => formatDateTime(order.createdAt),
    },
  ];

  const attentionColumns = [
    {
      key: 'item',
      title: 'Item',
      render: (row) => (
        <>
          <strong>{row.item}</strong>
          <br />
          <small>{row.detail}</small>
        </>
      ),
    },
    {
      key: 'count',
      title: 'Count',
      align: 'right',
      sortValue: (row) => row.count,
    },
    {
      key: 'status',
      title: 'Status',
      render: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: 'to',
      title: 'Action',
      orderable: false,
      searchable: false,
      render: (row) => <Link to={row.to}>Review</Link>,
    },
  ];

  const distributionColumns = [
    {
      key: 'status',
      title: 'Status',
      render: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: 'count',
      title: 'Count',
      align: 'right',
      sortValue: (row) => row.count,
    },
    {
      key: 'amount',
      title: 'Amount',
      align: 'right',
      sortValue: (row) => row.amount,
      render: (row) => formatPeso(row.amount),
    },
    {
      key: 'percent',
      title: 'Share',
      align: 'right',
      sortValue: (row) => row.percent,
      render: (row) => `${row.percent}%`,
    },
  ];

  const overviewColumns = [
    { key: 'metric', title: 'Metric' },
    { key: 'value', title: 'Value', align: 'right' },
    { key: 'scope', title: 'Scope' },
    {
      key: 'to',
      title: 'Link',
      orderable: false,
      searchable: false,
      render: (row) => <Link to={row.to}>Open</Link>,
    },
  ];

  return (
    <AdminLayout>
      <section className="admin-shell-page">
        <PageHeader
          title="Operations dashboard"
          description="Live platform metrics, recent orders, and items requiring review."
        />

        <div className="admin-dashboard-filterbar" role="region" aria-label="Dashboard filters">
          <div className="admin-dashboard-filterbar__field">
            <label htmlFor="dash-date-range">Date range</label>
            <select
              id="dash-date-range"
              value={filters.dateRange}
              onChange={(event) => updateFilter('dateRange', event.target.value)}
            >
              <option value="all">All dates</option>
              <option value="today">Today</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
            </select>
          </div>
          <div className="admin-dashboard-filterbar__field">
            <label htmlFor="dash-city">City</label>
            <select
              id="dash-city"
              value={filters.city}
              onChange={(event) => updateFilter('city', event.target.value)}
            >
              {cities.map((city) => (
                <option key={city} value={city}>{city}</option>
              ))}
            </select>
          </div>
          <div className="admin-dashboard-filterbar__field">
            <label htmlFor="dash-zone">Service zone</label>
            <select
              id="dash-zone"
              value={filters.zone}
              onChange={(event) => updateFilter('zone', event.target.value)}
            >
              {zones.map((zone) => (
                <option key={zone} value={zone}>{zone}</option>
              ))}
            </select>
          </div>
          <div className="admin-dashboard-filterbar__field">
            <label htmlFor="dash-restaurant">Restaurant</label>
            <select
              id="dash-restaurant"
              value={filters.restaurantId}
              onChange={(event) => updateFilter('restaurantId', event.target.value)}
            >
              <option value="All">All</option>
              {baseData.restaurants.map((restaurant) => (
                <option key={restaurant.id} value={restaurant.id}>{restaurant.name}</option>
              ))}
            </select>
          </div>
          <div className="admin-dashboard-filterbar__field">
            <label htmlFor="dash-rider">Rider</label>
            <select
              id="dash-rider"
              value={filters.riderId}
              onChange={(event) => updateFilter('riderId', event.target.value)}
            >
              <option value="All">All</option>
              {baseData.riders.map((rider) => (
                <option key={rider.id} value={rider.id}>{rider.name}</option>
              ))}
            </select>
          </div>

          <div className="admin-dashboard-filterbar__actions" ref={popoverRef}>
            <button
              type="button"
              className="admin-action-button"
              aria-expanded={moreFiltersOpen}
              onClick={() => setMoreFiltersOpen((open) => !open)}
            >
              More filters
            </button>
            <button
              type="button"
              className="admin-text-button"
              onClick={resetFilters}
              disabled={activeChips.length === 0}
            >
              Reset
            </button>

            {moreFiltersOpen && (
              <div className="admin-dashboard-popover" role="dialog" aria-label="More dashboard filters">
                <div className="admin-dashboard-filterbar__field">
                  <label htmlFor="dash-order-status">Order status</label>
                  <select
                    id="dash-order-status"
                    value={filters.orderStatus}
                    onChange={(event) => updateFilter('orderStatus', event.target.value)}
                  >
                    {['All', 'Pending', 'Preparing', 'Out for Delivery', 'Delivered', 'Cancelled'].map((status) => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </select>
                </div>
                <div className="admin-dashboard-filterbar__field">
                  <label htmlFor="dash-payment-method">Payment method</label>
                  <select
                    id="dash-payment-method"
                    value={filters.paymentMethod}
                    onChange={(event) => updateFilter('paymentMethod', event.target.value)}
                  >
                    {['All', 'GCash', 'COD', 'Card', 'Maya'].map((method) => (
                      <option key={method} value={method}>{method}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>
        </div>

        {activeChips.length > 0 && (
          <div className="admin-dashboard-chips" aria-label="Active filters">
            {activeChips.map((chip) => (
              <span key={chip.key} className="admin-filter-chip">
                {chip.label}
                <button
                  type="button"
                  aria-label={`Remove ${chip.label} filter`}
                  onClick={() => updateFilter(chip.key, chip.key === 'dateRange' ? 'all' : 'All')}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="admin-dashboard-kpi-grid">
          <StatCard label="Orders" value={metrics.totalOrders} hint="Filtered order volume" />
          <StatCard label="Active Orders" value={metrics.activeOrders} hint="In progress right now" />
          <StatCard label="Completed Orders" value={metrics.completedOrders} hint="Delivered orders" />
          <StatCard
            label="Cancelled Orders"
            value={metrics.cancelledOrders}
            hint="Filtered cancellations"
            status={metrics.cancelledOrders > 0 ? 'danger' : 'neutral'}
          />
          <StatCard label="Platform Revenue" value={formatPeso(totals.platformRevenue)} hint="Commission & platform fees" />
          <StatCard
            label="Pending Payouts"
            value={formatPeso(totals.pendingPayouts)}
            hint="Scheduled settlements"
            status={totals.pendingPayouts > 0 ? 'warning' : 'neutral'}
          />
          <StatCard label="Online Riders" value={metrics.activeRiders} hint={`of ${metrics.totalRiders} riders`} />
          <StatCard
            label="Pending Applications"
            value={pendingApplicationsCount}
            hint={`${metrics.pendingRestaurantApplications} restaurant, ${metrics.pendingRiderApplications} rider`}
            status={pendingApplicationsCount > 0 ? 'warning' : 'neutral'}
            to="/admin/applications"
          />
        </div>

        <div className="admin-dashboard-two-col">
          <section className="admin-record-panel">
            <div className="admin-section-heading">
              <h2>Recent orders</h2>
              <Link to="/admin/orders">View all</Link>
            </div>
            <DataTable
              columns={recentOrderColumns}
              data={recentOrders}
              tableSearch={globalQuery}
              showLocalSearch={false}
              paging={false}
              info={false}
              defaultOrder={[[5, 'desc']]}
              onRowClick={(order) => navigate(`/admin/orders/${order.id}`)}
              emptyTitle="No matching orders"
              emptyDescription="No orders match the current dashboard filters."
            />
          </section>

          <section className="admin-record-panel">
            <div className="admin-section-heading">
              <h2>Needs attention</h2>
            </div>
            <DataTable
              columns={attentionColumns}
              data={needsAttentionRows}
              tableSearch={globalQuery}
              showLocalSearch={false}
              paging={false}
              info={false}
              defaultOrder={[[1, 'desc']]}
              emptyTitle="All clear"
              emptyDescription="No items require attention."
            />
          </section>
        </div>

        <section className="admin-record-panel">
          <div className="admin-section-heading">
            <h2>Order status distribution</h2>
            <div className="admin-view-toggle" role="group" aria-label="Order status distribution view">
              <button
                type="button"
                aria-pressed={distributionView === 'table'}
                onClick={() => setDistributionView('table')}
              >
                Table
              </button>
              <button
                type="button"
                aria-pressed={distributionView === 'chart'}
                onClick={() => setDistributionView('chart')}
              >
                Chart
              </button>
            </div>
          </div>

          {distributionView === 'table' ? (
            <DataTable
              columns={distributionColumns}
              data={statusDistribution}
              tableSearch={globalQuery}
              showLocalSearch={false}
              paging={false}
              info={false}
              defaultOrder={[[1, 'desc']]}
            />
          ) : (
            <div className="admin-dashboard-chart" aria-label="Order status bar chart">
              {statusDistribution.map((row) => (
                <div key={row.status} className="admin-dashboard-chart__row">
                  <span>{row.status}</span>
                  <div className="admin-dashboard-chart__track">
                    <span style={{ width: `${(row.count / maxStatusCount) * 100}%` }} />
                  </div>
                  <strong>{row.count} ({row.percent}%)</strong>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="admin-record-panel">
          <div className="admin-section-heading">
            <h2>Platform overview</h2>
          </div>
          <DataTable
            columns={overviewColumns}
            data={overviewRows}
            tableSearch={globalQuery}
            showLocalSearch={false}
            paging={false}
            info={false}
            ordering={false}
          />
        </section>
      </section>
    </AdminLayout>
  );
}
