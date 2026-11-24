import { useState, useEffect, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import CustomerLayout from '../../../layouts/CustomerLayout';
import { useCart } from '../../../hooks/useCart';
import customerService from '../../../services/customerService';
import Button from '../../../components/common/Button';
import Badge from '../../../components/common/Badge';
import Modal from '../../../components/common/Modal';
import { SharedMap } from '../../../components/location';
import { useDeliverySimulation } from '../../../hooks/useDeliverySimulation';
import { buildRiderMapState } from '../../rider/utils/riderMapData';
import OrderReviewSection from '../components/OrderReviewSection';
import { formatDateTimeManila, formatShortOrderId, formatPeso } from '../../../utils/format';
import {
  buildOrderTimelineSteps,
  canCustomerCancelOrder,
  formatOrderStatusText,
  formatPaymentStatusLabel,
  formatRefundStatusLabel,
  normalizeOrderStatusKey,
} from '../utils/orderTimeline';
import './CustomerRecords.css';

function isUpcomingOrder(order) {
  const norm = String(order?.overallStatus || '').trim().toLowerCase();
  return !['delivered', 'completed', 'picked up', 'cancelled', 'rejected', 'failed'].includes(norm);
}

export default function OrderDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { addItem, setRestaurantFulfillment, setRestaurantAddress } = useCart();

  const [allOrders, setAllOrders] = useState([]);
  const [selectedSubIdx, setSelectedSubIdx] = useState(0);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelError, setCancelError] = useState('');
  const [shareCopied, setShareCopied] = useState(false);
  const [lookupQuery, setLookupQuery] = useState('');

  const [order, setOrder] = useState(null);
  const [orderLoading, setOrderLoading] = useState(true);
  const [orderError, setOrderError] = useState('');
  const [tracking, setTracking] = useState(null);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [trackingError, setTrackingError] = useState('');
  const [routeSummary, setRouteSummary] = useState(null);
  const simulation = useDeliverySimulation({
    path: routeSummary?.path,
    distanceMeters: routeSummary?.distanceMeters,
  });

  const customerMapState = useMemo(() => {
    if (!tracking) return null;
    const simulatedPos =
      simulation.isSimulating || simulation.hasCompletedSimulation
        ? simulation.simulatedPosition
        : null;
    return buildRiderMapState({
      delivery: {
        restaurant_name: tracking.pickup?.restaurant_name,
        pickup_address_text: tracking.pickup?.address,
        pickup_latitude: tracking.pickup?.latitude,
        pickup_longitude: tracking.pickup?.longitude,
        customer_name: tracking.dropoff?.recipient_name || 'Your Location',
        dropoff_address_text: tracking.dropoff?.address,
        dropoff_latitude: tracking.dropoff?.latitude,
        dropoff_longitude: tracking.dropoff?.longitude,
        delivery_status: tracking.delivery?.status,
      },
      riderLocation: tracking.rider_location,
      simulatedPosition: simulatedPos,
    });
  }, [
    tracking,
    simulation.isSimulating,
    simulation.hasCompletedSimulation,
    simulation.simulatedPosition,
  ]);
  const [paymentBusy, setPaymentBusy] = useState(false);
  const [paymentError, setPaymentError] = useState('');

  const mapBackendOrder = (raw) => ({
    id: String(raw.order_id),
    orderReference: raw.order_reference,
    overallStatus: raw.order_status || 'pending',
    fulfillment: raw.fulfillment || 'delivery',
    rejectionReason: raw.rejection_reason ?? null,
    cancellationReason: raw.cancellation_reason ?? null,
    cancelledBy: raw.cancelled_by ?? null,
    createdAt: raw.placed_at ?? null,
    acceptedAt: raw.accepted_at ?? null,
    deliveredAt: raw.delivered_at ?? null,
    completedAt: raw.completed_at ?? null,
    cancelledAt: raw.cancelled_at ?? null,
    rejectedAt: raw.rejected_at ?? null,
    riderFirstName: raw.rider?.first_name ?? null,
    grandTotal: Number(raw.total_amount ?? 0),
    totalAmount: Number(raw.total_amount ?? 0),
    paymentId: raw.payment?.payment_id ?? null,
    paymentMethod: raw.payment?.method || 'cod',
    providerName: raw.payment?.provider_name ?? null,
    paymentChannel: raw.payment?.payment_channel ?? null,
    paymentStatus: raw.payment?.status || 'pending',
    checkoutUrl: raw.payment?.checkout_url ?? null,
    paymentExpiresAt: raw.payment?.expires_at ?? null,
    paidAt: raw.payment?.paid_at ?? null,
    refund: raw.payment?.refund ?? null,
    subOrders: [
      {
        restaurantId: String(raw.restaurant_id),
        restaurantName: raw.restaurant_name,
        restaurantLogoUrl: raw.restaurant_logo_url,
        fulfillment: raw.fulfillment,
        status: raw.order_status || 'pending',
        rejectionReason: raw.rejection_reason ?? null,
        cancellationReason: raw.cancellation_reason ?? null,
        subtotal: Number(raw.subtotal_amount ?? 0),
        deliveryFee: Number(raw.delivery_fee ?? 0),
        total: Number(raw.total_amount ?? 0),
        deliveryAddress: raw.delivery_address
          ? {
              recipientName: raw.delivery_address.recipient_name,
              phone: raw.delivery_address.phone,
              addressText: raw.delivery_address.address_text,
              notes: raw.delivery_address.notes,
            }
          : null,
        items: (raw.items || []).map((it) => ({
          id: String(it.menu_item_id || it.order_item_id),
          menuItemId: it.menu_item_id != null ? String(it.menu_item_id) : null,
          name: it.item_name,
          qty: Number(it.quantity),
          price: Number(it.unit_price),
          lineTotal: Number(it.line_total),
          addOns: Array.isArray(it.add_ons)
            ? it.add_ons.map((ao) => ({
                id: ao.id ?? ao.add_on_option_id ?? null,
                name: ao.name ?? ao.option_name ?? '',
                price: Number(ao.price ?? ao.additional_price ?? 0),
                groupName: ao.group_name ?? null,
              }))
            : [],
        })),
      },
    ],
  });

  useEffect(() => {
    let active = true;
    setOrderLoading(true);
    setOrderError('');
    setTracking(null);
    setTrackingError('');
    setTrackingLoading(false);

    (async () => {
      try {
        let targetId = id;
        if (id === 'track') {
          const listRes = await customerService.fetchOrders({ per_page: 10 });
          const fetchedOrders = listRes?.orders || [];
          if (active) {
            setAllOrders(fetchedOrders.map((o) => ({
              id: String(o.order_id),
              overallStatus: o.order_status,
              subOrders: [{ restaurantName: o.restaurant_name }],
            })));
          }
          const upcoming = fetchedOrders.find((o) =>
            !['delivered', 'completed', 'picked up', 'cancelled', 'rejected', 'failed'].includes(String(o.order_status || '').toLowerCase())
          );
          targetId = upcoming ? String(upcoming.order_id) : null;
          if (!targetId) {
            if (active) setOrder(null);
            return;
          }
        }

        const rawOrder = await customerService.fetchOrderDetail(targetId);
        if (!active) return;

        const mappedOrder = rawOrder ? mapBackendOrder(rawOrder) : null;
        setOrder(mappedOrder);

        const orderFulfillment = String(mappedOrder?.fulfillment || 'delivery').toLowerCase();
        const orderStatusKey = normalizeOrderStatusKey(mappedOrder?.overallStatus);
        const isTrackableDelivery =
          Boolean(mappedOrder) &&
          orderFulfillment === 'delivery' &&
          !['pending', 'cancelled', 'rejected', 'failed'].includes(orderStatusKey);

        if (isTrackableDelivery) {
          setTrackingLoading(true);
          try {
            const trackingData = await customerService.getCustomerOrderTracking(targetId);
            if (active) {
              setTracking(trackingData ?? null);
            }
          } catch (trackErr) {
            if (active) {
              setTracking(null);
              setTrackingError(trackErr?.message || 'Unable to load live tracking details.');
            }
          } finally {
            if (active) {
              setTrackingLoading(false);
            }
          }
        }
      } catch (err) {
        if (active) {
          setOrder(null);
          setOrderError(err?.status === 404 ? 'Order not found.' : (err?.message || 'Unable to load order details.'));
        }
      } finally {
        if (active) {
          setOrderLoading(false);
          setTrackingLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [id]);

  const upcomingOrders = useMemo(
    () => (order && isUpcomingOrder(order) ? [order] : []),
    [order],
  );

  const defaultAddress = useMemo(() => customerService.getDefaultAddress(), []);

  // Ensure selectedSubIdx stays in bounds when switching orders
  const subOrders = order?.subOrders || [];
  const safeSubIdx = subOrders[selectedSubIdx] ? selectedSubIdx : 0;
  const activeSub = subOrders[safeSubIdx] || subOrders[0] || null;

  // Standby / Direct Track View when no upcoming orders exist
  if (!order && id === 'track') {
    const filteredLookupOrders = lookupQuery.trim()
      ? allOrders.filter(
          (o) =>
            String(o.id || '').toLowerCase().includes(lookupQuery.trim().toLowerCase()) ||
            (o.subOrders || []).some((s) =>
              String(s.restaurantName || '').toLowerCase().includes(lookupQuery.trim().toLowerCase()),
            ),
        )
      : allOrders.slice(0, 3);

    return (
      <CustomerLayout>
        <div className="customer-track-panel" style={{ maxWidth: 680, margin: '24px auto' }}>
          <div className="customer-track-header">
            <div className="customer-track-header__left">
              <Link to="/customer" className="customer-track-back-btn" aria-label="Back to home" title="Back to home">
                ←
              </Link>
              <div>
                <span className="customer-track-eyebrow">Customer Order Tracking</span>
                <h1 className="customer-track-title">Track My Order</h1>
              </div>
            </div>
            <Badge variant="default" size="sm" dot>
              Standby
            </Badge>
          </div>

          <div className="customer-track-status-banner is-standby">
            <strong>No active orders right now</strong>
            <span>Place an order or look up a previous order below.</span>
          </div>

          <div className="customer-track-section">
            <span className="customer-track-section__label">Look Up an Order</span>
            <input
              type="search"
              className="customer-track-lookup-input"
              placeholder="Enter Order ID or restaurant..."
              value={lookupQuery}
              onChange={(e) => setLookupQuery(e.target.value)}
            />
            {filteredLookupOrders.length > 0 ? (
              <div className="customer-track-lookup-list">
                {filteredLookupOrders.map((pastOrder) => (
                  <button
                    key={pastOrder.id}
                    type="button"
                    className="customer-track-lookup-item"
                    onClick={() => navigate(`/customer/orders/${pastOrder.id}`)}
                  >
                    <div>
                      <strong>{formatShortOrderId(pastOrder.id)}</strong>
                      <span>{(pastOrder.subOrders || []).map((s) => s.restaurantName).join(', ')}</span>
                    </div>
                    <Badge variant="default" size="sm">
                      {pastOrder.overallStatus}
                    </Badge>
                  </button>
                ))}
              </div>
            ) : (
              <p className="customer-track-empty-note">
                No previous orders found. Start an order from any partner kitchen!
              </p>
            )}
          </div>

          <div className="customer-track-actions">
            <Button variant="primary" fullWidth onClick={() => navigate('/customer')}>
              Explore Kitchens & Order Now
            </Button>
            <Button variant="secondary" fullWidth onClick={() => navigate('/customer/orders')}>
              View Full Order History
            </Button>
          </div>
        </div>
      </CustomerLayout>
    );
  }

  if (orderLoading) {
    return (
      <CustomerLayout>
        <div style={{ textAlign: 'center', padding: 'var(--space-16) 0', color: 'var(--text-secondary)' }}>
          Loading order details...
        </div>
      </CustomerLayout>
    );
  }

  if (!order) {
    return (
      <CustomerLayout>
        <div style={{ textAlign: 'center', padding: 'var(--space-16) 0' }}>
          {orderError && <p role="alert" style={{ color: 'var(--salo-error)', marginBottom: 12 }}>{orderError}</p>}
          <p style={{ color: 'var(--text-muted)' }}>Order not found.</p>
          <Link to="/customer/orders" style={{ textDecoration: 'none', marginTop: 12, display: 'inline-block' }}>
            <Button variant="primary">Return to Order History</Button>
          </Link>
        </div>
      </CustomerLayout>
    );
  }

  const handleConfirmCancel = async () => {
    if (isCancelling || !order) return;
    setIsCancelling(true);
    setCancelError('');
    try {
      const updated = await customerService.cancelOrder(order.id, cancelReason);
      if (updated) {
        setOrder(mapBackendOrder(updated));
      }
      setCancelModalOpen(false);
      setCancelReason('');
    } catch (err) {
      setCancelError(err?.message || 'Unable to cancel this order.');
    } finally {
      setIsCancelling(false);
    }
  };

  const handleRefreshPayment = async () => {
    if (paymentBusy || !order) return;
    setPaymentBusy(true);
    setPaymentError('');
    try {
      const fresh = await customerService.getOrder(order.id);
      if (fresh) {
        setOrder(mapBackendOrder(fresh));
      }
    } catch (err) {
      setPaymentError(err?.message || 'Unable to refresh payment status.');
    } finally {
      setPaymentBusy(false);
    }
  };

  const handleRetryPayment = async () => {
    if (paymentBusy || !order?.paymentId) return;
    setPaymentBusy(true);
    setPaymentError('');
    try {
      const payment = await customerService.initiatePayment(order.paymentId);
      const nextUrl = payment?.checkout_url;
      if (nextUrl) {
        window.open(nextUrl, '_blank', 'noopener,noreferrer');
      }
      const fresh = await customerService.getOrder(order.id);
      if (fresh) {
        setOrder(mapBackendOrder(fresh));
      }
    } catch (err) {
      setPaymentError(err?.message || 'Unable to initiate payment.');
    } finally {
      setPaymentBusy(false);
    }
  };

  const handleReorder = () => {
    (order.subOrders || []).forEach((subOrder) => {
      const restaurantId = subOrder.restaurantId;
      const fulfillment = subOrder.fulfillment || 'delivery';

      setRestaurantFulfillment(restaurantId, fulfillment);
      if (fulfillment === 'delivery' && defaultAddress) {
        setRestaurantAddress(restaurantId, defaultAddress);
      }

      (subOrder.items || []).forEach((item) => {
        addItem({
          id: item.menuItemId || item.id,
          name: item.name,
          price: Number(item.price || 0),
          quantity: Number(item.qty || item.quantity || 1),
          restaurantId,
          restaurantName: subOrder.restaurantName,
          image: 'R',
          deliveryFee: subOrder.deliveryFee ?? undefined,
          selectedAddOns: Array.isArray(item.addOns)
            ? item.addOns.map((addOn) => (typeof addOn === 'string' ? { name: addOn, price: 0 } : addOn))
            : [],
        });
      });
    });

    navigate('/customer/cart');
  };

  const handleShareTracking = () => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(window.location.href).catch(() => {});
    }
    setShareCopied(true);
    window.setTimeout(() => setShareCopied(false), 2500);
  };

  const isCancellable = canCustomerCancelOrder(order);

  const subStatus = activeSub?.status || order.overallStatus;
  const statusKey = normalizeOrderStatusKey(subStatus);
  const fulfillment = String(activeSub?.fulfillment || order.fulfillment || 'delivery').toLowerCase();
  const timelineSteps = buildOrderTimelineSteps({
    ...order,
    fulfillment,
    overallStatus: subStatus,
  });

  const customerDeliveryAddress =
    activeSub?.deliveryAddress?.addressText ||
    (defaultAddress
      ? `${defaultAddress.street}, ${defaultAddress.barangay}, ${defaultAddress.city}`
      : null);

  const customerMapStatusText =
    statusKey === 'delivered'
      ? `Order delivered${order.riderFirstName ? ` by ${order.riderFirstName}` : ''}`
      : statusKey === 'out_for_delivery'
        ? `Out for delivery${order.riderFirstName ? ` with ${order.riderFirstName}` : ''}`
        : statusKey === 'ready'
          ? fulfillment === 'pickup'
            ? `Your order from ${activeSub?.restaurantName} is ready for pickup`
            : order.riderFirstName
              ? `Ready · Assigned to rider ${order.riderFirstName}`
              : `Your order from ${activeSub?.restaurantName} is ready`
          : statusKey === 'preparing'
            ? `${activeSub?.restaurantName} is preparing your meal`
            : statusKey === 'accepted'
              ? `${activeSub?.restaurantName} accepted your order`
              : statusKey === 'completed'
                ? fulfillment === 'pickup'
                  ? `Order picked up and completed at ${activeSub?.restaurantName}`
                  : 'Order completed'
                : statusKey === 'rejected'
                  ? `Order was rejected by ${activeSub?.restaurantName}`
                  : statusKey === 'cancelled'
                    ? 'Order cancelled'
                    : `Order received by ${activeSub?.restaurantName} · Awaiting restaurant confirmation`;

  return (
    <CustomerLayout>
      {/* ── Cancel Order Confirmation Modal ─────────────── */}
      <Modal
        open={cancelModalOpen}
        onClose={() => !isCancelling && setCancelModalOpen(false)}
        title="Cancel Order"
        size="sm"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
            <Button variant="ghost" size="sm" onClick={() => setCancelModalOpen(false)} disabled={isCancelling}>
              Keep Order
            </Button>
            <Button variant="danger" size="sm" onClick={handleConfirmCancel} loading={isCancelling} disabled={isCancelling}>
              Confirm Cancellation
            </Button>
          </div>
        }
      >
        <div>
          <p
            style={{
              fontSize: 'var(--font-size-sm)',
              color: 'var(--text-secondary)',
              marginBottom: 'var(--space-4)',
              lineHeight: 1.5,
            }}
          >
            Cancel Order <strong>{order.orderReference || `#${order.id}`}</strong>?{' '}
            {order.paymentMethod === 'cod'
              ? 'Your pending Cash on Delivery payment will also be cancelled.'
              : order.paymentStatus === 'paid'
                ? 'Since this order was paid online, a refund request will be initiated automatically.'
                : 'Your pending online payment will also be cancelled.'}
          </p>

          <label style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, display: 'block', marginBottom: 4 }}>
            Reason (optional)
          </label>
          <input
            type="text"
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder="e.g. Change of mind"
            maxLength={255}
            className="input"
            style={{ width: '100%', height: 38 }}
          />
        </div>
      </Modal>

      {cancelError && (
        <p className="form-error" role="alert">
          {cancelError}
        </p>
      )}

      {/* ── Concurrent Upcoming Orders Switcher (When customer ordered multiple times) ── */}
      {upcomingOrders.length > 1 && (
        <div className="customer-concurrent-orders-bar" role="navigation" aria-label="Switch active order">
          <span className="customer-concurrent-orders-bar__label">Active Orders ({upcomingOrders.length}):</span>
          <div className="customer-concurrent-orders-bar__pills">
            {upcomingOrders.map((upOrder) => {
              const isCurrent = upOrder.id === order.id;
              return (
                <button
                  key={upOrder.id}
                  type="button"
                  className={`customer-concurrent-pill ${isCurrent ? 'is-active' : ''}`}
                  onClick={() => {
                    setSelectedSubIdx(0);
                    navigate(`/customer/orders/${upOrder.id}`);
                  }}
                >
                  <strong>{formatShortOrderId(upOrder.id)}</strong>
                  <span>{upOrder.overallStatus}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── 2-Column Customer Order Tracking & Live Map Layout ── */}
      <div className="customer-track-layout">
        {/* Left Column: Customer Order Tracking Panel */}
        <aside className="customer-track-sidebar">
          <div className="customer-track-panel">
            {/* Top Header */}
            <div className="customer-track-header">
              <div className="customer-track-header__left">
                <Link
                  to="/customer/orders"
                  className="customer-track-back-btn"
                  aria-label="Back to My Orders"
                  title="Back to My Orders"
                >
                  ←
                </Link>
                <div>
                  <span className="customer-track-eyebrow">Live Order Tracking</span>
                  <h1 className="customer-track-title" title={order.id}>
                    {formatShortOrderId(order.id)}
                  </h1>
                </div>
              </div>
              <Badge
                variant={
                  statusKey === 'completed'
                    ? 'success'
                    : statusKey === 'cancelled' || statusKey === 'rejected'
                      ? 'error'
                      : 'primary'
                }
                dot
              >
                {formatOrderStatusText(subStatus, fulfillment)}
              </Badge>
            </div>

            {/* Multi-Kitchen Sub-Order Switcher (When ordered from multiple kitchens at once) */}
            {subOrders.length > 1 && (
              <div className="customer-track-suborders-tabs" role="tablist" aria-label="Restaurant sub-orders">
                {subOrders.map((sub, idx) => (
                  <button
                    key={sub.id || idx}
                    type="button"
                    role="tab"
                    aria-selected={safeSubIdx === idx}
                    className={`customer-track-subtab ${safeSubIdx === idx ? 'is-active' : ''}`}
                    onClick={() => setSelectedSubIdx(idx)}
                  >
                    <strong>
                      Kitchen {idx + 1}: {sub.restaurantName}
                    </strong>
                    <span>{sub.status}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Status Banner */}
            <div className="customer-track-status-banner">
              <strong>{customerMapStatusText}</strong>
              <span>
                Placed {formatDateTimeManila(order.createdAt)} · {fulfillment === 'pickup' ? 'Pickup' : 'Delivery'}
              </span>
            </div>

            {(statusKey === 'rejected' || activeSub?.rejectionReason || order.rejectionReason) && (
              <div
                className="customer-track-status-banner"
                role="alert"
                style={{
                  background: 'var(--status-error-bg)',
                  color: 'var(--status-error-text)',
                  marginBottom: 14,
                }}
              >
                <strong>Order Rejected by Restaurant</strong>
                <span>
                  {activeSub?.rejectionReason || order.rejectionReason || 'The restaurant could not fulfill this order.'}
                </span>
              </div>
            )}

            {statusKey === 'cancelled' && (
              <div
                className="customer-track-status-banner"
                role="status"
                style={{
                  background: 'var(--status-error-bg)',
                  color: 'var(--status-error-text)',
                  marginBottom: 14,
                }}
              >
                <strong>Order Cancelled</strong>
                <span>
                  {order.cancellationReason
                    ? `Reason: ${order.cancellationReason}`
                    : 'This order was cancelled.'}
                  {order.cancelledAt ? ` · ${formatDateTimeManila(order.cancelledAt)}` : ''}
                </span>
              </div>
            )}

            {/* Status Timeline (real timestamps where available; Preparing & Ready shown without timestamps) */}
            <ol className="customer-track-steps" aria-label="Order status timeline">
              {timelineSteps.map((step, sIdx) => (
                <li
                  key={step.key}
                  className={
                    step.variant === 'error'
                      ? 'is-current'
                      : step.current
                        ? 'is-current'
                        : step.reached
                          ? 'is-done'
                          : ''
                  }
                >
                  <span aria-hidden="true">{step.reached ? (step.variant === 'error' ? '✕' : '✓') : sIdx + 1}</span>
                  <small>{step.label}</small>
                  {step.timestamp && (
                    <small style={{ display: 'block', fontSize: 10, color: 'var(--text-muted)' }}>
                      {formatDateTimeManila(step.timestamp)}
                    </small>
                  )}
                </li>
              ))}
            </ol>

            {/* Order Items & Bill Summary */}
            <div className="customer-track-manifest">
              <div className="customer-track-manifest__head">
                <span>{activeSub?.restaurantName || 'Order Summary'}</span>
                <strong>{(activeSub?.items || []).length} items</strong>
              </div>
              <ul className="customer-track-items-list">
                {(activeSub?.items || []).map((item, i) => (
                  <li key={i}>
                    <div className="customer-track-item-left">
                      <span className="customer-track-item-qty">{item.qty || item.quantity || 1}×</span>
                      <div>
                        <strong>{item.name}</strong>
                        {item.addOns?.length > 0 && (
                          <small>
                            {item.addOns
                              .map((addOn) =>
                                typeof addOn === 'string'
                                  ? addOn
                                  : `${addOn.name}${Number(addOn.price) > 0 ? ` (+₱${addOn.price})` : ''}`,
                              )
                              .join(', ')}
                          </small>
                        )}
                      </div>
                    </div>
                    <span className="customer-track-item-price">
                      {formatPeso(item.lineTotal ?? ((item.price || 0) * (item.qty || item.quantity || 1)))}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="customer-track-bill-footer">
                <div className="customer-track-bill-row">
                  <span>Kitchen Subtotal + Delivery Fee</span>
                  <strong>{formatPeso((activeSub?.subtotal || 0) + (activeSub?.deliveryFee || 0))}</strong>
                </div>
                <div className="customer-track-bill-row">
                  <span>Payment Status</span>
                  <strong>
                    {formatPaymentStatusLabel(order.paymentStatus)}
                    {order.paidAt ? ` (${formatDateTimeManila(order.paidAt)})` : ''}
                  </strong>
                </div>
                {(order.refund || ['refunded', 'partially_refunded'].includes(order.paymentStatus)) && (
                  <div className="customer-track-bill-row">
                    <span>Refund Status</span>
                    <strong>
                      {order.refund
                        ? `${formatRefundStatusLabel(order.refund.status)} (${formatPeso(order.refund.amount)})`
                        : formatPaymentStatusLabel(order.paymentStatus)}
                    </strong>
                  </div>
                )}
                <div className="customer-track-bill-row is-total">
                  <span>Total Order ({order.paymentMethod === 'cod' ? 'COD' : (order.paymentChannel || order.paymentMethod || 'Online')})</span>
                  <strong>{formatPeso(order.grandTotal ?? order.totalAmount)}</strong>
                </div>
              </div>
            </div>

            {order.paymentMethod !== 'cod'
              && !['paid', 'refunded', 'partially_refunded', 'cancelled'].includes(order.paymentStatus)
              && !['cancelled', 'rejected'].includes(statusKey) && (
              <div
                className="customer-track-status-banner"
                style={{ marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 8 }}
              >
                <strong>Online Payment {formatPaymentStatusLabel(order.paymentStatus)}</strong>
                <span>
                  {order.checkoutUrl
                    ? 'Complete your online payment to confirm this order.'
                    : 'Initiate or refresh your online payment status below.'}
                </span>
                {paymentError && (
                  <span role="alert" style={{ color: 'var(--status-error-text)' }}>{paymentError}</span>
                )}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {order.checkoutUrl ? (
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={paymentBusy}
                      onClick={() => window.open(order.checkoutUrl, '_blank', 'noopener,noreferrer')}
                    >
                      Complete Payment
                    </Button>
                  ) : order.paymentId ? (
                    <Button
                      variant="primary"
                      size="sm"
                      loading={paymentBusy}
                      disabled={paymentBusy}
                      onClick={handleRetryPayment}
                    >
                      Retry Payment
                    </Button>
                  ) : null}
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={paymentBusy}
                    onClick={handleRefreshPayment}
                  >
                    Refresh Status
                  </Button>
                </div>
              </div>
            )}

            {/* Customer Action Buttons */}
            <div className="customer-track-actions">
              <div className="customer-track-actions__row">
                <Button variant="primary" size="sm" onClick={handleShareTracking}>
                  {shareCopied ? '✓ Tracking Link Copied' : '🔗 Share Live Tracking'}
                </Button>
                <Button variant="secondary" size="sm" onClick={handleReorder}>
                  Reorder Items
                </Button>
              </div>
              {isCancellable && (
                <Button
                  variant="danger-outline"
                  size="sm"
                  fullWidth
                  disabled={isCancelling}
                  onClick={() => setCancelModalOpen(true)}
                >
                  Cancel Order
                </Button>
              )}
            </div>
          </div>
        </aside>

        {/* Right Column: Order Fulfillment & Live Tracking Details */}
        <div className="customer-track-map-column">
          <div className="customer-track-checkpoints" aria-label="Order fulfillment details">
            <div className="customer-track-checkpoint is-pickup is-current">
              <div className="customer-track-checkpoint__top">
                <span>Restaurant</span>
                <em>{formatOrderStatusText(subStatus, fulfillment)}</em>
              </div>
              <strong>{tracking?.pickup?.restaurant_name || activeSub?.restaurantName}</strong>
              {tracking?.pickup?.address && (
                <small>{tracking.pickup.address}</small>
              )}
              <small>Reference: {tracking?.order_reference || order.orderReference || `#${order.id}`}</small>
            </div>

            {fulfillment === 'delivery' ? (
              <div className="customer-track-checkpoint is-dropoff">
                <div className="customer-track-checkpoint__top">
                  <span>Delivery Destination</span>
                  <em>{tracking?.delivery?.status ? formatOrderStatusText(tracking.delivery.status, fulfillment) : formatOrderStatusText(subStatus, fulfillment)}</em>
                </div>
                <strong>{tracking?.dropoff?.recipient_name || activeSub?.deliveryAddress?.recipientName || 'Delivery Address'}</strong>
                <small>{tracking?.dropoff?.address || customerDeliveryAddress || 'Address on file'}</small>
                {(tracking?.rider?.name || order.riderFirstName) && (
                  <small>
                    Assigned rider: <strong>{tracking?.rider?.name || order.riderFirstName}</strong>
                    {tracking?.rider?.vehicle_type ? ` (${tracking.rider.vehicle_type}${tracking.rider.plate_number ? ` · ${tracking.rider.plate_number}` : ''})` : ''}
                  </small>
                )}
                {(tracking?.dropoff?.notes || activeSub?.deliveryAddress?.notes) && (
                  <small>Notes: {tracking?.dropoff?.notes || activeSub.deliveryAddress.notes}</small>
                )}
              </div>
            ) : (
              <div className="customer-track-checkpoint is-dropoff">
                <div className="customer-track-checkpoint__top">
                  <span>Fulfillment</span>
                  <em>Self-pickup at restaurant</em>
                </div>
                <strong>Cash on Pickup ({formatPaymentStatusLabel(order.paymentStatus)})</strong>
                <small>
                  {statusKey === 'completed'
                    ? 'Picked up and completed.'
                    : statusKey === 'ready'
                      ? 'Ready for pickup at the restaurant counter.'
                      : 'We will update this page as your order progresses.'}
                </small>
              </div>
            )}

            {fulfillment === 'delivery' && (
              <div className="customer-track-checkpoint" aria-live="polite">
                <div className="customer-track-checkpoint__top">
                  <span>Live Rider Tracking</span>
                  <em>
                    {trackingLoading
                      ? 'Loading...'
                      : trackingError
                        ? 'Unavailable'
                        : tracking?.rider_location
                          ? (tracking.rider_location.is_stale ? 'Last known GPS' : 'Live GPS active')
                          : 'Waiting for GPS'}
                  </em>
                </div>
                {trackingLoading ? (
                  <small>Fetching latest delivery tracking...</small>
                ) : trackingError ? (
                  <small role="alert">{trackingError}</small>
                ) : tracking?.rider_location ? (
                  <>
                    <strong>
                      {tracking.rider_location.latitude.toFixed(5)}, {tracking.rider_location.longitude.toFixed(5)}
                    </strong>
                    <small>
                      Updated {formatDateTimeManila(tracking.rider_location.recorded_at)}
                      {tracking.rider_location.is_stale ? ' (signal may be delayed)' : ''}
                    </small>
                  </>
                ) : (
                  <small>
                    {tracking?.delivery
                      ? 'Rider GPS coordinates will appear here once the rider starts sharing live location.'
                      : 'No delivery rider has been assigned yet.'}
                  </small>
                )}

                {customerMapState && (customerMapState.pickupMarker || customerMapState.dropoffMarker || customerMapState.riderMarker) && (
                  <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <SharedMap
                      center={customerMapState.center}
                      zoom={14}
                      height={260}
                      markers={customerMapState.markers}
                      route={customerMapState.route}
                      onRouteCalculated={setRouteSummary}
                      showCoordsChip={false}
                      ariaLabel="Live delivery route map"
                    />
                    {simulation.canSimulate && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={simulation.isSimulating ? simulation.stopSimulation : simulation.startSimulation}
                        >
                          {simulation.isSimulating
                            ? `Simulating rider (${Math.round(simulation.progress * 100)}%) — Stop`
                            : simulation.hasCompletedSimulation
                              ? `Replay route simulation (~${simulation.durationSec}s)`
                              : `Simulate rider movement (~${simulation.durationSec}s)`}
                        </Button>
                        <small style={{ color: 'var(--text-muted)' }}>
                          {simulation.hasCompletedSimulation
                            ? 'Simulation complete. Order is marked Delivered only after the rider confirms with a photo.'
                            : 'Shows rider vehicle along the route; photo proof is required to mark Delivered.'}
                        </small>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <OrderReviewSection
            orderId={order.id}
            restaurantName={activeSub?.restaurantName || 'Restaurant'}
            riderName={tracking?.rider?.name || order.riderFirstName || null}
            isDelivery={fulfillment === 'delivery'}
            isEligible={['completed', 'delivered'].includes(statusKey)}
          />
        </div>
      </div>
    </CustomerLayout>
  );
}
