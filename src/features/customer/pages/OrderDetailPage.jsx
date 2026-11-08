import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import CustomerLayout from '../../../layouts/CustomerLayout';
import { useCart } from '../../../hooks/useCart';
import customerService from '../../../services/customerService';
import Button from '../../../components/common/Button';
import Badge from '../../../components/common/Badge';
import Modal from '../../../components/common/Modal';

const DELIVERY_STEPS = ['Pending', 'Accepted', 'Preparing', 'Ready for Dispatch', 'Out for Delivery', 'Completed'];
const PICKUP_STEPS = ['Pending', 'Accepted', 'Preparing', 'Ready for Pickup', 'Completed'];

export default function OrderDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { addItem, setRestaurantFulfillment, setRestaurantAddress } = useCart();

  const [order, setOrder] = useState(null);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('Change of mind');

  useEffect(() => {
    const refreshOrder = () => {
      const orders = customerService.getOrders();
      const found = orders.find((o) => o.id === id);
      setOrder(found ? { ...found, overallStatus: found.overallStatus || 'Pending Confirmation' } : null);
    };
    refreshOrder();
    window.addEventListener('salo:demoStoreUpdated', refreshOrder);
    return () => window.removeEventListener('salo:demoStoreUpdated', refreshOrder);
  }, [id]);

  if (!order) {
    return (
      <CustomerLayout>
        <div style={{ textAlign: 'center', padding: 'var(--space-16) 0' }}>
          <p style={{ color: 'var(--text-muted)' }}>Order not found.</p>
          <Link to="/customer/orders" style={{ textDecoration: 'none', marginTop: 12, display: 'inline-block' }}>
            <Button variant="primary">Return to Order History</Button>
          </Link>
        </div>
      </CustomerLayout>
    );
  }

  const handleConfirmCancel = () => {
    try {
      const updated = customerService.cancelOrder(order.id, cancelReason);
      setOrder(updated);
      setCancelModalOpen(false);
    } catch (cancelError) {
      setOrder((previous) => ({ ...previous, cancelError: cancelError.message || 'Unable to request cancellation.' }));
    }
  };

  const handleReorder = () => {
    const defaultAddress = customerService.getDefaultAddress();

    (order.subOrders || []).forEach((subOrder) => {
      const restaurantId = subOrder.restaurantId;
      const fulfillment = subOrder.fulfillment || 'delivery';

      setRestaurantFulfillment(restaurantId, fulfillment);
      if (fulfillment === 'delivery' && defaultAddress) {
        setRestaurantAddress(restaurantId, defaultAddress);
      }

      (subOrder.items || []).forEach((item) => {
        addItem({
          id: `${restaurantId}-${item.name}`,
          name: item.name,
          price: Number(item.price || 0),
          quantity: Number(item.qty || item.quantity || 1),
          restaurantId,
          restaurantName: subOrder.restaurantName,
          image: 'R',
          deliveryFee: subOrder.deliveryFee || 49,
          selectedAddOns: Array.isArray(item.addOns)
            ? item.addOns.map((addOn) => (typeof addOn === 'string' ? { name: addOn, price: 0 } : addOn))
            : [],
        });
      });
    });

    navigate('/customer/cart');
  };

  const isCancellable = (order.subOrders || []).some((sub) => (
    !['Completed', 'Cancelled', 'Rejected'].includes(sub.status)
    && sub.cancellationRequest?.status !== 'requested'
  ));

  return (
    <CustomerLayout>
      {/* ── Cancel Order Confirmation Modal ─────────────── */}
      <Modal
        open={cancelModalOpen}
        onClose={() => setCancelModalOpen(false)}
        title="Cancel Order"
        size="sm"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
            <Button variant="ghost" size="sm" onClick={() => setCancelModalOpen(false)}>
              Keep Order
            </Button>
            <Button variant="danger" size="sm" onClick={handleConfirmCancel}>
              Submit Request
            </Button>
          </div>
        }
      >
        <div>
          <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', marginBottom: 'var(--space-4)', lineHeight: 1.5 }}>
            Request cancellation for eligible restaurant sub-orders in Order <strong>#{order.id}</strong>. Each restaurant reviews its own request; this does not immediately cancel the order.
          </p>

          <label style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, display: 'block', marginBottom: 4 }}>
            Reason for cancellation
          </label>
          <select
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            className="select"
            style={{ width: '100%', height: 38 }}
          >
            <option value="Change of mind">Change of mind</option>
            <option value="Ordered by mistake">Ordered by mistake</option>
            <option value="Need to change delivery address">Need to change delivery address</option>
            <option value="Long waiting time">Long waiting time</option>
          </select>
        </div>
      </Modal>
      {order.cancelError && <p className="form-error" role="alert">{order.cancelError}</p>}

      {/* ── Page Header ─────────────────────────────────── */}
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <Link to="/customer/orders" style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 8 }}>
          ← Back to Orders
        </Link>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
              <h1 className="page-title" style={{ fontSize: 'var(--font-size-2xl)' }}>
                Order #{order.id}
              </h1>
              <Badge variant={['Completed'].includes(order.overallStatus) ? 'success' : ['Cancelled', 'Rejected'].includes(order.overallStatus) ? 'error' : order.overallStatus === 'Cancellation Requested' ? 'warning' : 'primary'} dot>
                {order.overallStatus}
              </Badge>
            </div>
            <p className="page-subtitle">
              Placed {order.createdAt} · {order.paymentMethod} · {order.paymentStatus}
            </p>
          </div>

          <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            <Button variant="secondary" size="sm" onClick={handleReorder}>
              Reorder
            </Button>
            {isCancellable && (
              <Button variant="danger-outline" size="sm" onClick={() => setCancelModalOpen(true)}>
                Request Cancellation
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* ── Sub-Orders Detailed Tracking ────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)', marginBottom: 'var(--space-10)' }}>
        {order.subOrders?.map((sub, idx) => {
          return (
            <div
              key={sub.id || idx}
              style={{
                background: 'var(--surface-primary)',
                border: '1px solid var(--border-primary)',
                borderRadius: 'var(--radius-xl)',
                padding: 'var(--space-6)',
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-4)', paddingBottom: 'var(--space-3)', borderBottom: '1px solid var(--border-secondary)' }}>
                <div>
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                    RESTAURANT SUB-ORDER #{sub.id}
                  </span>
                  <h2 style={{ fontSize: 'var(--font-size-md)', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {sub.restaurantName}
                  </h2>
                </div>
                <Badge variant={sub.status === 'Completed' ? 'success' : ['Cancelled', 'Rejected'].includes(sub.status) ? 'error' : sub.cancellationRequest?.status === 'requested' ? 'warning' : 'primary'} dot size="sm">
                  {sub.status}
                </Badge>
              </div>

              {sub.cancellationRequest && (
                <div role="status" style={{ background: 'var(--surface-secondary)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
                  <strong>Cancellation request: {sub.cancellationRequest.status}</strong>
                  {sub.cancellationRequest.reason && <p style={{ margin: '4px 0', fontSize: 'var(--font-size-xs)' }}>Customer reason: {sub.cancellationRequest.reason}</p>}
                  {sub.cancellationRequest.resolutionReason && <p style={{ margin: '4px 0', fontSize: 'var(--font-size-xs)' }}>Restaurant response: {sub.cancellationRequest.resolutionReason}</p>}
                </div>
              )}

              {/* Status Stepper Progression */}
              {!['Cancelled', 'Rejected'].includes(sub.status) && (
                <div style={{ margin: 'var(--space-5) 0 var(--space-6)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', position: 'relative' }}>
                    {(sub.fulfillment === 'pickup' ? PICKUP_STEPS : DELIVERY_STEPS).map((step, sIdx, steps) => {
                      const statusStep = sub.status === 'Pending Confirmation' ? 'Pending' : sub.status;
                      const currentStepIdx = steps.indexOf(statusStep);
                      const isDone = currentStepIdx >= 0 && sIdx <= currentStepIdx;
                      return (
                        <div
                          key={step}
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            textAlign: 'center',
                            flex: 1,
                            position: 'relative',
                          }}
                        >
                          <div style={{
                            width: 24,
                            height: 24,
                            borderRadius: '50%',
                            background: isDone ? 'var(--accent)' : 'var(--bg-tertiary)',
                            color: isDone ? '#fff' : 'var(--text-muted)',
                            fontSize: 11,
                            fontWeight: 700,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            marginBottom: 6,
                            zIndex: 1,
                          }}>
                            {isDone ? '✓' : sIdx + 1}
                          </div>
                          <span style={{
                            fontSize: 10,
                            fontWeight: isDone ? 600 : 400,
                            color: isDone ? 'var(--text-primary)' : 'var(--text-muted)',
                          }}>
                            {step}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Delivery Details & Rider Card */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                gap: 'var(--space-4)',
                background: 'var(--surface-secondary)',
                borderRadius: 'var(--radius-lg)',
                padding: 'var(--space-4)',
                marginBottom: 'var(--space-4)',
                fontSize: 'var(--font-size-xs)',
              }}>
                <div>
                  <p style={{ fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: 10, marginBottom: 2 }}>
                    Destination Address
                  </p>
                  <p style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                    {sub.deliveryAddress}
                  </p>
                </div>

                {sub.rider && (
                  <div>
                    <p style={{ fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: 10, marginBottom: 2 }}>
                      Delivery Rider & Vehicle
                    </p>
                    <p style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                      🛵 {sub.rider.name}
                    </p>
                    <p style={{ color: 'var(--text-secondary)', fontSize: 11 }}>
                      {sub.rider.vehicle} · {sub.rider.eta}
                    </p>
                  </div>
                )}
              </div>

              {/* Items List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', fontSize: 'var(--font-size-xs)' }}>
                {sub.items?.map((item, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                    <span>                    {item.qty}x {item.name} {item.addOns?.length > 0 && `(${item.addOns.map((addOn) => typeof addOn === 'string' ? addOn : `${addOn.name}${Number(addOn.price) > 0 ? ` (+₱${addOn.price})` : ''}`).join(', ')})`}</span>
                    <span style={{ fontWeight: 600 }}>₱{(item.price * item.qty).toLocaleString()}</span>
                  </div>
                ))}

                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8, marginTop: 4, borderTop: '1px solid var(--border-secondary)', fontWeight: 700 }}>
                  <span>Subtotal + Delivery:</span>
                  <span>₱{(sub.subtotal + sub.deliveryFee).toLocaleString()}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </CustomerLayout>
  );
}
