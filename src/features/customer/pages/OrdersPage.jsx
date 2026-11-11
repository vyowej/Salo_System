import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import CustomerLayout from '../../../layouts/CustomerLayout';
import { useCart } from '../../../hooks/useCart';
import customerService from '../../../services/customerService';
import Button from '../../../components/common/Button';
import Badge from '../../../components/common/Badge';
import './CustomerRecords.css';

export default function OrdersPage() {
  const navigate = useNavigate();
  const { addItem, setRestaurantFulfillment, setRestaurantAddress } = useCart();
  const [orders, setOrders] = useState([]);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    const refreshOrders = () => setOrders(customerService.getOrders());
    refreshOrders();
    window.addEventListener('salo:demoStoreUpdated', refreshOrders);
    return () => window.removeEventListener('salo:demoStoreUpdated', refreshOrders);
  }, []);

  const filteredOrders = orders.filter((o) => {
    if (filter === 'active') return !['Completed', 'Cancelled', 'Rejected', 'Partially Completed'].includes(o.overallStatus);
    if (filter === 'completed') return o.overallStatus === 'Completed';
    if (filter === 'cancelled') return o.overallStatus === 'Cancelled';
    return true;
  });

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
      {/* Filter Tabs */}
      <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-6)' }}>
        {[
          { id: 'all', label: 'All Orders' },
          { id: 'active', label: 'Active in Progress' },
          { id: 'completed', label: 'Completed' },
          { id: 'cancelled', label: 'Cancelled' },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setFilter(tab.id)}
            style={{
              padding: '6px 14px',
              borderRadius: 'var(--radius-full)',
              border: filter === tab.id ? '1.5px solid var(--accent)' : '1px solid var(--border-primary)',
              background: filter === tab.id ? 'var(--accent)' : 'var(--surface-primary)',
              color: filter === tab.id ? '#fff' : 'var(--text-secondary)',
              fontSize: 'var(--font-size-xs)',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {filteredOrders.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: 'var(--space-12) 0',
          background: 'var(--surface-primary)',
          borderRadius: 'var(--radius-xl)',
          border: '1px solid var(--border-primary)',
        }}>
          <p style={{ color: 'var(--text-muted)', marginBottom: 'var(--space-4)' }}>No orders found matching this filter.</p>
          <Link to="/customer/restaurants" style={{ textDecoration: 'none' }}>
            <Button variant="primary" size="md">
              Order Food Now
            </Button>
          </Link>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {filteredOrders.map((order) => (
            <article
              key={order.id}
              onClick={() => navigate(`/customer/orders/${order.id}`)}
              className="customer-order-card brand-card brand-card--orange brand-card--interactive"
            >
              <div className="customer-order-card__heading">
                <div>
                  <div className="customer-order-card__title-row">
                    <h2>
                      Order #{order.id}
                    </h2>
                    <Badge variant={order.overallStatus === 'Completed' ? 'success' : ['Cancelled', 'Rejected'].includes(order.overallStatus) ? 'error' : order.overallStatus === 'Cancellation Requested' || order.overallStatus === 'Partially Completed' ? 'warning' : 'primary'} dot size="sm">
                      {order.overallStatus}
                    </Badge>
                  </div>
                  <p className="customer-order-card__meta">
                    Placed on {order.createdAt} · {order.paymentMethod}
                  </p>
                </div>

                <div className="customer-order-card__actions">
                  <p className="customer-order-card__total">
                    ₱{order.totalAmount?.toLocaleString()}
                  </p>
                  <div className="customer-order-card__action-links">
                    <span>
                      Track Order →
                    </span>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleReorder(order);
                      }}
                    >
                      Reorder
                    </Button>
                  </div>
                </div>
              </div>

              {/* Sub-orders summary badges */}
              <div className="customer-order-card__suborders">
                {order.subOrders?.map((sub, i) => (
                  <div
                    key={sub.id || i}
                    className="customer-order-card__suborder"
                  >
                    <span className="customer-order-card__restaurant">{sub.restaurantName}</span>
                    <span className="customer-order-card__separator">•</span>
                    <span className="customer-order-card__suborder-status">{sub.status}</span>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}
    </CustomerLayout>
  );
}
