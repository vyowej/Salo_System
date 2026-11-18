import { useState, useEffect, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import CustomerLayout from '../../../layouts/CustomerLayout';
import { useCart } from '../../../hooks/useCart';
import customerService from '../../../services/customerService';
import locationApiService from '../../../services/locationApiService';
import Button from '../../../components/common/Button';
import Badge from '../../../components/common/Badge';
import Modal from '../../../components/common/Modal';
import MapSlot from '../../../components/common/MapSlot';
import { formatShortOrderId, formatPeso } from '../../../utils/format';
import './CustomerRecords.css';

const DELIVERY_STEPS = ['Pending', 'Accepted', 'Preparing', 'Ready for Dispatch', 'Out for Delivery', 'Completed'];
const PICKUP_STEPS = ['Pending', 'Accepted', 'Preparing', 'Ready for Pickup', 'Completed'];

const DROPOFF_PREFERENCES = [
  { id: 'meet', label: '🤝 Meet at door', note: 'Hand order directly to me at the entrance.' },
  { id: 'lobby', label: '🏢 Leave at lobby / guard', note: 'Leave with building reception or security desk.' },
  { id: 'silent', label: '🔕 Leave at door (No bell)', note: 'Place by the door and send a photo.' },
];

const QUICK_RIDER_MESSAGES = [
  'Please leave at the lobby desk',
  'I am waiting outside',
  'Please call when you arrive',
];

function isUpcomingOrder(order) {
  const norm = String(order?.overallStatus || '').trim().toLowerCase();
  return !['delivered', 'completed', 'picked up', 'cancelled', 'rejected', 'failed'].includes(norm);
}

function formatBackendStatus(status, fulfillment) {
  const key = String(status || '').trim().toLowerCase();
  if (key === 'pending' || key === 'pending confirmation') return 'Pending';
  if (key === 'accepted') return 'Accepted';
  if (key === 'preparing') return 'Preparing';
  if (key === 'ready') return fulfillment === 'pickup' ? 'Ready for Pickup' : 'Ready for Dispatch';
  if (key === 'rejected') return 'Rejected';
  if (key === 'out_for_delivery' || key === 'out for delivery') return 'Out for Delivery';
  if (key === 'completed') return 'Completed';
  if (key === 'cancelled') return 'Cancelled';
  return status || 'Pending';
}

export default function OrderDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { addItem, setRestaurantFulfillment, setRestaurantAddress } = useCart();

  const [allOrders, setAllOrders] = useState([]);
  const [restaurants, setRestaurants] = useState([]);
  const [selectedSubIdx, setSelectedSubIdx] = useState(0);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('Change of mind');
  const [cancelError, setCancelError] = useState('');
  const [dropoffPref, setDropoffPref] = useState('meet');
  const [sentMessage, setSentMessage] = useState('');
  const [shareCopied, setShareCopied] = useState(false);
  const [lookupQuery, setLookupQuery] = useState('');
  const [liveTracking, setLiveTracking] = useState(null);

  const [order, setOrder] = useState(null);
  const [orderLoading, setOrderLoading] = useState(true);
  const [orderError, setOrderError] = useState('');

  useEffect(() => {
    let active = true;
    setOrderLoading(true);
    setOrderError('');

    const mapBackendOrder = (raw) => ({
      id: String(raw.order_id),
      orderReference: raw.order_reference,
      overallStatus: raw.order_status || 'pending',
      rejectionReason: raw.rejection_reason ?? null,
      createdAt: raw.placed_at,
      grandTotal: Number(raw.total_amount ?? 0),
      paymentMethod: raw.payment?.method || 'cod',
      paymentStatus: raw.payment?.status || 'pending',
      subOrders: [
        {
          restaurantId: String(raw.restaurant_id),
          restaurantName: raw.restaurant_name,
          restaurantLogoUrl: raw.restaurant_logo_url,
          fulfillment: raw.fulfillment,
          status: raw.order_status || 'pending',
          rejectionReason: raw.rejection_reason ?? null,
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
            name: it.item_name,
            qty: Number(it.quantity),
            price: Number(it.unit_price),
            lineTotal: Number(it.line_total),
          })),
        },
      ],
    });

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

        const raw = await customerService.fetchOrderDetail(targetId);
        if (!active) return;
        setOrder(raw ? mapBackendOrder(raw) : null);

        const rests = await customerService.getRestaurants().catch(() => []);
        if (active) setRestaurants(rests);
      } catch (err) {
        if (active) {
          setOrder(null);
          setOrderError(err?.status === 404 ? 'Order not found.' : (err?.message || 'Unable to load order details.'));
        }
      } finally {
        if (active) setOrderLoading(false);
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
  const secondarySub = subOrders.length > 1 ? subOrders.find((_, idx) => idx !== safeSubIdx) : null;

  const matchedRestaurant = useMemo(
    () => restaurants.find((r) => r.id === activeSub?.restaurantId || r.name === activeSub?.restaurantName),
    [restaurants, activeSub],
  );

  useEffect(() => {
    const numericOrderId = Number(order?.backendOrderId || order?.order_id || (/^\d+$/.test(String(order?.id || '')) ? order.id : 0));
    if (!numericOrderId || !isUpcomingOrder(order)) {
      setLiveTracking(null);
      return undefined;
    }

    let cancelled = false;
    const fetchTracking = async () => {
      try {
        const data = await locationApiService.getCustomerOrderTracking(numericOrderId);
        if (!cancelled && data) setLiveTracking(data);
      } catch {
        // Fallback gracefully to order snapshot coordinates if backend order is local demo
      }
    };

    fetchTracking();
    const timer = setInterval(fetchTracking, 10000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [order]);

  // Standby / Direct Track My Order Map View when no upcoming orders exist
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

    const previewKitchen = restaurants[0] || {
      name: 'Dalisay Heritage Grill & Bistro',
      address: '42 Scout Gandia St., Tomas Morato, Quezon City',
      deliveryTime: '25–35 min',
    };
    const previewSecondaryKitchen = restaurants[1] || {
      name: 'Manila Artisan Pizza & Pasta',
      address: 'High Street South Block, BGC, Taguig City',
    };
    const customerAddressText = defaultAddress
      ? `${defaultAddress.street}, ${defaultAddress.barangay}, ${defaultAddress.city}`
      : 'Office · Taguig City (BGC)';

    return (
      <CustomerLayout>
        <div className="customer-track-layout">
          {/* Left Column: Customer Standby Tracker & Order Lookup */}
          <aside className="customer-track-sidebar">
            <div className="customer-track-panel">
              <div className="customer-track-header">
                <div className="customer-track-header__left">
                  <Link to="/customer" className="customer-track-back-btn" aria-label="Back to home" title="Back to home">
                    ←
                  </Link>
                  <div>
                    <span className="customer-track-eyebrow">Customer Map Tracker</span>
                    <h1 className="customer-track-title">Track My Order</h1>
                  </div>
                </div>
                <Badge variant="default" size="sm" dot>
                  Standby
                </Badge>
              </div>

              <div className="customer-track-status-banner is-standby">
                <strong>No upcoming orders in transit right now</strong>
                <span>Your delivery zone map is ready. Place an order or look up a previous order below.</span>
              </div>

              {/* Delivery Pin & Drop-off Preference */}
              <div className="customer-track-section">
                <div className="customer-track-section__head">
                  <span>Your Delivery Pin</span>
                  <Link to="/customer/addresses" className="customer-track-inline-link">
                    Change address
                  </Link>
                </div>
                <div className="customer-track-route-card is-home">
                  <span className="customer-track-route-icon" aria-hidden="true">🏠</span>
                  <div>
                    <strong>{defaultAddress?.label || 'Saved Delivery Address'}</strong>
                    <p>{customerAddressText}</p>
                  </div>
                </div>
              </div>

              <div className="customer-track-section">
                <span className="customer-track-section__label">Default Drop-off Preference</span>
                <div className="customer-track-pref-list">
                  {DROPOFF_PREFERENCES.map((pref) => (
                    <button
                      key={pref.id}
                      type="button"
                      className={`customer-track-pref-btn ${dropoffPref === pref.id ? 'is-active' : ''}`}
                      onClick={() => setDropoffPref(pref.id)}
                    >
                      <strong>{pref.label}</strong>
                      <small>{pref.note}</small>
                    </button>
                  ))}
                </div>
              </div>

              {/* Order Lookup */}
              <div className="customer-track-section">
                <span className="customer-track-section__label">Look Up an Order</span>
                <input
                  type="search"
                  className="customer-track-lookup-input"
                  placeholder="Enter Order ID (e.g. ORD-9821) or restaurant..."
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
          </aside>

          {/* Right Column: Customer Delivery Coverage Map */}
          <div className="customer-track-map-column">
            <div className="customer-track-map-viewport">
              <MapSlot
                mode="customer"
                stage="dropoff"
                pickup={{
                  title: previewKitchen.name,
                  address: previewKitchen.address,
                  lat: previewKitchen.location?.latitude ?? null,
                  lng: previewKitchen.location?.longitude ?? null,
                }}
                secondaryPickup={{
                  title: previewSecondaryKitchen.name,
                  address: previewSecondaryKitchen.address,
                  lat: previewSecondaryKitchen.location?.latitude ?? null,
                  lng: previewSecondaryKitchen.location?.longitude ?? null,
                }}
                dropoff={{
                  title: defaultAddress?.label || 'Your Address',
                  address: customerAddressText,
                  lat: defaultAddress?.lat ?? defaultAddress?.latitude ?? null,
                  lng: defaultAddress?.lng ?? defaultAddress?.longitude ?? null,
                }}
                riderLocation={null}
                customerStatusText="No active delivery in transit · Your pinned delivery address is ready"
                metrics={{
                  eta: previewKitchen.deliveryTime || '25–35 min',
                }}
              />
            </div>

            <div className="customer-track-checkpoints">
              <div className="customer-track-checkpoint is-pickup">
                <div className="customer-track-checkpoint__top">
                  <span>Nearby Partner Kitchen</span>
                  <em>Open Now</em>
                </div>
                <strong>{previewKitchen.name}</strong>
                <small>{previewKitchen.address}</small>
              </div>
              <div className="customer-track-checkpoint is-dropoff is-current">
                <div className="customer-track-checkpoint__top">
                  <span>Your Delivery Destination</span>
                  <em>Pinned Address</em>
                </div>
                <strong>{defaultAddress?.label || 'Home / Office'}</strong>
                <small>{customerAddressText}</small>
              </div>
            </div>
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

  const handleConfirmCancel = () => {
    setCancelError('Order cancellation is not available yet. The customer order API is pending backend implementation.');
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

  const handleShareTracking = () => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(window.location.href).catch(() => {});
    }
    setShareCopied(true);
    window.setTimeout(() => setShareCopied(false), 2500);
  };

  const handleQuickRiderMessage = (msg) => {
    setSentMessage(msg);
    window.setTimeout(() => setSentMessage(''), 3000);
  };

  const isCancellable = (order.subOrders || []).some(
    (sub) =>
      !['Completed', 'Cancelled', 'Rejected'].includes(sub.status) &&
      sub.cancellationRequest?.status !== 'requested',
  );

  const subStatus = activeSub?.status || order.overallStatus;
  const normalizedStatusStep = formatBackendStatus(subStatus, activeSub?.fulfillment);
  const isOutForDelivery = ['Out for Delivery', 'Ready for Dispatch', 'Completed'].includes(normalizedStatusStep);
  const steps = activeSub?.fulfillment === 'pickup' ? PICKUP_STEPS : DELIVERY_STEPS;
  const currentStepIdx = Math.max(steps.indexOf(normalizedStatusStep), 0);

  const kitchenAddress =
    matchedRestaurant?.address || '42 Scout Gandia St., Tomas Morato, Quezon City';
  const customerDeliveryAddress =
    activeSub?.deliveryAddress ||
    (defaultAddress
      ? `${defaultAddress.street}, ${defaultAddress.barangay}, ${defaultAddress.city}`
      : 'Office · Taguig City (BGC)');

  const riderInfo = activeSub?.rider || {
    name: isOutForDelivery ? 'Kuya Juan Dela Cruz' : 'Rider assigned upon kitchen dispatch',
    vehicle: isOutForDelivery ? 'Yamaha NMAX (Plate 123-NCR)' : 'Awaiting kitchen handoff',
    phone: '09191234567',
    eta: isOutForDelivery ? '12 min away' : matchedRestaurant?.deliveryTime || '25–35 min',
  };

  const customerMapStatusText =
    normalizedStatusStep === 'Out for Delivery'
      ? `Rider is on the way with your order from ${activeSub?.restaurantName}`
      : normalizedStatusStep === 'Ready for Dispatch' || normalizedStatusStep === 'Ready for Pickup'
        ? `Your order from ${activeSub?.restaurantName} is ready`
        : normalizedStatusStep === 'Preparing'
          ? `${activeSub?.restaurantName} is preparing your fresh meal`
          : normalizedStatusStep === 'Accepted'
            ? `${activeSub?.restaurantName} accepted your order`
            : normalizedStatusStep === 'Rejected'
              ? `Order was rejected by ${activeSub?.restaurantName}`
              : normalizedStatusStep === 'Completed'
                ? `Order delivered to ${customerDeliveryAddress}`
                : `Order received by ${activeSub?.restaurantName} · Awaiting restaurant confirmation`;

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
          <p
            style={{
              fontSize: 'var(--font-size-sm)',
              color: 'var(--text-secondary)',
              marginBottom: 'var(--space-4)',
              lineHeight: 1.5,
            }}
          >
            Request cancellation for eligible restaurant sub-orders in Order <strong>#{order.id}</strong>. Each
            restaurant reviews its own request; this does not immediately cancel the order.
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
                  ['Completed'].includes(order.overallStatus)
                    ? 'success'
                    : ['Cancelled', 'Rejected'].includes(order.overallStatus)
                      ? 'error'
                      : order.overallStatus === 'Cancellation Requested'
                        ? 'warning'
                        : 'primary'
                }
                dot
              >
                {order.overallStatus}
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
                Placed {order.createdAt} · {order.paymentMethod || 'Cash on Delivery'}
              </span>
            </div>

            {activeSub?.cancellationRequest && (
              <div role="status" className="customer-order-detail-card__cancellation" style={{ marginBottom: 0 }}>
                <strong>Cancellation request: {activeSub.cancellationRequest.status}</strong>
                {activeSub.cancellationRequest.reason && <p>Customer reason: {activeSub.cancellationRequest.reason}</p>}
                {activeSub.cancellationRequest.resolutionReason && (
                  <p>Restaurant response: {activeSub.cancellationRequest.resolutionReason}</p>
                )}
              </div>
            )}

            {(normalizedStatusStep === 'Rejected' || activeSub?.rejectionReason || order.rejectionReason) && (
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

            {/* 6-Step Customer Progress Stepper */}
            {!['Cancelled', 'Rejected'].includes(normalizedStatusStep) && (
              <ol className="customer-track-steps" aria-label="Order progress">
                {steps.map((step, sIdx) => {
                  const isDone = sIdx < currentStepIdx;
                  const isCurrent = sIdx === currentStepIdx;
                  return (
                    <li key={step} className={isDone ? 'is-done' : isCurrent ? 'is-current' : ''}>
                      <span aria-hidden="true">{isDone ? '✓' : sIdx + 1}</span>
                      <small>{step === 'Ready for Dispatch' ? 'Ready' : step === 'Out for Delivery' ? 'On Way' : step}</small>
                    </li>
                  );
                })}
              </ol>
            )}

            {/* Assigned Rider & Customer Contact Controls */}
            <div className="customer-track-rider-card">
              <div className="customer-track-rider-top">
                <div className="customer-track-rider-avatar" aria-hidden="true">
                  🛵
                </div>
                <div className="customer-track-rider-info">
                  <span className="customer-track-section__label">Assigned Delivery Rider</span>
                  <strong>{riderInfo.name}</strong>
                  <small>
                    {riderInfo.vehicle} · <em className="customer-track-eta-highlight">{riderInfo.eta}</em>
                  </small>
                </div>
                {riderInfo.phone && riderInfo.phone !== '-' && (
                  <a
                    href={`tel:${riderInfo.phone.replace(/[^+\d]/g, '')}`}
                    className="customer-track-call-btn"
                    title="Call rider"
                  >
                    📞 Call
                  </a>
                )}
              </div>

              <div className="customer-track-quick-msgs">
                <span className="customer-track-quick-msgs__label">Quick note to rider:</span>
                <div className="customer-track-quick-msgs__chips">
                  {QUICK_RIDER_MESSAGES.map((msg) => (
                    <button
                      key={msg}
                      type="button"
                      className="customer-track-msg-chip"
                      onClick={() => handleQuickRiderMessage(msg)}
                    >
                      💬 {msg}
                    </button>
                  ))}
                </div>
                {sentMessage && (
                  <p className="customer-track-msg-feedback" role="status">
                    ✓ Sent to rider: “{sentMessage}”
                  </p>
                )}
              </div>
            </div>

            {/* Customer Drop-off Instructions Selector */}
            <div className="customer-track-section">
              <span className="customer-track-section__label">Drop-off Handoff Preference</span>
              <div className="customer-track-pref-pills">
                {DROPOFF_PREFERENCES.map((pref) => (
                  <button
                    key={pref.id}
                    type="button"
                    className={`customer-track-pref-pill ${dropoffPref === pref.id ? 'is-active' : ''}`}
                    onClick={() => setDropoffPref(pref.id)}
                  >
                    {pref.label}
                  </button>
                ))}
              </div>
            </div>

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
                      {formatPeso((item.price || 0) * (item.qty || item.quantity || 1))}
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
                    {normalizedStatusStep === 'Rejected' && String(order.paymentStatus || '').toLowerCase() === 'cancelled'
                      ? 'Cancelled'
                      : (String(order.paymentStatus || 'pending').charAt(0).toUpperCase()
                        + String(order.paymentStatus || 'pending').slice(1))}
                  </strong>
                </div>
                <div className="customer-track-bill-row is-total">
                  <span>Total Order ({order.paymentMethod || 'COD'})</span>
                  <strong>{formatPeso(order.grandTotal ?? order.totalAmount)}</strong>
                </div>
              </div>
            </div>

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
                <Button variant="danger-outline" size="sm" fullWidth onClick={() => setCancelModalOpen(true)}>
                  Request Cancellation
                </Button>
              )}
            </div>
          </div>
        </aside>

        {/* Right Column: Interactive Customer Tracking Map & Checkpoints */}
        <div className="customer-track-map-column">
          <div className="customer-track-map-viewport">
            <MapSlot
              mode="customer"
              stage={isOutForDelivery ? 'dropoff' : 'pickup'}
              pickup={{
                title: liveTracking?.pickup?.restaurant_name || activeSub?.restaurantName || 'Kitchen',
                address: liveTracking?.pickup?.address || kitchenAddress,
                lat: liveTracking?.pickup?.latitude ?? matchedRestaurant?.location?.latitude ?? null,
                lng: liveTracking?.pickup?.longitude ?? matchedRestaurant?.location?.longitude ?? null,
              }}
              secondaryPickup={
                secondarySub
                  ? {
                      title: secondarySub.restaurantName,
                      address: 'Partner Kitchen #2',
                    }
                  : null
              }
              dropoff={{
                title: 'Your Address',
                address: liveTracking?.dropoff?.address || customerDeliveryAddress,
                lat: liveTracking?.dropoff?.latitude ?? activeSub?.deliveryCoordinates?.lat ?? defaultAddress?.lat ?? null,
                lng: liveTracking?.dropoff?.longitude ?? activeSub?.deliveryCoordinates?.lng ?? defaultAddress?.lng ?? null,
              }}
              riderName={liveTracking?.rider?.name || (isOutForDelivery ? riderInfo.name : null)}
              riderLocation={liveTracking?.rider_location || null}
              lastUpdatedAt={liveTracking?.rider_location?.recorded_at || null}
              isStale={Boolean(liveTracking?.rider_location?.is_stale)}
              customerStatusText={
                liveTracking?.rider_location
                  ? customerMapStatusText
                  : (liveTracking?.rider ? 'Rider assigned · Waiting for live GPS signal' : 'Awaiting rider assignment')
              }
              metrics={{
                eta: riderInfo.eta || '',
              }}
            />
          </div>

          {/* Docked Customer Route Checkpoints Below Map */}
          <div className="customer-track-checkpoints" aria-label="Order route checkpoints">
            <div className={`customer-track-checkpoint is-pickup ${!isOutForDelivery ? 'is-current' : ''}`}>
              <div className="customer-track-checkpoint__top">
                <span>Origin · Preparing Kitchen</span>
                <em>{activeSub?.status || 'Preparing'}</em>
              </div>
              <strong>{activeSub?.restaurantName}</strong>
              <small>{kitchenAddress}</small>
            </div>

            <div className={`customer-track-checkpoint is-dropoff ${isOutForDelivery ? 'is-current' : ''}`}>
              <div className="customer-track-checkpoint__top">
                <span>Destination · Your Delivery Address</span>
                <em>{DROPOFF_PREFERENCES.find((p) => p.id === dropoffPref)?.label || 'Meet at door'}</em>
              </div>
              <strong>{defaultAddress?.label || 'Customer Drop-off'}</strong>
              <small>{customerDeliveryAddress}</small>
            </div>
          </div>
        </div>
      </div>
    </CustomerLayout>
  );
}
