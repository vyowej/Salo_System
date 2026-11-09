import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import AdminLayout from '../../../layouts/AdminLayout';
import { DataTable, FilterBar, PageHeader, StatusBadge } from '../components';
import { ADMIN_MOCK_DATA, getOrderBreakdown, getOrdersWithFinancials } from '../mocks';
import { formatDateTime, formatPeso } from '../utils/format';

const INITIAL_FILTERS = { status: '', paymentMethod: '', restaurantId: '', riderId: '', city: '', from: '', to: '' };

export default function AdminOrdersPage() {
  const [orders] = useState(getOrdersWithFinancials);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const restaurants = ADMIN_MOCK_DATA.restaurants.filter((restaurant) => (
    orders.some((order) => order.restaurantIds.includes(restaurant.id))
  ));
  const riders = ADMIN_MOCK_DATA.riders.filter((rider) => orders.some((order) => order.riderId === rider.id));
  const paymentMethods = [...new Set(orders.map((order) => order.paymentMethod))];
  const statuses = [...new Set(orders.map((order) => order.status))];

  const filteredOrders = useMemo(() => orders.filter((order) => {
    const date = order.createdAt.slice(0, 10);
    return order.id.toLowerCase().includes(search.trim().toLowerCase())
      && (!filters.status || order.status === filters.status)
      && (!filters.paymentMethod || order.paymentMethod === filters.paymentMethod)
      && (!filters.restaurantId || order.restaurantIds.includes(filters.restaurantId))
      && (!filters.riderId || order.riderId === filters.riderId)
      && (!filters.city || order.city === filters.city)
      && (!filters.from || date >= filters.from)
      && (!filters.to || date <= filters.to);
  }), [filters, orders, search]);

  const columns = [
    { key: 'id', label: 'Reference', render: (order) => <Link to={`/admin/orders/${order.id}`}>{order.id}</Link> },
    { key: 'customerName', label: 'Customer' },
    { key: 'restaurants', label: 'Restaurant', render: (order) => order.restaurants.join(', ') },
    { key: 'riderName', label: 'Rider' },
    { key: 'total', label: 'Total', render: (order) => formatPeso(getOrderBreakdown(order.id).orderTotal) },
    { key: 'payment', label: 'Payment', render: (order) => <>{order.paymentMethod}<br /><StatusBadge status={order.paymentStatus} /></> },
    { key: 'status', label: 'Order status', render: (order) => <StatusBadge status={order.status} /> },
    { key: 'createdAt', label: 'Date', render: (order) => formatDateTime(order.createdAt) },
  ];

  function updateFilter(key, value) {
    setFilters((previous) => ({ ...previous, [key]: value }));
  }

  return (
    <AdminLayout>
      <section className="admin-shell-page">
        <PageHeader
          title="Platform Orders"
          description="Review order payments, recorded fee snapshots, fulfillment history, and escalated cases."
          actions={<Link className="admin-action-button" to="/admin/orders/disputes">Disputes and escalations</Link>}
        />
        <FilterBar search={search} onSearchChange={setSearch} searchLabel="Search order reference">
          <label className="admin-filter-control">Status<select value={filters.status} onChange={(event) => updateFilter('status', event.target.value)}><option value="">All statuses</option>{statuses.map((status) => <option key={status}>{status}</option>)}</select></label>
          <label className="admin-filter-control">Payment method<select value={filters.paymentMethod} onChange={(event) => updateFilter('paymentMethod', event.target.value)}><option value="">All methods</option>{paymentMethods.map((method) => <option key={method}>{method}</option>)}</select></label>
          <label className="admin-filter-control">Restaurant<select value={filters.restaurantId} onChange={(event) => updateFilter('restaurantId', event.target.value)}><option value="">All restaurants</option>{restaurants.map((restaurant) => <option key={restaurant.id} value={restaurant.id}>{restaurant.name}</option>)}</select></label>
          <label className="admin-filter-control">Rider<select value={filters.riderId} onChange={(event) => updateFilter('riderId', event.target.value)}><option value="">All riders</option>{riders.map((rider) => <option key={rider.id} value={rider.id}>{rider.name}</option>)}</select></label>
          <label className="admin-filter-control">City<select value={filters.city} onChange={(event) => updateFilter('city', event.target.value)}><option value="">All cities</option>{[...new Set(orders.map((order) => order.city))].map((city) => <option key={city}>{city}</option>)}</select></label>
          <label className="admin-filter-control">From<input type="date" value={filters.from} onChange={(event) => updateFilter('from', event.target.value)} /></label>
          <label className="admin-filter-control">To<input type="date" value={filters.to} onChange={(event) => updateFilter('to', event.target.value)} /></label>
        </FilterBar>
        <DataTable
          columns={columns}
          rows={filteredOrders}
          emptyTitle="No matching orders"
          emptyDescription="Try changing the search term or filters."
        />
      </section>
    </AdminLayout>
  );
}
