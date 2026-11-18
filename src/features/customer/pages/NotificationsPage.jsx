import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import CustomerLayout from '../../../layouts/CustomerLayout';
import Button from '../../../components/common/Button';
import { StateView } from '../../../components/feedback';
import { useWorkspaceNotifications } from '../../../hooks/useWorkspaceNotifications';
import { formatDateTimeManila } from '../../../utils/format';
import { getNotificationRoute } from '../../../utils/notificationUtils';
import './NotificationsPage.css';

function getDateBucket(notification) {
  const created = notification?.created_at;
  if (created) {
    const dt = new Date(created);
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
  return 'Earlier';
}

export default function NotificationsPage() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);

  const {
    items: notifications,
    pagination,
    workspaceUnreadCount,
    loading,
    error,
    markingAll,
    refresh,
    markAsRead,
    markAllAsRead,
  } = useWorkspaceNotifications({
    workspace: 'customer',
    unreadOnly: filter === 'unread',
    page,
    perPage: 20,
  });

  const grouped = useMemo(() => {
    const buckets = { Today: [], Yesterday: [], Earlier: [] };
    notifications.forEach((item) => {
      buckets[getDateBucket(item)].push(item);
    });
    return ['Today', 'Yesterday', 'Earlier']
      .filter((key) => buckets[key].length > 0)
      .map((key) => ({ label: key, items: buckets[key] }));
  }, [notifications]);

  const handleFilterChange = (nextFilter) => {
    if (nextFilter === filter) return;
    setFilter(nextFilter);
    setPage(1);
  };

  const handleCardClick = async (notification) => {
    if (!notification.is_read) {
      try {
        await markAsRead(notification.id);
      } catch {
        // Proceed with navigation even if mark-read fails transiently.
      }
    }
    navigate(getNotificationRoute(notification));
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
              onClick={() => handleFilterChange('all')}
            >
              All{filter === 'all' ? ` (${pagination.total})` : ''}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={filter === 'unread'}
              className={`customer-notifications-tab ${filter === 'unread' ? 'active' : ''}`}
              onClick={() => handleFilterChange('unread')}
            >
              Unread ({workspaceUnreadCount})
            </button>
          </div>

          {workspaceUnreadCount > 0 && (
            <div className="customer-notifications-actions">
              <Button
                variant="outline"
                size="sm"
                disabled={markingAll}
                onClick={() => markAllAsRead()}
              >
                {markingAll ? 'Marking…' : 'Mark all as read'}
              </Button>
            </div>
          )}
        </div>

        {loading && notifications.length === 0 ? (
          <StateView state="loading" title="Loading notifications..." />
        ) : error ? (
          <StateView
            state="error"
            title="Unable to load notifications"
            description={error.message || 'Please check your connection and try again.'}
            action={(
              <Button variant="primary" size="sm" onClick={() => refresh()}>
                Retry
              </Button>
            )}
          />
        ) : notifications.length === 0 ? (
          <StateView
            state="empty"
            title={filter === 'unread' ? 'No unread notifications' : "You're all caught up"}
            description="New order updates, staff invitations, and application updates will appear here."
            action={(
              <Link to="/customer" style={{ textDecoration: 'none' }}>
                <Button variant="primary" size="sm">Back to explore</Button>
              </Link>
            )}
          />
        ) : (
          <>
            {grouped.map((group) => (
              <section className="customer-notifications-group" key={group.label}>
                <h2 className="customer-notifications-group-title">{group.label}</h2>
                {group.items.map((notification) => (
                  <article
                    key={notification.id}
                    className={`customer-notifications-card ${notification.is_read ? '' : 'unread'}`.trim()}
                    onClick={() => handleCardClick(notification)}
                  >
                    <div className="customer-notifications-card-main">
                      <div className="customer-notifications-card-meta">
                        <span className="customer-notifications-type">
                          {notification.categoryLabel}
                        </span>
                        {!notification.is_read && <span className="customer-notifications-dot" aria-label="Unread" />}
                      </div>
                      <h3>{notification.title}</h3>
                      <p>{notification.body}</p>
                    </div>

                    <div className="customer-notifications-card-side">
                      <span className="customer-notifications-time">
                        {formatDateTimeManila(notification.created_at)}
                      </span>
                    </div>
                  </article>
                ))}
              </section>
            ))}

            {pagination.last_page > 1 && (
              <div className="customer-notifications-toolbar" style={{ marginTop: 16 }}>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pagination.current_page <= 1 || loading}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <span className="customer-notifications-time">
                  Page {pagination.current_page} of {pagination.last_page}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pagination.current_page >= pagination.last_page || loading}
                  onClick={() => setPage((p) => Math.min(pagination.last_page, p + 1))}
                >
                  Next
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </CustomerLayout>
  );
}
