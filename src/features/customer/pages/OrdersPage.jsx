import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import CustomerLayout from '../../../layouts/CustomerLayout';
import { useCart } from '../../../hooks/useCart';
import customerService from '../../../services/customerService';
import Button from '../../../components/common/Button';
import Badge from '../../../components/common/Badge';
import { StateView } from '../../../components/feedback';
import { formatDateTimeManila, formatPeso, formatShortOrderId } from '../../../utils/format';
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
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const rawTab = searchParams.get('tab');
  const activeTab = TABS.some((t) => t.id === rawTab) ? rawTab : 'upcoming';

  useEffect(() => {
    const refreshOrders = () => setOrders(customerService.getOrders());
    refreshOrders();
    window.addEventListener('salo:demoStoreUpdated', refreshOrders);
    return () => window.removeEventListener('salo:demoStoreUpdated', refreshOrders);
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

  const handleReorder = (order) => {
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

      {filteredOrders.length === 0 ? (
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
                        {order.overallStatus}
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

                  {/* Row 2: date/time + payment method */}
                  <p className="customer-order-card__meta">
                    {formatDateTimeManila(order.createdAt)} · {order.paymentMethod || 'Cash on Delivery'}
                  </p>

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
