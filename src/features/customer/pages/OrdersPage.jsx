import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import CustomerLayout from '../../../layouts/CustomerLayout';
import customerService from '../../../services/customerService';
import Button from '../../../components/common/Button';
import Badge from '../../../components/common/Badge';

export default function OrdersPage() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    setOrders(customerService.getOrders());
  }, []);

  const filteredOrders = orders.filter((o) => {
    if (filter === 'active') return o.overallStatus !== 'Completed' && o.overallStatus !== 'Cancelled';
    if (filter === 'completed') return o.overallStatus === 'Completed';
    if (filter === 'cancelled') return o.overallStatus === 'Cancelled';
    return true;
  });

  return (
    <CustomerLayout>
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Customer Activity
        </span>
        <h1 className="page-title" style={{ fontSize: 'var(--font-size-2xl)' }}>
          My Order History
        </h1>
        <p className="page-subtitle">
          Monitor your active multi-restaurant deliveries and past meal orders.
        </p>
      </div>

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
            <div
              key={order.id}
              onClick={() => navigate(`/customer/orders/${order.id}`)}
              style={{
                background: 'var(--surface-primary)',
                border: '1px solid var(--border-primary)',
                borderRadius: 'var(--radius-xl)',
                padding: 'var(--space-5)',
                cursor: 'pointer',
                transition: 'border-color var(--transition-fast), transform var(--transition-fast)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--accent)';
                e.currentTarget.style.transform = 'translateY(-1px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border-primary)';
                e.currentTarget.style.transform = 'none';
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 2 }}>
                    <h2 style={{ fontSize: 'var(--font-size-md)', fontWeight: 700, color: 'var(--text-primary)' }}>
                      Order #{order.id}
                    </h2>
                    <Badge variant={order.overallStatus === 'Completed' ? 'success' : order.overallStatus === 'Cancelled' ? 'error' : 'primary'} dot size="sm">
                      {order.overallStatus}
                    </Badge>
                  </div>
                  <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>
                    Placed on {order.createdAt} · {order.paymentMethod}
                  </p>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontSize: 'var(--font-size-lg)', fontWeight: 700, color: 'var(--text-primary)' }}>
                    ₱{order.totalAmount?.toLocaleString()}
                  </p>
                  <span style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600 }}>
                    Track Order →
                  </span>
                </div>
              </div>

              {/* Sub-orders summary badges */}
              <div style={{
                marginTop: 'var(--space-4)',
                paddingTop: 'var(--space-3)',
                borderTop: '1px solid var(--border-secondary)',
                display: 'flex',
                gap: 'var(--space-3)',
                flexWrap: 'wrap',
              }}>
                {order.subOrders?.map((sub, i) => (
                  <div
                    key={sub.id || i}
                    style={{
                      background: 'var(--surface-secondary)',
                      borderRadius: 'var(--radius-md)',
                      padding: '4px 10px',
                      fontSize: 11,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <span style={{ fontWeight: 600 }}>{sub.restaurantName}</span>
                    <span style={{ color: 'var(--text-muted)' }}>•</span>
                    <span style={{ color: 'var(--text-secondary)' }}>{sub.status}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </CustomerLayout>
  );
}
