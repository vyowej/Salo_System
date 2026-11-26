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
  const [recipientName, setRecipientName] = useState('');
  const [podNotes, setPodNotes] = useState('');
  const [proofPhoto, setProofPhoto] = useState(null);
  const [showFailPanel, setShowFailPanel] = useState(false);
  const [failureReason, setFailureReason] = useState('');
  const [failNotes, setFailNotes] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadCurrent = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const current = await riderService.getCurrentDelivery();
      setDelivery(current);
      setCodConfirmed(false);
      setRecipientName(current?.customer_name || '');
      setPodNotes('');
      setProofPhoto(null);
      setShowFailPanel(false);
      setFailureReason('');
      setFailNotes('');
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
      const updated = await riderService.markDelivered(delivery.order_id, collected, {
        recipientName: recipientName.trim(),
        deliveryNotes: podNotes.trim(),
        proofPhoto,
      });
      setDelivery(updated);
      setNotice('Delivery completed! You can now accept another delivery.');
      window.dispatchEvent(new Event('salo:riderUpdated'));
    } catch (err) {
      setError(err?.message || 'Unable to mark delivery as delivered.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReportFailed = async (e) => {
    e.preventDefault();
    if (!delivery || submitting) return;
    if (failureReason.trim().length < 5) {
      setError('Provide a failure reason (at least 5 characters).');
      return;
    }

    setSubmitting(true);
    setError('');
    setNotice('');
    try {
      const updated = await riderService.markFailed(
        delivery.order_id,
        failureReason.trim(),
        failNotes.trim(),
      );
      setDelivery(updated);
      setShowFailPanel(false);
      setNotice('Delivery marked as failed and escalated to operations.');
      window.dispatchEvent(new Event('salo:riderUpdated'));
    } catch (err) {
      setError(err?.message || 'Unable to report failed delivery.');
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
  const isFailed = delivery.delivery_status === 'failed';

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

          {isPickedUp && (
            <div style={{ padding: 'var(--space-3) var(--space-4)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-primary)', background: 'var(--surface-secondary)', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 700 }}>
                Proof of Delivery (POD)
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 'var(--font-size-xs)' }}>
                  <span>Recipient name</span>
                  <input
                    type="text"
                    value={recipientName}
                    disabled={submitting}
                    onChange={(e) => setRecipientName(e.target.value)}
                    placeholder="Who received the order?"
                    style={{ padding: '8px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-primary)' }}
                  />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 'var(--font-size-xs)' }}>
                  <span>POD photo (optional, JPG/PNG/WebP)</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    disabled={submitting}
                    onChange={(e) => setProofPhoto(e.target.files?.[0] || null)}
                  />
                </label>
              </div>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 'var(--font-size-xs)' }}>
                <span>Drop-off notes (optional)</span>
                <textarea
                  rows={2}
                  value={podNotes}
                  disabled={submitting}
                  onChange={(e) => setPodNotes(e.target.value)}
                  placeholder="Left at reception, handed directly, etc."
                  style={{ padding: '8px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-primary)' }}
                />
              </label>
            </div>
          )}

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

          {showFailPanel && (isAccepted || isPickedUp) && (
            <form onSubmit={handleReportFailed} style={{ padding: 'var(--space-3) var(--space-4)', borderRadius: 'var(--radius-md)', border: '1px solid var(--status-error-bg)', background: 'var(--surface-secondary)', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 700 }}>Report Failed Delivery</div>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 'var(--font-size-xs)' }}>
                <span>Failure reason *</span>
                <input
                  type="text"
                  required
                  minLength={5}
                  maxLength={255}
                  value={failureReason}
                  disabled={submitting}
                  onChange={(e) => setFailureReason(e.target.value)}
                  placeholder="e.g. Customer unreachable after 3 calls, invalid address"
                  style={{ padding: '8px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-primary)' }}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 'var(--font-size-xs)' }}>
                <span>Additional notes (optional)</span>
                <textarea
                  rows={2}
                  value={failNotes}
                  disabled={submitting}
                  onChange={(e) => setFailNotes(e.target.value)}
                  style={{ padding: '8px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-primary)' }}
                />
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button type="submit" variant="danger" size="sm" disabled={submitting} loading={submitting}>
                  Confirm Failed Delivery
                </Button>
                <Button type="button" variant="ghost" size="sm" disabled={submitting} onClick={() => setShowFailPanel(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          )}

          {isDelivered && (delivery.recipient_name || delivery.has_proof_photo || delivery.proof_delivery_notes) && (
            <div style={{ padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', background: 'var(--surface-secondary)', fontSize: 'var(--font-size-xs)' }}>
              <strong>Proof of Delivery recorded:</strong>{' '}
              {delivery.recipient_name ? `Received by ${delivery.recipient_name}` : 'Recorded'}
              {delivery.has_proof_photo ? ' · Photo attached' : ''}
              {delivery.proof_delivery_notes ? ` · ${delivery.proof_delivery_notes}` : ''}
            </div>
          )}

          {isFailed && (
            <div style={{ padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', background: 'var(--status-error-bg)', color: 'var(--status-error-text)', fontSize: 'var(--font-size-xs)' }}>
              <strong>Failed delivery:</strong> {delivery.failure_reason || 'Reported failed'}
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
            {(isAccepted || isPickedUp) && !showFailPanel && (
              <Button variant="danger" disabled={submitting} onClick={() => setShowFailPanel(true)}>
                Report Failed
              </Button>
            )}
            {(isDelivered || isFailed) && (
              <>
                {isDelivered && (
                  <Link to={`/rider/deliveries/${delivery.order_id}/receipt`}>
                    <Button variant="secondary">View receipt</Button>
                  </Link>
                )}
                <Link to="/rider/deliveries">
                  <Button variant="primary">Find next delivery</Button>
                </Link>
              </>
            )}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
