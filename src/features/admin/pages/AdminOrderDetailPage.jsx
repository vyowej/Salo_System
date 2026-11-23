import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import AdminLayout from '../../../layouts/AdminLayout';
import Badge from '../../../components/common/Badge';
import Button from '../../../components/common/Button';
import adminApiService from '../../../services/adminApiService';
import { formatDateTimeManila } from '../../../utils/format';
import { formatPeso } from '../utils/format';
import { ConfirmDialog, PageHeader, StateView } from '../components';
import { useAdminPageSearch } from '../contexts/useAdminSearch';
import './AdminPages.css';

function getOrderStatusVariant(status) {
  const norm = String(status || '').toLowerCase();
  if (norm === 'completed' || norm === 'delivered') return 'success';
  if (norm === 'cancelled' || norm === 'rejected' || norm === 'failed') return 'error';
  if (norm === 'pending') return 'warning';
  return 'info';
}

export default function AdminOrderDetailPage() {
  useAdminPageSearch({ disabled: true });
  const { id } = useParams();

  const [order, setOrder] = useState(null);
  const [tracking, setTracking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState('');
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [actionError, setActionError] = useState('');
  const [actionNotice, setActionNotice] = useState('');

  const loadOrder = useCallback(async () => {
    const cleanId = String(id || '').trim();
    if (!/^\d+$/.test(cleanId) || Number(cleanId) <= 0) {
      setOrder(null);
      setTracking(null);
      setNotFound(true);
      setError('');
      setLoading(false);
      return;
    }

    setLoading(true);
    setNotFound(false);
    setError('');

    try {
      const [detailData, trackingData] = await Promise.all([
        adminApiService.getOrderDetail(cleanId),
        adminApiService.getOrderTracking(cleanId).catch(() => null),
      ]);
      if (!detailData) {
        setOrder(null);
        setTracking(null);
        setNotFound(true);
      } else {
        setOrder(detailData);
        setTracking(trackingData);
      }
    } catch (err) {
      setOrder(null);
      setTracking(null);
      if (err?.status === 404) {
        setNotFound(true);
      } else {
        setError(err?.message || 'Unable to load order details.');
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadOrder();
  }, [loadOrder]);

  const handleForceCancel = async (reason) => {
    if (!order) return;
    setCancelling(true);
    setActionError('');
    setActionNotice('');
    try {
      const idempotencyKey = `admin-cancel-${order.order_id}-${Date.now()}`;
      const res = await adminApiService.cancelOrder(order.order_id, { reason, idempotencyKey });
      setCancelOpen(false);
      setActionNotice(res?.refund ? 'Order cancelled and refund initiated.' : 'Order cancelled by administrator.');
      await loadOrder();
    } catch (err) {
      setCancelOpen(false);
      setActionError(err?.message || 'Unable to cancel order.');
    } finally {
      setCancelling(false);
    }
  };

  return (
    <AdminLayout>
      <section className="admin-shell-page">
        <PageHeader
          title={order?.order_reference ? `Order ${order.order_reference}` : `Order #${id || ''}`}
          description="Inspect order line items, payment/refund breakdown, tracking, and admin cancellation."
          actions={(
            <div style={{ display: 'flex', gap: 8 }}>
              <Link to="/admin/orders">
                <Button variant="outline" size="sm">Back to orders</Button>
              </Link>
              <Button variant="secondary" size="sm" onClick={loadOrder} disabled={loading}>
                Refresh
              </Button>
              {order?.can_admin_cancel && (
                <Button variant="danger-outline" size="sm" onClick={() => setCancelOpen(true)}>
                  Force Cancel Order
                </Button>
              )}
            </div>
          )}
        />

        {actionNotice && <div className="admin-inline-notice" role="status" style={{ marginBottom: 12 }}>{actionNotice}</div>}
        {actionError && <div className="admin-inline-error" role="alert" style={{ marginBottom: 12 }}>{actionError}</div>}

        {loading ? (
          <StateView state="loading" title="Loading order details..." />
        ) : notFound ? (
          <StateView
            state="empty"
            title="Order not found"
            description="No matching order record was found for this order ID."
            action={<Link to="/admin/orders"><Button variant="outline" size="sm">Back to orders</Button></Link>}
          />
        ) : error ? (
          <StateView
            state="error"
            title="Unable to load order"
            description={error}
            action={<Button variant="primary" size="sm" onClick={loadOrder}>Retry</Button>}
          />
        ) : (
          <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
            <div className="admin-detail-card" style={{ padding: 'var(--space-4)', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-lg)', background: 'var(--surface-primary)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <strong>{order.order_reference}</strong>
                  <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                    Order ID: {order.order_id} · Type: {order.order_type} · Placed {formatDateTimeManila(order.placed_at)}
                  </p>
                  {order.cancellation_reason && (
                    <p style={{ margin: '4px 0 0', color: 'var(--color-danger, #b91c1c)', fontSize: 'var(--font-size-xs)' }}>
                      Cancelled ({order.cancelled_by}): {order.cancellation_reason}
                    </p>
                  )}
                </div>
                <Badge variant={getOrderStatusVariant(order.order_status)} size="md">
                  {order.order_status}
                </Badge>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 'var(--space-4)' }}>
              <div style={{ padding: 'var(--space-4)', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-lg)', background: 'var(--surface-primary)' }}>
                <h2 style={{ margin: '0 0 8px', fontSize: 'var(--font-size-base)' }}>Customer &amp; Restaurant</h2>
                <p style={{ margin: '0 0 4px', fontSize: 'var(--font-size-sm)' }}>
                  <strong>Customer:</strong> {order.customer?.name || `#${order.customer?.user_id}`}
                </p>
                <p style={{ margin: '0 0 4px', fontSize: 'var(--font-size-sm)' }}>
                  <strong>Restaurant:</strong> {order.restaurant?.restaurant_name || `#${order.restaurant?.restaurant_id}`}
                </p>
                {tracking?.pickup?.address && (
                  <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 'var(--font-size-xs)' }}>
                    {tracking.pickup.address}
                  </p>
                )}
              </div>

              <div style={{ padding: 'var(--space-4)', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-lg)', background: 'var(--surface-primary)' }}>
                <h2 style={{ margin: '0 0 8px', fontSize: 'var(--font-size-base)' }}>Delivery &amp; Rider</h2>
                {order.delivery ? (
                  <>
                    <p style={{ margin: '0 0 4px', fontSize: 'var(--font-size-sm)' }}>
                      <strong>Delivery status:</strong> {order.delivery.delivery_status || '—'}
                    </p>
                    <p style={{ margin: '0 0 4px', fontSize: 'var(--font-size-sm)' }}>
                      <strong>Rider:</strong> {order.delivery.rider_name || 'Unassigned'}
                    </p>
                    {tracking?.rider_location && (
                      <p style={{ margin: '6px 0 0', color: 'var(--text-secondary)', fontSize: 'var(--font-size-xs)' }}>
                        GPS: {tracking.rider_location.latitude.toFixed(5)}, {tracking.rider_location.longitude.toFixed(5)}
                      </p>
                    )}
                  </>
                ) : (
                  <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                    No delivery assignment recorded.
                  </p>
                )}
              </div>

              <div style={{ padding: 'var(--space-4)', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-lg)', background: 'var(--surface-primary)' }}>
                <h2 style={{ margin: '0 0 8px', fontSize: 'var(--font-size-base)' }}>Totals &amp; Payment</h2>
                <p style={{ margin: '0 0 4px', fontSize: 'var(--font-size-sm)' }}>Subtotal: {formatPeso(order.subtotal_amount)}</p>
                <p style={{ margin: '0 0 4px', fontSize: 'var(--font-size-sm)' }}>Delivery fee: {formatPeso(order.delivery_fee)}</p>
                <p style={{ margin: '0 0 6px', fontSize: 'var(--font-size-sm)' }}><strong>Total: {formatPeso(order.total_amount)}</strong></p>
                <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 'var(--font-size-xs)' }}>
                  Method: {String(order.payment_method || '').toUpperCase()} · Status: {order.payment_status}
                </p>
              </div>
            </div>

            <div style={{ padding: 'var(--space-4)', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-lg)', background: 'var(--surface-primary)' }}>
              <h2 style={{ margin: '0 0 10px', fontSize: 'var(--font-size-base)' }}>Order Line Items</h2>
              {(order.items || []).map((item) => (
                <div key={item.order_item_id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border-primary)' }}>
                  <div>
                    <strong>{item.quantity}x {item.item_name}</strong>
                    {Array.isArray(item.add_ons) && item.add_ons.length > 0 && (
                      <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                        {item.add_ons.map((ao) => `${ao.group_name}: ${ao.option_name} (+${formatPeso(ao.additional_price)})`).join(', ')}
                      </div>
                    )}
                  </div>
                  <strong>{formatPeso(item.line_total)}</strong>
                </div>
              ))}
            </div>

            {Array.isArray(order.payments) && order.payments.length > 0 && (
              <div style={{ padding: 'var(--space-4)', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-lg)', background: 'var(--surface-primary)' }}>
                <h2 style={{ margin: '0 0 10px', fontSize: 'var(--font-size-base)' }}>Payment &amp; Refund History</h2>
                {order.payments.map((p) => (
                  <div key={p.payment_id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border-primary)', fontSize: '0.9rem' }}>
                    <div>
                      <strong>{p.payment_reference}</strong> ({p.payment_type}) · {p.payment_status}
                      {p.refund_reason && <div style={{ fontSize: '0.8rem', opacity: 0.8 }}>Reason: {p.refund_reason}</div>}
                    </div>
                    <strong>{formatPeso(p.amount)}</strong>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <ConfirmDialog
          open={cancelOpen}
          title="Force-cancel this order?"
          description="Cancels the order, notifies the customer and restaurant, and triggers a refund via RefundService if paid online (COD receives no refund)."
          confirmLabel={cancelling ? 'Cancelling...' : 'Force Cancel Order'}
          requireReason
          onClose={() => !cancelling && setCancelOpen(false)}
          onConfirm={handleForceCancel}
        />
      </section>
    </AdminLayout>
  );
}
