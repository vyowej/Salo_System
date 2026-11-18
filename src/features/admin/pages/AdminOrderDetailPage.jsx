import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import AdminLayout from '../../../layouts/AdminLayout';
import Badge from '../../../components/common/Badge';
import Button from '../../../components/common/Button';
import adminApiService from '../../../services/adminApiService';
import { formatDateTimeManila } from '../../../utils/format';
import { PageHeader, StateView } from '../components';
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

  const [tracking, setTracking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState('');

  const loadOrder = useCallback(async () => {
    const cleanId = String(id || '').trim();
    if (!/^\d+$/.test(cleanId) || Number(cleanId) <= 0) {
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
      const data = await adminApiService.getOrderTracking(cleanId);
      if (!data) {
        setTracking(null);
        setNotFound(true);
      } else {
        setTracking(data);
      }
    } catch (err) {
      setTracking(null);
      if (err?.status === 404) {
        setNotFound(true);
      } else {
        setError(err?.message || 'Unable to load order tracking details.');
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadOrder();
  }, [loadOrder]);

  return (
    <AdminLayout>
      <section className="admin-shell-page">
        <PageHeader
          title={tracking?.order_reference ? `Order ${tracking.order_reference}` : `Order #${id || ''}`}
          description="Inspect order tracking, pickup/drop-off details, and assigned rider information."
          actions={(
            <div style={{ display: 'flex', gap: 8 }}>
              <Link to="/admin/orders">
                <Button variant="outline" size="sm">Back to orders</Button>
              </Link>
              <Button variant="secondary" size="sm" onClick={loadOrder} disabled={loading}>
                Refresh
              </Button>
            </div>
          )}
        />

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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
                <div>
                  <strong>{tracking.order_reference || `Order #${tracking.order_id}`}</strong>
                  <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                    Order ID: {tracking.order_id} · Type: {tracking.order_type || '—'}
                  </p>
                </div>
                <Badge variant={getOrderStatusVariant(tracking.order_status)} size="md">
                  {tracking.order_status || 'unknown'}
                </Badge>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 'var(--space-4)' }}>
              <div style={{ padding: 'var(--space-4)', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-lg)', background: 'var(--surface-primary)' }}>
                <h2 style={{ margin: '0 0 8px', fontSize: 'var(--font-size-base)' }}>Pickup Restaurant</h2>
                <p style={{ margin: '0 0 4px', fontWeight: 600 }}>{tracking.pickup?.restaurant_name || '—'}</p>
                <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                  {tracking.pickup?.address || 'Address unavailable'}
                </p>
              </div>

              <div style={{ padding: 'var(--space-4)', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-lg)', background: 'var(--surface-primary)' }}>
                <h2 style={{ margin: '0 0 8px', fontSize: 'var(--font-size-base)' }}>Customer Drop-off</h2>
                <p style={{ margin: '0 0 4px', fontWeight: 600 }}>{tracking.dropoff?.recipient_name || '—'}</p>
                <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                  {tracking.dropoff?.address || (tracking.order_type === 'pickup' ? 'Self-pickup at restaurant' : 'Address unavailable')}
                </p>
                {tracking.dropoff?.notes && (
                  <p style={{ margin: '6px 0 0', color: 'var(--text-muted)', fontSize: 'var(--font-size-xs)' }}>
                    Notes: {tracking.dropoff.notes}
                  </p>
                )}
              </div>

              <div style={{ padding: 'var(--space-4)', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-lg)', background: 'var(--surface-primary)' }}>
                <h2 style={{ margin: '0 0 8px', fontSize: 'var(--font-size-base)' }}>Delivery &amp; Rider</h2>
                {tracking.delivery ? (
                  <>
                    <p style={{ margin: '0 0 4px', fontSize: 'var(--font-size-sm)' }}>
                      <strong>Delivery status:</strong> {tracking.delivery.status || '—'}
                    </p>
                    <p style={{ margin: '0 0 4px', fontSize: 'var(--font-size-sm)' }}>
                      <strong>Rider:</strong> {tracking.rider?.name || 'Unassigned'}
                      {tracking.rider?.vehicle_type ? ` (${tracking.rider.vehicle_type}${tracking.rider.plate_number ? ` · ${tracking.rider.plate_number}` : ''})` : ''}
                    </p>
                    {tracking.delivery.assigned_at && (
                      <p style={{ margin: '2px 0', color: 'var(--text-secondary)', fontSize: 'var(--font-size-xs)' }}>
                        Assigned: {formatDateTimeManila(tracking.delivery.assigned_at)}
                      </p>
                    )}
                    {tracking.delivery.picked_up_at && (
                      <p style={{ margin: '2px 0', color: 'var(--text-secondary)', fontSize: 'var(--font-size-xs)' }}>
                        Picked up: {formatDateTimeManila(tracking.delivery.picked_up_at)}
                      </p>
                    )}
                    {tracking.delivery.delivered_at && (
                      <p style={{ margin: '2px 0', color: 'var(--text-secondary)', fontSize: 'var(--font-size-xs)' }}>
                        Delivered: {formatDateTimeManila(tracking.delivery.delivered_at)}
                      </p>
                    )}
                    {tracking.rider_location && (
                      <p style={{ margin: '6px 0 0', color: 'var(--text-secondary)', fontSize: 'var(--font-size-xs)' }}>
                        GPS: {tracking.rider_location.latitude.toFixed(5)}, {tracking.rider_location.longitude.toFixed(5)} · Updated {formatDateTimeManila(tracking.rider_location.recorded_at)}
                        {tracking.rider_location.is_stale ? ' (stale)' : ''}
                      </p>
                    )}
                  </>
                ) : (
                  <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                    No delivery assignment recorded for this order.
                  </p>
                )}
              </div>
            </div>

            <div role="note" style={{ padding: 'var(--space-3) var(--space-4)', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-md)', background: 'var(--surface-secondary)', color: 'var(--text-secondary)', fontSize: 'var(--font-size-xs)' }}>
              Line-item breakdown, payment totals, and admin order actions (cancel/refund/reassignment) are not available yet because the backend does not expose an admin order detail or action endpoint beyond <code>GET /api/admin/orders/{'{id}'}/tracking</code>.
            </div>
          </div>
        )}
      </section>
    </AdminLayout>
  );
}
