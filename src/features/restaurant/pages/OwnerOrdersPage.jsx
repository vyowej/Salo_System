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
  { id: 'Pending', label: 'New' },
  { id: 'Accepted', label: 'Accepted' },
  { id: 'Preparing', label: 'Preparing' },
  { id: 'Ready for Pickup', label: 'Ready for Pickup' },
  { id: 'Ready for Dispatch', label: 'Ready for Dispatch' },
  { id: 'Out for Delivery', label: 'Out for Delivery' },
  { id: 'Completed', label: 'Completed' },
  { id: 'Rejected', label: 'Rejected' },
  { id: 'Cancelled', label: 'Cancelled' },
  { id: 'cancellation', label: 'Cancellation Requests' },
  { id: 'scheduled', label: 'Scheduled' },
  { id: 'priority', label: 'Priority' },
];

const STATUS_VARIANTS = {
  Pending: 'warning',
  'Pending Confirmation': 'warning',
  Accepted: 'info',
  Preparing: 'primary',
  'Ready for Pickup': 'success',
  'Ready for Dispatch': 'success',
  'Out for Delivery': 'info',
  Completed: 'success',
  Rejected: 'error',
  Cancelled: 'default',
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
  return ['Pending', 'Pending Confirmation'].includes(order.status)
    || order.cancellationRequest?.status === 'requested';
}

export default function OwnerOrdersPage() {
  const access = useRestaurantAccess();
  const { selectedRestaurantId } = access;
  const canViewCustomer = access.canAccess(['orders.customer.view']);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('action');
  const [query, setQuery] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [fulfillmentFilter, setFulfillmentFilter] = useState('all');
  const [expandedId, setExpandedId] = useState(null);
  const [pendingAction, setPendingAction] = useState(null);
  const [actionReason, setActionReason] = useState('');
  const [pickupConfirmed, setPickupConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(() => {
    setLoading(true);
    setError('');
    try {
      setOrders(ownerService.getOrders(selectedRestaurantId, {
        canViewCustomer,
      }));
    } catch (loadError) {
      setError(loadError.message || 'Unable to load restaurant orders.');
    } finally {
      setLoading(false);
    }
  }, [canViewCustomer, selectedRestaurantId]);

  useEffect(() => {
    reload();
    window.addEventListener('salo:demoStoreUpdated', reload);
    return () => window.removeEventListener('salo:demoStoreUpdated', reload);
  }, [reload]);

  const filteredOrders = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return orders.filter((order) => {
      const tabMatches = filter === 'all'
        || (filter === 'action' && matchesActionFilter(order))
        || (filter === 'cancellation' && order.cancellationRequest?.status === 'requested')
        || (filter === 'scheduled' && order.isScheduled)
        || (filter === 'priority' && order.priority)
        || order.status === filter;
      const customerSearch = access.canAccess(['orders.customer.view'])
        ? `${order.customerName || ''} ${order.customerPhone || ''} `
        : '';
      const searchText = `${order.id || ''} ${order.orderReference || ''} ${customerSearch}${order.status || ''}`.toLowerCase();
      const dateMatches = !dateFilter || String(order.createdAt || '').slice(0, 10) === dateFilter;
      const fulfillmentMatches = fulfillmentFilter === 'all' || order.fulfillment === fulfillmentFilter;
      return tabMatches && dateMatches && fulfillmentMatches && (!normalizedQuery || searchText.includes(normalizedQuery));
    });
  }, [access, dateFilter, filter, fulfillmentFilter, orders, query]);

  function showActionDialog(order, action) {
    setPendingAction({ order, ...action });
    setActionReason('');
    setPickupConfirmed(false);
  }

  async function submitAction() {
    if (!pendingAction) return;
    const { order, type, status } = pendingAction;
    const permission = type === 'accept' ? 'orders.accept'
      : type === 'reject' || type === 'resolve-cancellation' ? 'orders.reject'
        : type === 'complete-pickup' ? 'orders.pickup.manage'
          : 'orders.preparation.update';
    if (!access.canAccess([permission])) {
      setError('You do not have permission to perform this order action.');
      return;
    }
    if ((type === 'reject' || type === 'resolve-cancellation' && status === 'reject') && !actionReason.trim()) {
      setError('Enter a reason before submitting this action.');
      return;
    }
    if (type === 'complete-pickup' && !pickupConfirmed) {
      setError('Confirm that the customer pickup was handed over before completing this order.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      if (type === 'resolve-cancellation') {
        ownerService.resolveOrderCancellation(order.id, status, selectedRestaurantId, actionReason);
      } else {
        ownerService.updateOrderStatus(order.id, status, selectedRestaurantId, { reason: actionReason });
      }
      setPendingAction(null);
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
  const cancellationRequestCount = orders.filter((order) => order.cancellationRequest?.status === 'requested').length;
  const needsReason = pendingAction?.type === 'reject'
    || pendingAction?.type === 'resolve-cancellation' && pendingAction.status === 'reject';

  return (
    <OwnerLayout>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', marginBottom: 'var(--space-6)' }}>
        <div>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Restaurant Operations · Demo data</span>
          <h1 className="page-title" style={{ fontSize: 'var(--font-size-2xl)', marginTop: 'var(--space-1)' }}>Orders</h1>
          <p className="page-subtitle">Review restaurant sub-orders, update kitchen progress, and handle cancellation requests.</p>
        </div>
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
            : tab.id === 'cancellation' ? cancellationRequestCount
              : tab.id === 'all' ? orders.length
                : null;
          return (
            <button key={tab.id} type="button" aria-pressed={filter === tab.id} onClick={() => setFilter(tab.id)} style={{
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
            return (
              <article key={order.id} style={{ background: 'var(--surface-primary)', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-xl)', overflow: 'hidden' }}>
                <button type="button" aria-expanded={expanded} onClick={() => setExpandedId(expanded ? null : order.id)} style={{
                  width: '100%', display: 'grid', gridTemplateColumns: 'minmax(130px, 1fr) minmax(160px, 2fr) minmax(90px, 1fr) auto',
                  alignItems: 'center', gap: 14, padding: '16px 18px', background: 'transparent', border: 0,
                  color: 'inherit', textAlign: 'left', cursor: 'pointer',
                }}>
                  <span>
                    <strong style={{ fontFamily: 'monospace' }}>{order.orderReference || order.id}</strong>
                    {order.orderReference && <small style={{ display: 'block', color: 'var(--text-muted)' }}>Sub-order {order.id}</small>}
                    <small style={{ display: 'block', color: 'var(--text-muted)', marginTop: 3 }}>{formatDateTime(order.createdAt)}</small>
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <strong style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis' }}>{customerCanView ? order.customerName || 'Customer' : 'Customer details restricted'}</strong>
                    <small style={{ color: 'var(--text-muted)' }}>{itemCount} item{itemCount === 1 ? '' : 's'} · {isPickup ? 'Pickup' : 'Delivery'}</small>
                  </span>
                  <span><strong>{formatPeso(orderAmount(order))}</strong></span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    {order.priority && <Badge variant="warning" size="sm">Priority</Badge>}
                    {order.isScheduled && <Badge variant="info" size="sm">Scheduled</Badge>}
                    {cancellation?.status === 'requested' && <Badge variant="warning" size="sm">Cancellation requested</Badge>}
                    <Badge variant={STATUS_VARIANTS[order.status] || 'default'} dot size="sm">{order.status}</Badge>
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

                    {order.status === 'Pending' || order.status === 'Pending Confirmation' ? (
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {access.canAccess(['orders.accept']) && <Button variant="primary" size="sm" onClick={() => showActionDialog(order, { type: 'accept', status: 'Accepted' })}>Accept order</Button>}
                        {access.canAccess(['orders.reject']) && <Button variant="danger-outline" size="sm" onClick={() => showActionDialog(order, { type: 'reject', status: 'Rejected' })}>Reject order</Button>}
                      </div>
                    ) : order.status === 'Accepted' && access.canAccess(['orders.preparation.update']) ? (
                      <Button variant="primary" size="sm" onClick={() => showActionDialog(order, { type: 'status', status: 'Preparing' })}>Start preparation</Button>
                    ) : order.status === 'Preparing' && isPickup && access.canAccess(['orders.pickup.manage', 'orders.preparation.update'], 'any') ? (
                      <Button variant="primary" size="sm" onClick={() => showActionDialog(order, { type: 'status', status: 'Ready for Pickup' })}>Mark ready for pickup</Button>
                    ) : order.status === 'Preparing' && !isPickup && access.canAccess(['orders.preparation.update']) ? (
                      <Button variant="primary" size="sm" onClick={() => showActionDialog(order, { type: 'status', status: 'Ready for Dispatch' })}>Mark ready for dispatch</Button>
                    ) : order.status === 'Ready for Pickup' && isPickup && access.canAccess(['orders.pickup.manage']) ? (
                      <Button variant="primary" size="sm" onClick={() => showActionDialog(order, { type: 'complete-pickup', status: 'Completed' })}>Confirm pickup and complete</Button>
                    ) : null}

                    {cancellation?.status === 'requested' && access.canAccess(['orders.reject']) && (
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                        <Button variant="danger" size="sm" onClick={() => showActionDialog(order, { type: 'resolve-cancellation', status: 'approve' })}>Approve cancellation</Button>
                        <Button variant="outline" size="sm" onClick={() => showActionDialog(order, { type: 'resolve-cancellation', status: 'reject' })}>Decline cancellation</Button>
                      </div>
                    )}
                    {order.status === 'Out for Delivery' && <p style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-xs)' }}>Delivery completion is handled by the delivery workflow, not restaurant order controls.</p>}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      <Modal open={Boolean(pendingAction)} onClose={() => !saving && setPendingAction(null)} title={
        pendingAction?.type === 'reject' ? 'Reject order'
          : pendingAction?.type === 'resolve-cancellation' ? `${pendingAction.status === 'approve' ? 'Approve' : 'Decline'} cancellation request`
            : pendingAction?.type === 'complete-pickup' ? 'Confirm customer pickup'
              : `Update order to ${pendingAction?.status || ''}`
      } size="sm" footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, width: '100%' }}>
          <Button variant="ghost" onClick={() => setPendingAction(null)} disabled={saving}>Keep order unchanged</Button>
          <Button variant={needsReason ? 'danger' : 'primary'} onClick={submitAction} loading={saving}>
            {pendingAction?.type === 'reject' ? 'Submit rejection'
              : pendingAction?.type === 'resolve-cancellation' ? (pendingAction.status === 'approve' ? 'Approve cancellation' : 'Decline request')
                : pendingAction?.type === 'complete-pickup' ? 'Confirm handover'
                  : 'Confirm update'}
          </Button>
        </div>
      }>
        <p>Order {pendingAction?.order?.orderReference || pendingAction?.order?.id}</p>
        {pendingAction?.type === 'reject' && <p>Rejection completes this restaurant’s rejection only. Other restaurant sub-orders, if any, remain unchanged.</p>}
        {pendingAction?.type === 'resolve-cancellation' && pendingAction.status === 'approve' && <p>This will cancel only this restaurant’s sub-order. Other restaurants’ sub-orders remain unchanged.</p>}
        {pendingAction?.type === 'complete-pickup' && (
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, margin: '14px 0' }}>
            <input type="checkbox" checked={pickupConfirmed} onChange={(event) => setPickupConfirmed(event.target.checked)} />
            <span>I confirm the pickup handover was completed.</span>
          </label>
        )}
        {needsReason && (
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12 }}>
            <span>{pendingAction?.type === 'reject' ? 'Rejection reason' : 'Reason for declining the cancellation request'}</span>
            <textarea required rows={3} value={actionReason} onChange={(event) => setActionReason(event.target.value)} style={{ ...controlStyle, resize: 'vertical' }} />
          </label>
        )}
      </Modal>
    </OwnerLayout>
  );
}
