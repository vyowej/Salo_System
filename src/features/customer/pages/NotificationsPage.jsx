import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import CustomerLayout from '../../../layouts/CustomerLayout';
import Button from '../../../components/common/Button';
import { StateView } from '../../../components/feedback';
import { getNotificationTarget } from '../../../utils/format';
import customerService from '../../../services/customerService';
import './NotificationsPage.css';

const TYPE_LABELS = {
  order: 'Order update',
  reservation: 'Reservation',
  invitation: 'Invitation',
  promo: 'Promotion',
  account: 'Account',
  system: 'System',
};

function getDateBucket(notification) {
  if (notification.createdAt) {
    const dt = new Date(notification.createdAt);
    if (!Number.isNaN(dt.getTime())) {
      const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' });
      const todayKey = fmt.format(new Date());
      const yestKey = fmt.format(new Date(Date.now() - 86400000));
      const itemKey = fmt.format(dt);
      if (itemKey === todayKey) return 'Today';
      if (itemKey === yestKey) return 'Yesterday';
      return 'Earlier';
    }
  }
  const timeText = String(notification.time || '').toLowerCase();
  if (timeText.includes('today') || timeText.includes('minute') || timeText.includes('hour')) return 'Today';
  if (timeText.includes('yesterday')) return 'Yesterday';
  return 'Earlier';
}

export default function NotificationsPage() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    const sync = () => {
      try {
        setNotifications(customerService.getNotifications());
      } catch {
        setNotifications([]);
      } finally {
        setLoading(false);
      }
    };
    sync();
    window.addEventListener('salo:notificationsUpdated', sync);
    window.addEventListener('salo:demoStoreUpdated', sync);
    return () => {
      window.removeEventListener('salo:notificationsUpdated', sync);
      window.removeEventListener('salo:demoStoreUpdated', sync);
    };
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;
  const visible = useMemo(
    () => (filter === 'unread' ? notifications.filter((n) => !n.read) : notifications),
    [notifications, filter],
  );

  const grouped = useMemo(() => {
    const buckets = { Today: [], Yesterday: [], Earlier: [] };
    visible.forEach((item) => {
      buckets[getDateBucket(item)].push(item);
    });
    return ['Today', 'Yesterday', 'Earlier']
      .filter((key) => buckets[key].length > 0)
      .map((key) => ({ label: key, items: buckets[key] }));
  }, [visible]);

  const handleCardClick = (notification) => {
    if (!notification.read) {
      customerService.markNotificationRead(notification.id);
    }
    navigate(getNotificationTarget(notification));
  };

  return (
    <CustomerLayout>
      <div className="customer-notifications-page">
        <div className="customer-notifications-toolbar">
          <div className="customer-notifications-filters" role="tablist" aria-label="Filter notifications">
            <button
              type="button"
              role="tab"
              aria-selected={filter === 'all'}
              className={`customer-notifications-tab ${filter === 'all' ? 'active' : ''}`}
              onClick={() => setFilter('all')}
            >
              All ({notifications.length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={filter === 'unread'}
              className={`customer-notifications-tab ${filter === 'unread' ? 'active' : ''}`}
              onClick={() => setFilter('unread')}
            >
              Unread ({unreadCount})
            </button>
          </div>

          {notifications.length > 0 && (
            <div className="customer-notifications-actions">
              <Button
                variant="outline"
                size="sm"
                disabled={unreadCount === 0}
                onClick={() => customerService.markAllNotificationsRead()}
              >
                Mark all as read
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => customerService.clearNotifications()}
              >
                Clear all
              </Button>
            </div>
          )}
        </div>

        {loading ? (
          <StateView state="loading" title="Loading notifications..." />
        ) : visible.length === 0 ? (
          <StateView
            state="empty"
            title={filter === 'unread' ? 'No unread notifications' : "You're all caught up"}
            description="New order updates, reservation alerts, invitations, and promos will appear here."
            action={(
              <Link to="/customer" style={{ textDecoration: 'none' }}>
                <Button variant="primary" size="sm">Back to explore</Button>
              </Link>
            )}
          />
        ) : (
          grouped.map((group) => (
            <section className="customer-notifications-group" key={group.label}>
              <h2 className="customer-notifications-group-title">{group.label}</h2>
              {group.items.map((notification) => (
                <article
                  key={notification.id}
                  className={`customer-notifications-card ${notification.read ? '' : 'unread'}`.trim()}
                  onClick={() => handleCardClick(notification)}
                >
                  <div className="customer-notifications-card-main">
                    <div className="customer-notifications-card-meta">
                      <span className="customer-notifications-type">
                        {TYPE_LABELS[notification.type] || 'Notice'}
                      </span>
                      {!notification.read && <span className="customer-notifications-dot" aria-label="Unread" />}
                    </div>
                    <h3>{notification.title}</h3>
                    <p>{notification.description}</p>
                  </div>

                  <div className="customer-notifications-card-side">
                    <span className="customer-notifications-time">{notification.time}</span>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={(event) => {
                        event.stopPropagation();
                        if (notification.read) {
                          customerService.markNotificationUnread(notification.id);
                        } else {
                          customerService.markNotificationRead(notification.id);
                        }
                      }}
                    >
                      {notification.read ? 'Mark as unread' : 'Mark as read'}
                    </Button>
                  </div>
                </article>
              ))}
            </section>
          ))
        )}
      </div>
    </CustomerLayout>
  );
}
