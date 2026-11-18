import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import CustomerLayout from '../../../layouts/CustomerLayout';
import { useCart } from '../../../hooks/useCart';
import customerService from '../../../services/customerService';
import Button from '../../../components/common/Button';
import Badge from '../../../components/common/Badge';
import { StateView } from '../../../components/feedback';
import { formatDateTimeManila, formatPeso, formatShortOrderId } from '../../../utils/format';
import {
  buildOrderTimelineSteps,
  formatOrderStatusText,
  formatPaymentStatusLabel,
} from '../utils/orderTimeline';
import { mapOrderItemsForReorder, resolveReorderItems } from '../utils/reorderOrder';
import './OrdersPage.css';

const TABS = [
  { id: 'upcoming', label: 'Upcoming', tone: 'upcoming' },
  { id: 'completed', label: 'Completed', tone: 'completed' },
  { id: 'cancelled', label: 'Cancelled', tone: 'cancelled' },
  { id: 'all', label: 'All', tone: 'all' },
];

const COMPLETED_STATUSES = new Set(['delivered', 'completed', 'picked up']);
const CANCELLED_STATUSES = new Set(['cancelled', 'rejected', 'failed']);
const PAGE_SIZE = 10;

function getOrderBucket(status) {
  const norm = String(status || '').trim().toLowerCase();
  if (COMPLETED_STATUSES.has(norm)) return 'completed';
  if (CANCELLED_STATUSES.has(norm)) return 'cancelled';
  return 'upcoming';
}

function StatusIcon({ bucket }) {
  if (bucket === 'completed') {
    return (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <polyline points="9 12 11.5 14.5 16 9.5" />
      </svg>
    );
  }
  if (bucket === 'cancelled') {
    return (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <line x1="15" y1="9" x2="9" y2="15" />
        <line x1="9" y1="9" x2="15" y2="15" />
      </svg>
    );
  }
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

const EMPTY_MESSAGES = {
  upcoming: 'No upcoming orders',
  completed: 'No completed orders yet',
  cancelled: 'No cancelled orders',
  all: 'No orders yet',
};

export default function OrdersPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { addItem, setRestaurantFulfillment, setRestaurantAddress } = useCart();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reorderingOrderId, setReorderingOrderId] = useState(null);
  const [reorderError, setReorderError] = useState('');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const rawTab = searchParams.get('tab');
  const activeTab = TABS.some((t) => t.id === rawTab) ? rawTab : 'upcoming';

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    (async () => {
      try {
        const res = await customerService.fetchOrders({ page: 1, per_page: 50 });
        if (!active) return;
        const mapped = (res?.orders || []).map((o) => ({
          id: String(o.order_id),
          orderReference: o.order_reference,
          overallStatus: o.order_status,
          fulfillment: o.fulfillment,
          rejectionReason: o.rejection_reason ?? null,
          cancellationReason: o.cancellation_reason ?? null,
          createdAt: o.placed_at,
          acceptedAt: o.accepted_at ?? null,
          deliveredAt: o.delivered_at ?? null,
          completedAt: o.completed_at ?? null,
          cancelledAt: o.cancelled_at ?? null,
          rejectedAt: o.rejected_at ?? null,
          riderFirstName: o.rider?.first_name ?? null,
          grandTotal: Number(o.total_amount ?? 0),
          totalAmount: Number(o.total_amount ?? 0),
          fulfillmentSummary: o.fulfillment === 'delivery' ? 'Delivery' : 'Pickup',
          paymentMethod: o.payment_method,
          paymentStatus: o.payment_status,
          paidAt: o.paid_at ?? null,
          subOrders: [
            {
              restaurantId: String(o.restaurant_id),
              restaurantName: o.restaurant_name,
              restaurantLogoUrl: o.restaurant_logo_url,
              fulfillment: o.fulfillment,
              status: o.order_status,
              rejectionReason: o.rejection_reason ?? null,
              deliveryFee: Number(o.delivery_fee ?? 0),
              items: mapOrderItemsForReorder(o.items),
            },
          ],
        }));
        setOrders(mapped);
      } catch (err) {
        if (active) setError(err?.message || 'Unable to load your orders.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const handleTabChange = (tabId) => {
    setVisibleCount(PAGE_SIZE);
    setSearchParams({ tab: tabId }, { replace: false });
  };

  const counts = useMemo(() => {
    const map = { upcoming: 0, completed: 0, cancelled: 0, all: orders.length };
    orders.forEach((order) => {
      map[getOrderBucket(order.overallStatus)] += 1;
    });
    return map;
  }, [orders]);

  const filteredOrders = useMemo(() => {
    const list = activeTab === 'all'
      ? [...orders]
      : orders.filter((order) => getOrderBucket(order.overallStatus) === activeTab);

    list.sort((a, b) => {
      const ta = new Date(a.scheduledAt || a.createdAt || 0).getTime();
      const tb = new Date(b.scheduledAt || b.createdAt || 0).getTime();
      return tb - ta;
    });
    return list;
  }, [orders, activeTab]);

  const paginatedOrders = filteredOrders.slice(0, visibleCount);
  const hasMore = filteredOrders.length > visibleCount;

  const handleReorder = async (order) => {
    if (reorderingOrderId) return;
    setReorderError('');
    setReorderingOrderId(order.id);

    try {
      const defaultAddress = customerService.getDefaultAddress();
      let detailItems = null;
      let totalAdded = 0;
      const skippedAll = [];
      let unavailableReason = '';

      for (const subOrder of order.subOrders || []) {
        const restaurantId = subOrder.restaurantId;
        const fulfillment = subOrder.fulfillment || 'delivery';

        let orderItems = subOrder.items || [];
        if (orderItems.length === 0) {
          if (detailItems === null) {
            const detail = await customerService.fetchOrderDetail(order.id);
            detailItems = mapOrderItemsForReorder(detail?.items);
          }
          orderItems = detailItems;
        }

        if (orderItems.length === 0) {
          continue;
        }

        let restaurant = null;
        try {
          restaurant = await customerService.getRestaurantById(restaurantId);
        } catch {
          restaurant = null;
        }

        const resolved = resolveReorderItems(orderItems, restaurant);
        if (resolved.unavailableReason) {
          unavailableReason = resolved.unavailableReason;
        }
        if (resolved.skippedItems.length > 0) {
          skippedAll.push(...resolved.skippedItems);
        }

        if (resolved.cartItems.length === 0) {
          continue;
        }

        setRestaurantFulfillment(restaurantId, fulfillment);
        if (fulfillment === 'delivery' && defaultAddress) {
          setRestaurantAddress(restaurantId, defaultAddress);
        }

        resolved.cartItems.forEach((cartItem) => {
          addItem({
            ...cartItem,
            deliveryFee: subOrder.deliveryFee || 49,
          });
          totalAdded += 1;
        });
      }

      if (totalAdded === 0) {
        setReorderError(
          unavailableReason ||
            (skippedAll.length > 0
              ? `None of the items from this order are currently available (${skippedAll.join(', ')}).`
              : 'No items from this order could be added to your cart.'),
        );
        return;
      }

      navigate('/customer/cart', {
        state: skippedAll.length > 0
          ? { reorderWarning: `Some unavailable items were skipped: ${skippedAll.join(', ')}.` }
          : undefined,
      });
    } catch (err) {
      setReorderError(err?.message || 'Unable to reorder right now. Please try again.');
    } finally {
      setReorderingOrderId(null);
    }
  };

  return (
    <CustomerLayout>
      <div className="customer-orders-tabs" role="tablist" aria-label="Order status tabs">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => handleTabChange(tab.id)}
              className={`customer-orders-tab customer-orders-tab--${tab.tone} ${isActive ? 'active' : ''}`.trim()}
            >
              <span className={`customer-orders-tab-dot customer-orders-tab-dot--${tab.tone}`} aria-hidden="true" />
              <span>{tab.label}</span>
              <span className="customer-orders-tab-count">{counts[tab.id]}</span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <StateView state="loading" title="Loading orders..." description="Fetching your latest orders from SALO." />
      ) : error ? (
        <StateView state="error" title="Unable to load orders" description={error} />
      ) : filteredOrders.length === 0 ? (
        <StateView
          state="empty"
          title={EMPTY_MESSAGES[activeTab]}
          description="Explore restaurants nearby to place your next meal order."
          action={(
            <Link to="/customer" style={{ textDecoration: 'none' }}>
              <Button variant="primary" size="sm">Explore restaurants</Button>
            </Link>
          )}
        />
      ) : (
        <>
          {reorderError && (
            <div
              role="alert"
              style={{
                marginBottom: '12px',
                padding: '10px 14px',
                borderRadius: '10px',
                background: 'var(--status-error-bg, rgba(239, 68, 68, 0.08))',
                border: '1px solid var(--status-error-border, rgba(239, 68, 68, 0.25))',
                color: 'var(--status-error-text, #b91c1c)',
                fontSize: 'var(--font-size-sm)',
              }}
            >
              {reorderError}
            </div>
          )}
          <div className="customer-orders-list">
            {paginatedOrders.map((order) => {
              const bucket = getOrderBucket(order.overallStatus);
              const subOrders = order.subOrders || [];
              const shownSubs = subOrders.slice(0, 3);
              const extraSubs = subOrders.length - shownSubs.length;
              const isCancelRequested = String(order.overallStatus || '').toLowerCase() === 'cancellation requested';

              return (
                <article
                  key={order.id}
                  onClick={() => navigate(`/customer/orders/${order.id}`)}
                  className={`customer-order-card customer-order-card--${bucket}`}
                >
                  {/* Row 1: short ID + status pill + price */}
                  <div className="customer-order-card__row1">
                    <div className="customer-order-card__id-group">
                      <h2 title={order.id}>{formatShortOrderId(order.id)}</h2>
                      <Badge
                        variant={bucket}
                        size="sm"
                        icon={<StatusIcon bucket={bucket} />}
                      >
                        {formatOrderStatusText(order.overallStatus, order.fulfillment)}
                      </Badge>
                      {isCancelRequested && (
                        <span className="customer-order-card__warn-chip">
                          Action pending
                        </span>
                      )}
                    </div>
                    <p className="customer-order-card__total">
                      {formatPeso(order.totalAmount)}
                    </p>
                  </div>

                  {/* Row 2: date/time + payment method & separate payment status */}
                  <p className="customer-order-card__meta">
                    {formatDateTimeManila(order.createdAt)} · {order.fulfillmentSummary} · Payment: {formatPaymentStatusLabel(order.paymentStatus)}
                    {order.riderFirstName ? ` · Rider: ${order.riderFirstName}` : ''}
                  </p>
                  <div
                    aria-label="Order status timeline"
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '6px 10px',
                      margin: '6px 0 8px',
                      fontSize: '11px',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    {buildOrderTimelineSteps(order).map((step, sIdx, arr) => (
                      <span
                        key={step.key}
                        style={{
                          fontWeight: step.current ? 700 : 500,
                          color: step.variant === 'error'
                            ? 'var(--status-error-text)'
                            : step.reached
                              ? 'var(--text-primary)'
                              : 'var(--text-muted)',
                        }}
                      >
                        {step.reached ? '✓ ' : ''}{step.label}
                        {step.timestamp ? ` (${formatDateTimeManila(step.timestamp)})` : ''}
                        {sIdx < arr.length - 1 ? ' →' : ''}
                      </span>
                    ))}
                  </div>
                  {order.rejectionReason && (
                    <p style={{ margin: '4px 0 8px', fontSize: 'var(--font-size-xs)', color: 'var(--status-error-text)' }}>
                      Rejection reason: {order.rejectionReason}
                    </p>
                  )}

                  {/* Row 3: sub-order chips + inline actions */}
                  <div className="customer-order-card__row3">
                    <div className="customer-order-card__suborders">
                      {shownSubs.map((sub, i) => {
                        const subBucket = getOrderBucket(sub.status || order.overallStatus);
                        return (
                          <span key={sub.id || i} className="customer-order-card__suborder">
                            <span className={`customer-order-card__subdot customer-order-card__subdot--${subBucket}`} aria-hidden="true" />
                            <span className="customer-order-card__restaurant">{sub.restaurantName}</span>
                            <span className="customer-order-card__suborder-status">{sub.status}</span>
                          </span>
                        );
                      })}
                      {extraSubs > 0 && (
                        <span className="customer-order-card__suborder customer-order-card__suborder--more">
                          +{extraSubs} more
                        </span>
                      )}
                    </div>

                    <div className="customer-order-card__actions">
                      {bucket === 'upcoming' ? (
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={(event) => {
                            event.stopPropagation();
                            navigate(`/customer/orders/${order.id}`);
                          }}
                        >
                          Track Order
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          loading={reorderingOrderId === order.id}
                          onClick={(event) => {
                            event.stopPropagation();
                            handleReorder(order);
                          }}
                        >
                          Reorder
                        </Button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          {hasMore && (
            <div className="customer-orders-load-more">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
              >
                Load more ({filteredOrders.length - visibleCount} remaining)
              </Button>
            </div>
          )}
        </>
      )}
    </CustomerLayout>
  );
}
