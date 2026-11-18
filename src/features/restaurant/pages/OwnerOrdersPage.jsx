import { useState, useEffect, useCallback, useMemo } from 'react';
import OwnerLayout from '../../../layouts/OwnerLayout';
import ownerService from '../../../services/ownerService';
import Button from '../../../components/common/Button';
import Badge from '../../../components/common/Badge';
import Modal from '../../../components/common/Modal';
import { EmptyState, ErrorState, LoadingSpinner } from '../../../components/feedback';
import { useRestaurantAccess } from '../access/useRestaurantAccess';

const TABS = [
  { id: 'all', label: 'All Orders' },
  { id: 'action', label: 'Needs Action' },
  { id: 'pending', label: 'Pending' },
  { id: 'accepted', label: 'Accepted' },
  { id: 'preparing', label: 'Preparing' },
  { id: 'ready', label: 'Ready' },
  { id: 'rejected', label: 'Rejected' },
];

const STATUS_VARIANTS = {
  pending: 'warning',
  accepted: 'info',
  preparing: 'primary',
  ready: 'success',
  rejected: 'error',
  out_for_delivery: 'info',
  completed: 'success',
  cancelled: 'default',
};

const STATUS_LABELS = {
  pending: 'Pending',
  accepted: 'Accepted',
  preparing: 'Preparing',
  ready: 'Ready',
  rejected: 'Rejected',
  out_for_delivery: 'Out for Delivery',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const controlStyle = {
  minHeight: 40,
  padding: '8px 12px',
  border: '1px solid var(--border-primary)',
  borderRadius: 'var(--radius-md)',
  background: 'var(--input-bg)',
  color: 'var(--text-primary)',
  font: 'inherit',
};

function formatPeso(value) {
  return `₱${Number(value || 0).toLocaleString('en-PH')}`;
}

function formatDateTime(value) {
  if (!value) return 'Not specified';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });
}

function orderItems(order) {
  return Array.isArray(order.items) ? order.items : [];
}

function itemQuantity(item) {
  return Number(item.qty || item.quantity || 0);
}

function orderAmount(order) {
  if (Number.isFinite(Number(order.total))) return Number(order.total);
  return Number(order.subtotal || 0) + Number(order.deliveryFee || 0);
}

function matchesActionFilter(order) {
  return String(order.status || '').toLowerCase() === 'pending';
}

export default function OwnerOrdersPage() {
  const access = useRestaurantAccess();
  const { selectedRestaurantId } = access;
  const [orders, setOrders] = useState([]);
  const [pagination, setPagination] = useState({ current_page: 1, last_page: 1, per_page: 15, total: 0 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [fulfillmentFilter, setFulfillmentFilter] = useState('all');
  const [expandedId, setExpandedId] = useState(null);
  const [pendingAction, setPendingAction] = useState(null);
  const [actionReason, setActionReason] = useState('');
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const apiStatus = filter === 'action' ? 'pending' : (filter === 'all' ? '' : filter);
      const result = await ownerService.fetchRestaurantOrders({
        status: apiStatus,
        page,
        perPage: 15,
        restaurantId: selectedRestaurantId,
      });
      setOrders(Array.isArray(result.orders) ? result.orders : []);
      if (result.pagination) {
        setPagination(result.pagination);
      }
    } catch (loadError) {
      setError(loadError.message || 'Unable to load restaurant orders.');
    } finally {
      setLoading(false);
    }
  }, [filter, page, selectedRestaurantId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const filteredOrders = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return orders.filter((order) => {
      const tabMatches = filter === 'all'
        || (filter === 'action' && matchesActionFilter(order))
        || String(order.status || '').toLowerCase() === filter;
      const customerSearch = access.canAccess(['orders.customer.view'])
        ? `${order.customerName || ''} ${order.customerPhone || ''} `
        : '';
      const searchText = `${order.id || ''} ${order.orderReference || ''} ${customerSearch}${order.status || ''}`.toLowerCase();
      const dateMatches = !dateFilter || String(order.createdAt || '').slice(0, 10) === dateFilter;
      const fulfillmentMatches = fulfillmentFilter === 'all' || order.fulfillment === fulfillmentFilter;
      return tabMatches && dateMatches && fulfillmentMatches && (!normalizedQuery || searchText.includes(normalizedQuery));
    });
  }, [access, dateFilter, filter, fulfillmentFilter, orders, query]);

  async function toggleExpand(order) {
    const nextId = expandedId === order.id ? null : order.id;
    setExpandedId(nextId);
    if (nextId !== null) {
      try {
        const detail = await ownerService.fetchRestaurantOrderDetail(order.id, selectedRestaurantId);
        if (detail) {
          setOrders((prev) => prev.map((entry) => (entry.id === detail.id ? detail : entry)));
        }
      } catch {
        // Keep list summary visible if detail refresh fails.
      }
    }
  }

  function showActionDialog(order, action) {
    setPendingAction({ order, ...action });
    setActionReason('');
    setError('');
  }

  async function submitAction() {
    if (!pendingAction || saving) return;
    const { order, type } = pendingAction;
    const permission = type === 'accept' ? 'orders.accept'
      : type === 'reject' ? 'orders.reject'
        : 'orders.preparation.update';
    if (!access.canAccess([permission])) {
      setError('You do not have permission to perform this order action.');
      return;
    }
    if (type === 'reject' && !actionReason.trim()) {
      setError('Enter a rejection reason before submitting.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      let updated = null;
      if (type === 'accept') {
        updated = await ownerService.acceptOrder(order.id, selectedRestaurantId);
      } else if (type === 'reject') {
        updated = await ownerService.rejectOrder(order.id, actionReason.trim(), selectedRestaurantId);
      } else if (type === 'prepare') {
        updated = await ownerService.prepareOrder(order.id, selectedRestaurantId);
      } else if (type === 'ready') {
        updated = await ownerService.readyOrder(order.id, selectedRestaurantId);
      }

      if (updated) {
        setOrders((prev) => prev.map((entry) => (entry.id === updated.id ? updated : entry)));
      }
      setPendingAction(null);
      setActionReason('');
      await reload();
    } catch (actionError) {
      setError(actionError.message || 'Unable to update this order.');
    } finally {
      setSaving(false);
    }
  }

  if (!access.canAccess(['orders.view'])) {
    return <OwnerLayout><ErrorState description="Your restaurant access does not include viewing orders." /></OwnerLayout>;
  }
  if (loading) return <OwnerLayout><LoadingSpinner size="lg" label="Loading orders..." /></OwnerLayout>;
  if (error && orders.length === 0) return <OwnerLayout><ErrorState description={error} onRetry={reload} /></OwnerLayout>;

  const actionRequiredCount = orders.filter(matchesActionFilter).length;
  const needsReason = pendingAction?.type === 'reject';

  return (
    <OwnerLayout>
      <header style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', marginBottom: 'var(--space-4)' }}>
        <div role="status" style={{ background: 'var(--status-warning-bg)', color: 'var(--status-warning-text)', padding: '8px 12px', borderRadius: 'var(--radius-full)', fontWeight: 700, fontSize: 'var(--font-size-xs)' }}>
          {actionRequiredCount} order{actionRequiredCount === 1 ? '' : 's'} need action
        </div>
      </header>

      {error && <div className="form-error" role="alert" style={{ marginBottom: 16 }}>{error}</div>}

      <section aria-label="Order filters" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 210px), 1fr))', gap: 10, marginBottom: 'var(--space-4)' }}>
        <input aria-label="Search order reference or customer" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search reference, status, or customer" style={controlStyle} />
        <input aria-label="Filter by order date" type="date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} style={controlStyle} />
        <select aria-label="Filter by fulfillment method" value={fulfillmentFilter} onChange={(event) => setFulfillmentFilter(event.target.value)} style={controlStyle}>
          <option value="all">All fulfillment methods</option>
          <option value="delivery">Delivery</option>
          <option value="pickup">Pickup</option>
        </select>
      </section>

      <nav aria-label="Order status filters" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 'var(--space-5)' }}>
        {TABS.map((tab) => {
          const count = tab.id === 'action' ? actionRequiredCount
            : tab.id === 'all' ? (pagination.total || orders.length)
              : null;
          return (
            <button key={tab.id} type="button" aria-pressed={filter === tab.id} onClick={() => { setFilter(tab.id); setPage(1); }} style={{
              padding: '7px 12px', borderRadius: 'var(--radius-full)',
              border: filter === tab.id ? '1.5px solid var(--accent)' : '1px solid var(--border-primary)',
              background: filter === tab.id ? 'var(--accent)' : 'var(--surface-primary)',
              color: filter === tab.id ? '#fff' : 'var(--text-secondary)',
              fontSize: 'var(--font-size-xs)', fontWeight: 600, cursor: 'pointer',
            }}>
              {tab.label}{count !== null ? ` (${count})` : ''}
            </button>
          );
        })}
      </nav>

      {filteredOrders.length === 0 ? (
        <EmptyState
          title={orders.length ? 'No orders match these filters' : 'No orders yet'}
          description={orders.length ? 'Try another status, fulfillment method, date, or search term.' : 'Customer orders for this restaurant will appear here.'}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filteredOrders.map((order) => {
            const expanded = expandedId === order.id;
            const itemCount = order.itemCount ?? orderItems(order).reduce((count, item) => count + itemQuantity(item), 0);
            const customerCanView = access.canAccess(['orders.customer.view']);
            const isPickup = order.fulfillment === 'pickup';
            const cancellation = order.cancellationRequest;
            const statusKey = String(order.status || '').toLowerCase();
            return (
              <article key={order.id} style={{ background: 'var(--surface-primary)', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-xl)', overflow: 'hidden' }}>
                <button type="button" aria-expanded={expanded} onClick={() => toggleExpand(order)} style={{
                  width: '100%', display: 'grid', gridTemplateColumns: 'minmax(130px, 1fr) minmax(160px, 2fr) minmax(90px, 1fr) auto',
                  alignItems: 'center', gap: 14, padding: '16px 18px', background: 'transparent', border: 0,
                  color: 'inherit', textAlign: 'left', cursor: 'pointer',
                }}>
                  <span>
                    <strong style={{ fontFamily: 'monospace' }}>{order.orderReference || order.id}</strong>
                    {order.orderReference && <small style={{ display: 'block', color: 'var(--text-muted)' }}>Sub-order #{order.id}</small>}
                    <small style={{ display: 'block', color: 'var(--text-muted)', marginTop: 3 }}>{formatDateTime(order.createdAt)}</small>
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <strong style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis' }}>{customerCanView ? order.customerName || 'Customer' : 'Customer details restricted'}</strong>
                    <small style={{ color: 'var(--text-muted)' }}>{itemCount} item{itemCount === 1 ? '' : 's'} · {isPickup ? 'Pickup' : 'Delivery'}</small>
                  </span>
                  <span><strong>{formatPeso(orderAmount(order))}</strong></span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <Badge variant={STATUS_VARIANTS[statusKey] || 'default'} dot size="sm">{STATUS_LABELS[statusKey] || order.status}</Badge>
                  </span>
                </button>

                {expanded && (
                  <div style={{ borderTop: '1px solid var(--border-secondary)', padding: '18px', background: 'var(--surface-secondary)' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 18, marginBottom: 18 }}>
                      <section>
                        <h2 style={{ fontSize: 'var(--font-size-sm)', margin: '0 0 8px' }}>Customer</h2>
                        {customerCanView ? <>
                          <p style={{ margin: 0 }}>{order.customerName || 'Customer details unavailable'}</p>
                          {order.customerPhone && <p style={{ margin: '4px 0', color: 'var(--text-secondary)' }}>{order.customerPhone}</p>}
                          {order.customerEmail && <p style={{ margin: '4px 0', color: 'var(--text-secondary)' }}>{order.customerEmail}</p>}
                        </> : <p style={{ color: 'var(--text-muted)', margin: 0 }}>Your role does not include customer contact information.</p>}
                        <p style={{ margin: '8px 0 0', fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>Order placed {formatDateTime(order.createdAt)}</p>
                      </section>
                      <section>
                        <h2 style={{ fontSize: 'var(--font-size-sm)', margin: '0 0 8px' }}>{isPickup ? 'Pickup information' : 'Delivery destination'}</h2>
                        <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{isPickup ? order.pickupInformation || 'Customer pickup at restaurant.' : order.deliveryAddress || order.address || 'Address not supplied.'}</p>
                        {order.deliveryInstructions && <p style={{ margin: '6px 0 0', color: 'var(--text-secondary)' }}>Instructions: {order.deliveryInstructions}</p>}
                        <p style={{ margin: '8px 0 0', fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>Destination is read-only in restaurant order management.</p>
                      </section>
                      <section>
                        <h2 style={{ fontSize: 'var(--font-size-sm)', margin: '0 0 8px' }}>Payment and fulfillment</h2>
                        <p style={{ margin: 0 }}>Method: {order.fulfillment || 'Not specified'}</p>
                        <p style={{ margin: '4px 0' }}>Payment: {order.paymentMethod || 'Not specified'} · {order.paymentStatus || 'Status unavailable'}</p>
                        <p style={{ margin: '4px 0' }}>Items: {formatPeso(order.subtotal)} · Delivery: {formatPeso(order.deliveryFee)}</p>
                      </section>
                      {(order.isScheduled || order.scheduledDate || order.scheduledTime) && (
                        <section>
                          <h2 style={{ fontSize: 'var(--font-size-sm)', margin: '0 0 8px' }}>Scheduled order</h2>
                          <p style={{ margin: 0 }}>{order.scheduledDate || 'Date not specified'} {order.scheduledTime || ''}</p>
                          {order.preparationRequirements && <p style={{ margin: '4px 0' }}>{order.preparationRequirements}</p>}
                        </section>
                      )}
                    </div>

                    <section style={{ marginBottom: 18 }}>
                      <h2 style={{ fontSize: 'var(--font-size-sm)', margin: '0 0 8px' }}>Items and customer instructions</h2>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {orderItems(order).map((item, index) => {
                          const quantity = itemQuantity(item);
                          const addOns = Array.isArray(item.addOns) ? item.addOns : [];
                          return (
                            <div key={`${item.id || item.name}-${index}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, borderBottom: '1px solid var(--border-secondary)', paddingBottom: 8 }}>
                              <span>
                                {item.name} × {quantity}
                                {addOns.length > 0 && <small style={{ display: 'block', color: 'var(--text-secondary)' }}>
                                  Add-ons: {addOns.map((entry) => typeof entry === 'string' ? entry : `${entry.name}${Number(entry.price) > 0 ? ` (+${formatPeso(entry.price)})` : ''}`).join(', ')}
                                </small>}
                                {item.specialInstructions && <small style={{ display: 'block', color: 'var(--text-secondary)' }}>Instructions: {item.specialInstructions}</small>}
                              </span>
                              <strong>{formatPeso(Number(item.price || 0) * quantity)}</strong>
                            </div>
                          );
                        })}
                      </div>
                      {(order.notes || order.orderNotes) && <p style={{ fontStyle: 'italic', color: 'var(--text-secondary)' }}>“{order.notes || order.orderNotes}”</p>}
                    </section>

                    {order.rejectionReason && <p role="status" style={{ color: 'var(--status-error-text)' }}>Restaurant rejection reason: {order.rejectionReason}</p>}
                    {order.cancellationReason && <p role="status">Cancellation reason: {order.cancellationReason}</p>}
                    {cancellation && (
                      <div role="status" style={{ border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-md)', padding: 12, marginBottom: 16 }}>
                        <strong>Customer cancellation request · {cancellation.status}</strong>
                        <p style={{ margin: '4px 0' }}>Reason: {cancellation.reason}</p>
                        {cancellation.resolutionReason && <p style={{ margin: '4px 0' }}>Restaurant response: {cancellation.resolutionReason}</p>}
                      </div>
                    )}

                    {statusKey === 'pending' ? (
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {access.canAccess(['orders.accept']) && (
                          <Button variant="primary" size="sm" disabled={saving} onClick={() => showActionDialog(order, { type: 'accept', label: 'Accept order' })}>
                            Accept order
                          </Button>
                        )}
                        {access.canAccess(['orders.reject']) && (
                          <Button variant="danger-outline" size="sm" disabled={saving} onClick={() => showActionDialog(order, { type: 'reject', label: 'Reject order' })}>
                            Reject order
                          </Button>
                        )}
                      </div>
                    ) : statusKey === 'accepted' && access.canAccess(['orders.preparation.update']) ? (
                      <Button variant="primary" size="sm" disabled={saving} onClick={() => showActionDialog(order, { type: 'prepare', label: 'Mark Preparing' })}>
                        Mark Preparing
                      </Button>
                    ) : statusKey === 'preparing' && access.canAccess(['orders.preparation.update']) ? (
                      <Button variant="primary" size="sm" disabled={saving} onClick={() => showActionDialog(order, { type: 'ready', label: 'Mark Ready' })}>
                        Mark Ready
                      </Button>
                    ) : statusKey === 'ready' ? (
                      <p style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-xs)', margin: 0 }}>
                        Order is ready for {isPickup ? 'customer pickup' : 'rider dispatch'}.
                      </p>
                    ) : null}
                  </div>
                )}
              </article>
            );
          })}

          {pagination.last_page > 1 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
              <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>
                Page {pagination.current_page} of {pagination.last_page} ({pagination.total} orders)
              </span>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button variant="outline" size="sm" disabled={pagination.current_page <= 1 || loading} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                  Previous
                </Button>
                <Button variant="outline" size="sm" disabled={pagination.current_page >= pagination.last_page || loading} onClick={() => setPage((p) => p + 1)}>
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      <Modal open={Boolean(pendingAction)} onClose={() => !saving && setPendingAction(null)} title={
        pendingAction?.type === 'reject' ? 'Reject order' : (pendingAction?.label || 'Update order')
      } size="sm" footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, width: '100%' }}>
          <Button variant="ghost" onClick={() => setPendingAction(null)} disabled={saving}>Keep order unchanged</Button>
          <Button variant={needsReason ? 'danger' : 'primary'} onClick={submitAction} loading={saving} disabled={saving}>
            {pendingAction?.type === 'reject' ? 'Submit rejection' : 'Confirm update'}
          </Button>
        </div>
      }>
        <p>Order {pendingAction?.order?.orderReference || `#${pendingAction?.order?.id}`}</p>
        {pendingAction?.type === 'reject' && <p>Rejection completes this restaurant’s rejection only. Other restaurant sub-orders, if any, remain unchanged.</p>}
        {needsReason && (
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12 }}>
            <span>Rejection reason (required)</span>
            <textarea required rows={3} value={actionReason} onChange={(event) => setActionReason(event.target.value)} style={{ ...controlStyle, resize: 'vertical' }} />
          </label>
        )}
      </Modal>
    </OwnerLayout>
  );
}
