import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import RiderLayout from '../../../layouts/RiderLayout';
import riderService from '../../../services/riderService';
import Button from '../../../components/common/Button';
import Badge from '../../../components/common/Badge';
import Modal from '../../../components/common/Modal';

const STEPS = [
  'Heading to Restaurant',
  'At Restaurant',
  'In Transit',
  'Arrived',
  'Completed',
];

export default function RiderActiveDeliveryPage() {
  const navigate = useNavigate();
  const [delivery, setDelivery] = useState(riderService.getActiveDelivery());
  const [completeModalOpen, setCompleteModalOpen] = useState(false);

  if (!delivery) {
    return (
      <RiderLayout>
        <div style={{
          textAlign: 'center',
          padding: 'var(--space-12) var(--space-4)',
          background: 'var(--surface-primary)',
          border: '1px solid var(--border-primary)',
          borderRadius: 'var(--radius-xl)',
          maxWidth: 600,
          margin: 'var(--space-12) auto',
        }}>
          <span style={{ fontSize: 48 }}>🛵</span>
          <h2 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800, margin: 'var(--space-3) 0 var(--space-2)' }}>
            No Active Trip in Progress
          </h2>
          <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', marginBottom: 'var(--space-6)' }}>
            You do not have any pending orders assigned to you right now. Visit the available jobs board to view nearby requests.
          </p>
          <Link to="/rider/jobs" style={{ textDecoration: 'none' }}>
            <Button variant="primary" size="md">
              Find Available Orders →
            </Button>
          </Link>
        </div>
      </RiderLayout>
    );
  }

  const currentStepIndex = STEPS.indexOf(delivery.status);

  function advanceStep() {
    if (currentStepIndex < STEPS.length - 2) {
      const nextStatus = STEPS[currentStepIndex + 1];
      const updated = riderService.updateDeliveryStatus(nextStatus);
      setDelivery({ ...updated });
    } else {
      // Final step -> open complete delivery dialog
      setCompleteModalOpen(true);
    }
  }

  function handleFinalizeDelivery() {
    riderService.completeActiveDelivery();
    setCompleteModalOpen(false);
    navigate('/rider/history');
  }

  return (
    <RiderLayout>
      {/* ── Page Header ────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-6)', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
        <div>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: 'var(--salo-green)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            Live Turn-by-Turn Delivery
          </span>
          <h1 className="page-title" style={{ fontSize: 'var(--font-size-2xl)', marginTop: 'var(--space-1)' }}>
            Trip #{delivery.id} · Order {delivery.orderId}
          </h1>
          <p className="page-subtitle">
            Follow the live steps below to fulfill this order safely and accurately
          </p>
        </div>

        <Badge variant="primary" size="lg" dot>
          {delivery.status}
        </Badge>
      </div>

      {/* ── Visual Stepper ──────────────────────────────── */}
      <div style={{
        background: 'var(--surface-primary)',
        border: '1px solid var(--border-primary)',
        borderRadius: 'var(--radius-xl)',
        padding: 'var(--space-5)',
        marginBottom: 'var(--space-6)',
        boxShadow: 'var(--shadow-sm)',
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 'var(--space-2)',
          textAlign: 'center',
          position: 'relative',
        }}>
          {STEPS.slice(0, 4).map((step, idx) => {
            const isCompleted = idx < currentStepIndex;
            const isCurrent = idx === currentStepIndex;

            return (
              <div key={step} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  background: isCompleted ? 'var(--salo-green)' : isCurrent ? 'var(--accent)' : 'var(--bg-secondary)',
                  color: (isCompleted || isCurrent) ? '#fff' : 'var(--text-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: 13,
                  marginBottom: 6,
                  boxShadow: isCurrent ? '0 0 0 4px var(--accent-subtle)' : 'none',
                  transition: 'all var(--transition-fast)',
                }}>
                  {isCompleted ? '✓' : idx + 1}
                </div>
                <span style={{
                  fontSize: 11,
                  fontWeight: isCurrent ? 700 : 500,
                  color: isCurrent ? 'var(--accent)' : isCompleted ? 'var(--salo-green)' : 'var(--text-muted)',
                  lineHeight: 1.3,
                }}>
                  {step}
                </span>
              </div>
            );
          })}
        </div>

        {/* Big Action Button for current step */}
        <div style={{ marginTop: 'var(--space-6)', paddingTop: 'var(--space-4)', borderTop: '1px solid var(--border-secondary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
          <div>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Current Directive:</span>
            <p style={{ fontSize: 'var(--font-size-md)', fontWeight: 700, margin: '2px 0 0', color: 'var(--text-primary)' }}>
              {delivery.status === 'Heading to Restaurant' && 'Ride to kitchen location and prepare to pick up package.'}
              {delivery.status === 'At Restaurant' && 'Inspect food container seal and verify all items with staff.'}
              {delivery.status === 'In Transit' && 'Head directly to customer drop-off address.'}
              {delivery.status === 'Arrived' && 'Notify customer, collect cash payment if COD, and hand over bag.'}
            </p>
          </div>

          <Button
            variant="primary"
            size="lg"
            onClick={advanceStep}
          >
            {delivery.status === 'Heading to Restaurant' && 'Confirm Arrival at Restaurant →'}
            {delivery.status === 'At Restaurant' && 'Verify Food & Start Delivery Ride →'}
            {delivery.status === 'In Transit' && 'Arrived at Customer Drop-off →'}
            {delivery.status === 'Arrived' && 'Complete Delivery & Confirm Handover ✓'}
          </Button>
        </div>
      </div>

      {/* ── Route & Stops Details ───────────────────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
        gap: 'var(--space-6)',
        marginBottom: 'var(--space-6)',
      }}>
        {/* Stop 1: Restaurant Pickup */}
        <div style={{
          background: 'var(--surface-primary)',
          border: '1px solid var(--border-primary)',
          borderRadius: 'var(--radius-xl)',
          padding: 'var(--space-5)',
          boxShadow: 'var(--shadow-sm)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Pickup Location (Stop 1)
            </span>
            <a
              href={`tel:${delivery.restaurantPhone}`}
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--accent)',
                textDecoration: 'none',
                background: 'var(--accent-subtle)',
                padding: '4px 10px',
                borderRadius: 'var(--radius-full)',
              }}
            >
              📞 Call Kitchen
            </a>
          </div>

          <h3 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>
            {delivery.restaurantName}
          </h3>
          <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
            {delivery.restaurantAddress}
          </p>

          <div style={{ marginTop: 'var(--space-4)', paddingTop: 'var(--space-3)', borderTop: '1px solid var(--border-secondary)' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Items to Pick Up ({delivery.items.length})
            </span>
            <ul style={{ paddingLeft: 18, margin: '6px 0 0', fontSize: 'var(--font-size-xs)', color: 'var(--text-primary)', lineHeight: 1.6 }}>
              {delivery.items.map((item, i) => (
                <li key={i}>
                  <strong>{item.qty}x</strong> {item.name}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Stop 2: Customer Destination */}
        <div style={{
          background: 'var(--surface-primary)',
          border: '1px solid var(--border-primary)',
          borderRadius: 'var(--radius-xl)',
          padding: 'var(--space-5)',
          boxShadow: 'var(--shadow-sm)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--salo-green)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Drop-off Destination (Stop 2)
            </span>
            <a
              href={`tel:${delivery.customerPhone}`}
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--salo-green)',
                textDecoration: 'none',
                background: 'var(--status-success-bg, #E8F5E9)',
                padding: '4px 10px',
                borderRadius: 'var(--radius-full)',
              }}
            >
              📞 Call Customer
            </a>
          </div>

          <h3 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>
            {delivery.customerName}
          </h3>
          <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
            {delivery.deliveryAddress}
          </p>

          <div style={{
            marginTop: 'var(--space-4)',
            padding: 'var(--space-3)',
            background: 'var(--bg-secondary)',
            borderRadius: 'var(--radius-md)',
            fontSize: 'var(--font-size-xs)',
          }}>
            <span style={{ fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginBottom: 2 }}>
              Delivery Landmark / Instructions:
            </span>
            <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              {delivery.landmarks}
            </p>
          </div>
        </div>
      </div>

      {/* ── Financial Breakdown Strip ───────────────────── */}
      <div style={{
        background: 'var(--surface-primary)',
        border: '1px solid var(--border-primary)',
        borderRadius: 'var(--radius-xl)',
        padding: 'var(--space-5)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 'var(--space-4)',
        boxShadow: 'var(--shadow-sm)',
      }}>
        <div>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Payment Method</span>
          <p style={{ fontSize: 'var(--font-size-md)', fontWeight: 700, color: 'var(--text-primary)', margin: '2px 0 0' }}>
            {delivery.paymentMethod}
          </p>
          {delivery.cashToCollect > 0 ? (
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--accent)', fontWeight: 700 }}>
              ⚠ Must collect ₱{delivery.cashToCollect} from customer before handoff
            </span>
          ) : (
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--salo-green)', fontWeight: 600 }}>
              ✓ Fully paid online (No cash needed)
            </span>
          )}
        </div>

        <div style={{ textAlign: 'right' }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Your Trip Compensation</span>
          <p style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800, color: 'var(--salo-green)', margin: '2px 0 0' }}>
            ₱{delivery.payout + delivery.tip}
          </p>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            Base Fare ₱{delivery.payout} + In-App Tip ₱{delivery.tip}
          </span>
        </div>
      </div>

      {/* ── Finalize Modal ───────────────────────────────── */}
      <Modal
        open={completeModalOpen}
        onClose={() => setCompleteModalOpen(false)}
        title="Complete Delivery Handover"
        size="md"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', width: '100%' }}>
            <Button variant="ghost" onClick={() => setCompleteModalOpen(false)}>
              Back to Trip
            </Button>
            <Button variant="primary" onClick={handleFinalizeDelivery}>
              Confirm Complete & Receive ₱{delivery.payout + delivery.tip}
            </Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' }}>
            Confirm that the order has been handed over safely to <strong>{delivery.customerName}</strong>.
          </p>

          {delivery.cashToCollect > 0 && (
            <div style={{
              padding: 'var(--space-4)',
              background: 'var(--accent-subtle)',
              border: '1.5px solid var(--accent)',
              borderRadius: 'var(--radius-lg)',
            }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase' }}>
                Cash Collection Verification
              </span>
              <p style={{ fontSize: 'var(--font-size-lg)', fontWeight: 800, color: 'var(--accent)', margin: '4px 0 2px' }}>
                ₱{delivery.cashToCollect.toLocaleString('en-PH')} Collected in Cash
              </p>
              <p style={{ fontSize: 11, color: 'var(--text-secondary)', margin: 0 }}>
                This amount will be added to your Cash-on-Hand balance to be remitted to SALO.
              </p>
            </div>
          )}

          <div style={{
            padding: 'var(--space-3)',
            background: 'var(--bg-secondary)',
            borderRadius: 'var(--radius-md)',
            fontSize: 'var(--font-size-xs)',
            color: 'var(--text-secondary)',
          }}>
            <span>Trip Fee credited to your earnings wallet: </span>
            <strong style={{ color: 'var(--salo-green)' }}>₱{delivery.payout + delivery.tip}</strong>
          </div>
        </div>
      </Modal>
    </RiderLayout>
  );
}
