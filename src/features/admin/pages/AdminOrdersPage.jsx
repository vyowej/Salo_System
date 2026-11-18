import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AdminLayout from '../../../layouts/AdminLayout';
import Button from '../../../components/common/Button';
import adminApiService from '../../../services/adminApiService';
import { DataTable, PageHeader, StateView, StatusBadge } from '../components';
import { useAdminPageSearch } from '../contexts/useAdminSearch';
import { formatDateTime, formatPeso } from '../utils/format';
import {
  ORDER_STATUS_OPTIONS,
  ORDER_TYPE_OPTIONS,
  PAYMENT_STATUS_OPTIONS,
  buildAdminOrdersQuery,
  mapAdminOrder,
  validateDateRange,
} from '../utils/adminOrdersHelpers';
import './AdminPages.css';

function formatOrderTypeLabel(type) {
  if (type === 'delivery') return 'Delivery';
  if (type === 'pickup') return 'Pickup';
  if (type === 'dine_in') return 'Dine-in';
  return type || '—';
}

export default function AdminOrdersPage() {
  const { query: globalQuery } = useAdminPageSearch({
    scopeLabel: 'Orders',
    placeholder: 'Search orders by reference, customer, or restaurant',
  });

  const [orders, setOrders] = useState([]);
  const [meta, setMeta] = useState({ current_page: 1, last_page: 1, per_page: 15, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [search, setSearch] = useState('');
  const [orderStatus, setOrderStatus] = useState('all');
  const [orderType, setOrderType] = useState('all');
  const [paymentStatus, setPaymentStatus] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [direction, setDirection] = useState('desc');
  const [perPage, setPerPage] = useState(15);
  const [page, setPage] = useState(1);

  const effectiveSearch = (globalQuery || search).trim();
  const dateRangeError = validateDateRange(dateFrom, dateTo);
  const hasActiveFilters = Boolean(
    effectiveSearch ||
      orderStatus !== 'all' ||
      orderType !== 'all' ||
      paymentStatus !== 'all' ||
      dateFrom ||
      dateTo,
  );

  const loadOrders = useCallback(async () => {
    if (dateRangeError) {
      setError(dateRangeError);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const params = buildAdminOrdersQuery({
        search: effectiveSearch,
        orderStatus,
        orderType,
        paymentStatus,
        dateFrom,
        dateTo,
        page,
        perPage,
        direction,
      });

      const data = await adminApiService.getOrders(params);
      const mapped = (data?.items || []).map(mapAdminOrder);
      setOrders(mapped);
      setMeta(
        data?.meta || {
          current_page: page,
          last_page: 1,
          per_page: perPage,
          total: mapped.length,
        },
      );
    } catch (err) {
      setError(err?.message || 'Unable to load platform orders.');
    } finally {
      setLoading(false);
    }
  }, [
    dateFrom,
    dateRangeError,
    dateTo,
    direction,
    effectiveSearch,
    orderStatus,
    orderType,
    page,
    paymentStatus,
    perPage,
  ]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const clearFilters = () => {
    setSearch('');
    setOrderStatus('all');
    setOrderType('all');
    setPaymentStatus('all');
    setDateFrom('');
    setDateTo('');
    setDirection('desc');
    setPage(1);
  };

  const columns = [
    {
      key: 'order_reference',
      label: 'Order #',
      render: (order) => (
        <Link to={`/admin/orders/${order.order_id}`} style={{ fontWeight: 700 }}>
          {order.order_reference}
        </Link>
      ),
    },
    {
      key: 'customer_name',
      label: 'Customer',
      render: (order) => order.customer_name,
    },
    {
      key: 'restaurant_name',
      label: 'Restaurant',
      render: (order) => order.restaurant_name,
    },
    {
      key: 'order_type',
      label: 'Type',
      render: (order) => (
        <div>
          <span>{formatOrderTypeLabel(order.order_type)}</span>
          {order.delivery_status && (
            <div className="admin-muted" style={{ fontSize: 'var(--font-size-xs)' }}>
              Delivery: {order.delivery_status}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'items_count',
      label: 'Items',
      render: (order) => `${order.items_count} (${order.total_quantity} qty)`,
    },
    {
      key: 'total_amount',
      label: 'Amount',
      render: (order) => (
        <div>
          <strong>{formatPeso(order.total_amount)}</strong>
          <div className="admin-muted" style={{ fontSize: 'var(--font-size-xs)' }}>
            Sub: {formatPeso(order.subtotal_amount)} · Fee: {formatPeso(order.delivery_fee)}
          </div>
        </div>
      ),
    },
    {
      key: 'payment_status',
      label: 'Payment',
      render: (order) => (
        <div>
          <StatusBadge status={order.payment_status} />
          <div className="admin-muted" style={{ fontSize: 'var(--font-size-xs)', marginTop: 2 }}>
            {String(order.payment_method || '—').toUpperCase()}
            {order.paid_at ? ` · ${formatDateTime(order.paid_at)}` : ''}
          </div>
        </div>
      ),
    },
    {
      key: 'order_status',
      label: 'Status',
      render: (order) => <StatusBadge status={order.order_status} />,
    },
    {
      key: 'placed_at',
      label: 'Placed',
      render: (order) => (order.placed_at ? formatDateTime(order.placed_at) : '—'),
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (order) => (
        <Link to={`/admin/orders/${order.order_id}`} className="admin-action-button">
          View
        </Link>
      ),
    },
  ];

  return (
    <AdminLayout>
      <section className="admin-shell-page">
        <PageHeader
          title="Orders"
          description="Monitor platform-wide customer orders, payment status, and delivery progress."
          actions={(
            <Button variant="secondary" size="sm" onClick={loadOrders} disabled={loading}>
              {loading && orders.length > 0 ? 'Refreshing...' : 'Refresh'}
            </Button>
          )}
        />

        <div className="admin-filter-bar" role="search" aria-label="Filter orders">
          <label className="admin-filter-control">
            Search
            <input
              type="search"
              aria-label="Search orders"
              placeholder="Reference, customer, restaurant"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          </label>

          <label className="admin-filter-control">
            Order status
            <select
              aria-label="Filter by order status"
              value={orderStatus}
              onChange={(event) => {
                setOrderStatus(event.target.value);
                setPage(1);
              }}
            >
              {ORDER_STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </label>

          <label className="admin-filter-control">
            Order type
            <select
              aria-label="Filter by order type"
              value={orderType}
              onChange={(event) => {
                setOrderType(event.target.value);
                setPage(1);
              }}
            >
              {ORDER_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </label>

          <label className="admin-filter-control">
            Payment status
            <select
              aria-label="Filter by payment status"
              value={paymentStatus}
              onChange={(event) => {
                setPaymentStatus(event.target.value);
                setPage(1);
              }}
            >
              {PAYMENT_STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </label>

          <label className="admin-filter-control">
            From date
            <input
              type="date"
              aria-label="Filter from date"
              value={dateFrom}
              onChange={(event) => {
                setDateFrom(event.target.value);
                setPage(1);
              }}
            />
          </label>

          <label className="admin-filter-control">
            To date
            <input
              type="date"
              aria-label="Filter to date"
              value={dateTo}
              onChange={(event) => {
                setDateTo(event.target.value);
                setPage(1);
              }}
            />
          </label>

          <label className="admin-filter-control">
            Sort
            <select
              aria-label="Sort direction"
              value={direction}
              onChange={(event) => {
                setDirection(event.target.value);
                setPage(1);
              }}
            >
              <option value="desc">Newest first</option>
              <option value="asc">Oldest first</option>
            </select>
          </label>

          <label className="admin-filter-control">
            Per page
            <select
              aria-label="Orders per page"
              value={perPage}
              onChange={(event) => {
                setPerPage(Number(event.target.value));
                setPage(1);
              }}
            >
              <option value={15}>15</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
          </label>

          {hasActiveFilters && (
            <button
              type="button"
              className="admin-action-button"
              onClick={clearFilters}
              style={{ alignSelf: 'flex-end' }}
            >
              Clear filters
            </button>
          )}
        </div>

        {error && orders.length > 0 && (
          <div role="alert" className="admin-error-banner" style={{ marginBottom: 12 }}>
            {error}
          </div>
        )}

        {loading && orders.length === 0 ? (
          <StateView state="loading" title="Loading orders..." description="Fetching platform-wide order records." />
        ) : error && orders.length === 0 ? (
          <StateView
            state="error"
            title="Unable to load orders"
            description={error}
            action={<Button variant="primary" size="sm" onClick={loadOrders}>Retry</Button>}
          />
        ) : orders.length === 0 ? (
          <StateView
            state="empty"
            title={hasActiveFilters ? 'No matching orders found' : 'No orders yet'}
            description={
              hasActiveFilters
                ? 'Try adjusting your search or filter criteria.'
                : 'Customer orders will appear here once placed.'
            }
            action={
              hasActiveFilters ? (
                <Button variant="outline" size="sm" onClick={clearFilters}>Clear filters</Button>
              ) : null
            }
          />
        ) : (
          <>
            <DataTable
              columns={columns}
              rows={orders}
              emptyTitle="No orders found"
              emptyDescription="No orders match your current filters."
            />

            {meta.total > 0 && (
              <div className="admin-filter-bar" style={{ justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                <span className="admin-muted">
                  Page {meta.current_page} of {meta.last_page} · {meta.total} total order{meta.total === 1 ? '' : 's'}
                </span>
                <div className="admin-action-row">
                  <button
                    className="admin-action-button"
                    type="button"
                    disabled={loading || meta.current_page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </button>
                  <button
                    className="admin-action-button"
                    type="button"
                    disabled={loading || meta.current_page >= meta.last_page}
                    onClick={() => setPage((p) => Math.min(meta.last_page || 1, p + 1))}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </section>
    </AdminLayout>
  );
}
