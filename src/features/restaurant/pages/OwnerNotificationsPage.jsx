import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../../../components/common/Button';
import Card from '../../../components/common/Card';
import { StateView } from '../../../components/feedback';
import { useWorkspaceNotifications } from '../../../hooks/useWorkspaceNotifications';
import OwnerLayout from '../../../layouts/OwnerLayout';
import { formatDateTimeManila } from '../../../utils/format';
import { useRestaurantAccess } from '../access/useRestaurantAccess';
import {
  getNotificationRoute,
  groupNotificationsByDateManila,
  resolveNotificationRestaurantId,
} from '../../../utils/notificationUtils';

export default function OwnerNotificationsPage() {
  const navigate = useNavigate();
  const access = useRestaurantAccess();
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
    workspace: 'restaurant',
    unreadOnly: filter === 'unread',
    page,
    perPage: 20,
  });

  const grouped = useMemo(
    () => groupNotificationsByDateManila(notifications),
    [notifications],
  );

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
    const targetRestaurantId = resolveNotificationRestaurantId(notification, access.restaurants);
    if (targetRestaurantId && targetRestaurantId !== access.selectedRestaurantId) {
      try {
        access.selectRestaurant(targetRestaurantId);
      } catch {
        // Ignore if branch is not accessible
      }
    }
    navigate(getNotificationRoute(notification));
  };

  return (
    <OwnerLayout>
      <div style={{ maxWidth: 960, margin: '0 auto', padding: 'var(--space-4) 0', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 'var(--font-size-xl)' }}>Notifications</h1>
            <p style={{ margin: '4px 0 0', fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' }}>
              Order alerts, team invitation responses, and restaurant updates.
            </p>
          </div>

          {workspaceUnreadCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              disabled={markingAll}
              onClick={() => markAllAsRead()}
            >
              {markingAll ? 'Marking…' : 'Mark all as read'}
            </Button>
          )}
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }} role="tablist" aria-label="Filter restaurant notifications">
          <Button
            variant={filter === 'all' ? 'primary' : 'outline'}
            size="sm"
            role="tab"
            aria-selected={filter === 'all'}
            onClick={() => handleFilterChange('all')}
          >
            All{filter === 'all' ? ` (${pagination.total})` : ''}
          </Button>
          <Button
            variant={filter === 'unread' ? 'primary' : 'outline'}
            size="sm"
            role="tab"
            aria-selected={filter === 'unread'}
            onClick={() => handleFilterChange('unread')}
          >
            Unread ({workspaceUnreadCount})
          </Button>
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
            description="New order notifications, team updates, and restaurant alerts will appear here."
          />
        ) : (
          <>
            {grouped.map((group) => (
              <section key={group.label} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                <h2 style={{ margin: 0, fontSize: 'var(--font-size-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)' }}>
                  {group.label}
                </h2>
                <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
                  {group.items.map((notification) => (
                    <Card
                      key={notification.id}
                      style={{
                        borderLeft: notification.is_read ? undefined : '4px solid var(--accent)',
                        background: notification.is_read ? undefined : 'var(--accent-subtle)',
                      }}
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
                        style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}
                      >
                        <div style={{ minWidth: 0, flex: '1 1 240px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--text-secondary)' }}>
                              {notification.categoryLabel}
                            </span>
                            {!notification.is_read && (
                              <span
                                aria-label="Unread"
                                style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', display: 'inline-block' }}
                              />
                            )}
                          </div>
                          <strong style={{ display: 'block', color: 'var(--text-primary)' }}>{notification.title}</strong>
                          <p style={{ margin: '4px 0 0', fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' }}>
                            {notification.body}
                          </p>
                        </div>
                        <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                          {formatDateTimeManila(notification.created_at)}
                        </span>
                      </div>
                    </Card>
                  ))}
                </div>
              </section>
            ))}

            {pagination.last_page > 1 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'var(--space-2)' }}>
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
    </OwnerLayout>
  );
}
