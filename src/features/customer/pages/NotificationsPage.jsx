import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import CustomerLayout from '../../../layouts/CustomerLayout';
import Button from '../../../components/common/Button';
import customerService from '../../../services/customerService';

const TYPE_LABELS = {
  order: 'Order update',
  reservation: 'Reservation',
  promo: 'Promotion',
  account: 'Account',
};

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadNotifications = () => {
    setLoading(true);
    try {
      const items = customerService.getNotifications();
      setNotifications(items);
    } catch (error) {
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNotifications();
  }, []);

  const handleMarkRead = (id) => {
    const updated = customerService.markNotificationRead(id);
    setNotifications(updated);
  };

  const handleClearAll = () => {
    setNotifications(customerService.clearNotifications());
  };

  return (
    <CustomerLayout>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-6)', flexWrap: 'wrap' }}>
        <div>
          <p style={{ margin: 0, fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700 }}>
            Updates & reminders
          </p>
          <h1 style={{ margin: 'var(--space-2) 0 0', fontSize: 'var(--font-size-3xl)' }}>Notifications</h1>
        </div>

        {notifications.length > 0 && (
          <Button variant="ghost" size="sm" onClick={handleClearAll}>Clear all</Button>
        )}
      </div>

      {loading ? (
        <div style={{ padding: 'var(--space-12) 0', textAlign: 'center', color: 'var(--text-muted)' }}>
          Loading notifications...
        </div>
      ) : notifications.length === 0 ? (
        <div style={{
          background: 'var(--surface-primary)',
          border: '1px solid var(--border-primary)',
          borderRadius: 'var(--radius-xl)',
          padding: 'var(--space-8)',
          textAlign: 'center',
        }}>
          <p style={{ margin: 0, fontSize: 'var(--font-size-lg)', fontWeight: 700 }}>You are all caught up.</p>
          <p style={{ margin: 'var(--space-2) 0 0', color: 'var(--text-secondary)' }}>
            New order updates, reservation alerts, and promos will appear here.
          </p>
          <Link to="/customer" style={{ textDecoration: 'none' }}>
            <Button variant="primary" size="md" style={{ marginTop: 'var(--space-4)' }}>
              Back to explore
            </Button>
          </Link>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
          {notifications.map((notification) => (
            <div key={notification.id} style={{
              background: 'var(--surface-primary)',
              border: notification.read ? '1px solid var(--border-primary)' : '1.5px solid var(--accent)',
              borderRadius: 'var(--radius-xl)',
              padding: 'var(--space-4)',
              boxShadow: 'var(--shadow-sm)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-4)', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
                    <span style={{
                      padding: 'var(--space-1) var(--space-2)',
                      borderRadius: 'var(--radius-full)',
                      background: 'var(--surface-secondary)',
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: '0.05em',
                      textTransform: 'uppercase',
                      color: 'var(--text-secondary)',
                    }}>
                      {TYPE_LABELS[notification.type] || 'Notice'}
                    </span>
                    {!notification.read && (
                      <span style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: 'var(--accent)',
                        display: 'inline-block',
                      }} />
                    )}
                  </div>

                  <h3 style={{ margin: 0, fontSize: 'var(--font-size-lg)' }}>{notification.title}</h3>
                  <p style={{ margin: 'var(--space-2) 0 0', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                    {notification.description}
                  </p>
                </div>

                <div style={{ textAlign: 'right', minWidth: 110 }}>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', marginBottom: 'var(--space-2)' }}>
                    {notification.time}
                  </div>
                  {!notification.read && (
                    <Button variant="secondary" size="sm" onClick={() => handleMarkRead(notification.id)}>
                      Mark read
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </CustomerLayout>
  );
}
