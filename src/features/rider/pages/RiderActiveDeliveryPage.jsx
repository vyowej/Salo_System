import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Button from '../../../components/common/Button';
import { Card, CardBody } from '../../../components/common/Card';
import { StateView as GlobalStateView } from '../../../components/feedback';
import PageHeader from '../components/PageHeader';
import riderService from '../../../services/riderService';
import { formatDateTimeManila, formatPeso } from '../../../utils/format';

export default function RiderActiveDeliveryPage() {
  const [delivery, setDelivery] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [codConfirmed, setCodConfirmed] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadCurrent = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const current = await riderService.getCurrentDelivery();
      setDelivery(current);
      setCodConfirmed(false);
    } catch (err) {
      setError(err?.message || 'Unable to load current delivery.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCurrent();
  }, [loadCurrent]);

  const handlePickedUp = async () => {
    if (!delivery || submitting) return;
    setSubmitting(true);
    setError('');
    setNotice('');
    try {
      const updated = await riderService.markPickedUp(delivery.order_id);
      setDelivery(updated);
      setNotice('Order marked as picked up (Out for delivery).');
      window.dispatchEvent(new Event('salo:riderUpdated'));
    } catch (err) {
      setError(err?.message || 'Unable to mark delivery as picked up.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelivered = async () => {
    if (!delivery || submitting) return;
    if (delivery.requires_cod_collection && !codConfirmed) {
      setError(`Confirm exact cash collection of ${formatPeso(delivery.amount_to_collect)} before marking delivered.`);
      return;
    }

    setSubmitting(true);
    setError('');
    setNotice('');
    try {
      const collected = delivery.requires_cod_collection ? delivery.amount_to_collect : null;
      const updated = await riderService.markDelivered(delivery.order_id, collected);
      setDelivery(updated);
      setNotice('Delivery completed! You can now accept another delivery.');
      window.dispatchEvent(new Event('salo:riderUpdated'));
    } catch (err) {
      setError(err?.message || 'Unable to mark delivery as delivered.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="rider-page-shell">
        <PageHeader title="Active delivery" subtitle="Step-by-step pickup and drop-off workflow." eyebrow="Dispatch" />
        <GlobalStateView state="loading" title="Loading current delivery..." />
      </div>
    );
  }

  if (!delivery) {
    return (
      <div className="rider-page-shell">
        <PageHeader title="Active delivery" subtitle="Step-by-step pickup and drop-off workflow." eyebrow="Dispatch" />
        {error && <p role="alert" style={{ color: 'var(--status-error-text)' }}>{error}</p>}
        <GlobalStateView
          state="empty"
          title="No active delivery"
          description="Accept a ready order from Available deliveries to start."
          action={
            <Link to="/rider/deliveries">
              <Button variant="primary" size="sm">View available deliveries</Button>
            </Link>
          }
        />
      </div>
    );
  }

  const isAccepted = delivery.delivery_status === 'accepted';
  const isPickedUp = delivery.delivery_status === 'picked_up';
  const isDelivered = delivery.delivery_status === 'delivered';

  return (
    <div className="rider-page-shell">
      <PageHeader title="Active delivery" subtitle="Step-by-step pickup and drop-off workflow." eyebrow="Dispatch" />

      {error && (
        <div role="alert" style={{ marginBottom: 'var(--space-4)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', background: 'var(--status-error-bg)', color: 'var(--status-error-text)' }}>
          {error}
        </div>
      )}
      {notice && (
        <div role="status" style={{ marginBottom: 'var(--space-4)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', background: 'var(--status-success-bg, #e8f5e9)', color: 'var(--status-success-text, #1b5e20)' }}>
          {notice}
        </div>
      )}

      <Card>
        <CardBody style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <strong style={{ fontSize: 'var(--font-size-lg)' }}>{delivery.restaurant_name}</strong>
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                {delivery.order_reference || `#${delivery.order_id}`} · Delivery: {delivery.delivery_status} · Order: {delivery.order_status}
              </div>
            </div>
            <strong>{formatPeso(delivery.order_total)}</strong>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-4)' }}>
            <div>
              <h3 style={{ margin: '0 0 6px', fontSize: 'var(--font-size-sm)' }}>Pickup</h3>
              <p style={{ margin: 0, fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>{delivery.pickup_address_text}</p>
              {delivery.accepted_at && <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--text-muted)' }}>Accepted: {formatDateTimeManila(delivery.accepted_at)}</p>}
              {delivery.picked_up_at && <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--text-muted)' }}>Picked up: {formatDateTimeManila(delivery.picked_up_at)}</p>}
            </div>

            <div>
              <h3 style={{ margin: '0 0 6px', fontSize: 'var(--font-size-sm)' }}>Drop-off & Customer</h3>
              <p style={{ margin: 0, fontSize: 'var(--font-size-xs)', fontWeight: 600 }}>{delivery.customer_name}</p>
              {delivery.customer_phone && <p style={{ margin: '2px 0', fontSize: 'var(--font-size-xs)' }}>{delivery.customer_phone}</p>}
              <p style={{ margin: '2px 0', fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>{delivery.dropoff_address_text}</p>
              {delivery.delivery_notes && <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--text-muted)' }}>Notes: {delivery.delivery_notes}</p>}
              {delivery.delivered_at && <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--text-muted)' }}>Delivered: {formatDateTimeManila(delivery.delivered_at)}</p>}
            </div>
          </div>

          <div>
            <h3 style={{ margin: '0 0 6px', fontSize: 'var(--font-size-sm)' }}>Items</h3>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
              {(delivery.items || []).map((item) => (
                <li key={item.order_item_id}>
                  {item.quantity}× {item.item_name} — {formatPeso(item.line_total)}
                </li>
              ))}
            </ul>
          </div>

          {isPickedUp && delivery.requires_cod_collection && (
            <div style={{ padding: 'var(--space-3) var(--space-4)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-primary)', background: 'var(--surface-secondary)' }}>
              <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 700, marginBottom: 6 }}>
                Cash on Delivery to collect: {formatPeso(delivery.amount_to_collect)}
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--font-size-xs)', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={codConfirmed}
                  disabled={submitting}
                  onChange={(e) => setCodConfirmed(e.target.checked)}
                />
                <span>I confirm I collected the exact amount of {formatPeso(delivery.amount_to_collect)} in cash.</span>
              </label>
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {isAccepted && (
              <Button variant="primary" disabled={submitting} loading={submitting} onClick={handlePickedUp}>
                Picked Up
              </Button>
            )}
            {isPickedUp && (
              <Button
                variant="primary"
                disabled={submitting || (delivery.requires_cod_collection && !codConfirmed)}
                loading={submitting}
                onClick={handleDelivered}
              >
                Delivered
              </Button>
            )}
            {isDelivered && (
              <Link to="/rider/deliveries">
                <Button variant="primary">Find next delivery</Button>
              </Link>
            )}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
