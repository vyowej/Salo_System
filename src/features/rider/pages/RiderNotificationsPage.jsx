import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../../../components/common/Button';
import Card from '../../../components/common/Card';
import { StateView as GlobalStateView } from '../../../components/feedback';
import { useWorkspaceNotifications } from '../../../hooks/useWorkspaceNotifications';
import { formatDateTimeManila } from '../../../utils/format';
import { getNotificationRoute } from '../../../utils/notificationUtils';
import PageHeader from '../components/PageHeader';
import './RiderNotificationsPage.css';

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

export default function RiderNotificationsPage() {
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
    workspace: 'rider',
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

  const handleNotificationClick = async (notification) => {
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
    <div className="rider-page-shell">
      <PageHeader
        title="Notifications"
        subtitle="Dispatch alerts and rider account updates."
        eyebrow="Updates"
        actions={workspaceUnreadCount > 0 ? (
          <Button
            variant="outline"
            size="sm"
            disabled={markingAll}
            onClick={() => markAllAsRead()}
          >
            {markingAll ? 'Marking…' : 'Mark all as read'}
          </Button>
        ) : null}
      />

      <div className="rider-notification-filters" role="tablist" aria-label="Filter rider notifications">
        <button
          type="button"
          role="tab"
          aria-selected={filter === 'all'}
          className={filter === 'all' ? 'is-selected' : ''}
          onClick={() => handleFilterChange('all')}
        >
          All{filter === 'all' ? ` (${pagination.total})` : ''}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={filter === 'unread'}
          className={filter === 'unread' ? 'is-selected' : ''}
          onClick={() => handleFilterChange('unread')}
        >
          Unread ({workspaceUnreadCount})
        </button>
      </div>

      {loading && notifications.length === 0 ? (
        <GlobalStateView state="loading" title="Loading notifications..." />
      ) : error ? (
        <GlobalStateView
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
        <GlobalStateView
          state="empty"
          title={filter === 'unread' ? 'No unread notifications' : 'No notifications yet'}
          description="Rider approval, activation, and account updates will appear here."
        />
      ) : (
        <>
          {grouped.map((group) => (
            <section key={group.label} style={{ marginBottom: 'var(--space-4)' }}>
              <h2 style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)', marginBottom: 'var(--space-2)' }}>
                {group.label}
              </h2>
              <div className="rider-notification-list">
                {group.items.map((notification) => (
                  <Card
                    key={notification.id}
                    className={`rider-notification-card ${notification.is_read ? '' : 'is-unread'}`.trim()}
                  >
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => handleNotificationClick(notification)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          handleNotificationClick(notification);
                        }
                      }}
                      style={{ cursor: 'pointer', display: 'contents' }}
                    >
                      <span className="rider-notification-type">
                        {notification.categoryLabel}
                      </span>
                      <div className="rider-notification-copy">
                        <div className="rider-notification-title-row">
                          <strong>{notification.title}</strong>
                          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>
                            {formatDateTimeManila(notification.created_at)}
                          </span>
                        </div>
                        <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                          {notification.body}
                        </p>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </section>
          ))}

          {pagination.last_page > 1 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'var(--space-4)' }}>
              <Button
                variant="outline"
                size="sm"
                disabled={pagination.current_page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
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
  );
}
