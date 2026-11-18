import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Popover from '../../../components/common/Popover';
import { useWorkspaceNotifications } from '../../../hooks/useWorkspaceNotifications';
import { formatDateTimeManila } from '../../../utils/format';
import { getNotificationRoute } from '../../../utils/notificationUtils';

export default function RiderNotificationsMenu() {
  const navigate = useNavigate();
  const bellRef = useRef(null);
  const [open, setOpen] = useState(false);

  const {
    items,
    workspaceUnreadCount,
    loading,
    error,
    markingAll,
    refresh,
    markAsRead,
    markAllAsRead,
  } = useWorkspaceNotifications({
    workspace: 'rider',
    perPage: 8,
  });

  const latestEight = items.slice(0, 8);

  const handleItemClick = async (item) => {
    setOpen(false);
    if (!item.is_read) {
      try {
        await markAsRead(item.id);
      } catch {
        // Proceed with navigation even if mark-read fails transiently.
      }
    }
    navigate(getNotificationRoute(item));
  };

  return (
    <>
      <button
        ref={bellRef}
        type="button"
        className="topbar-btn"
        aria-label={`Notifications${workspaceUnreadCount ? ` (${workspaceUnreadCount} unread)` : ''}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Notifications"
        onClick={() => setOpen((prev) => !prev)}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
          <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 01-3.46 0" />
        </svg>
        {workspaceUnreadCount > 0 && (
          <span className="topbar-notification-dot" aria-hidden="true">
            {workspaceUnreadCount > 9 ? '9+' : workspaceUnreadCount}
          </span>
        )}
      </button>

      <Popover
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={bellRef}
        label="Rider notifications"
        width={360}
        header={(
          <>
            <strong style={{ fontSize: 'var(--font-size-sm)' }}>Notifications</strong>
            <button
              type="button"
              className="topbar-btn"
              style={{ width: 'auto', height: 'auto', padding: '4px 8px', fontSize: 'var(--font-size-xs)', color: 'var(--accent)' }}
              disabled={workspaceUnreadCount === 0 || markingAll}
              onClick={() => markAllAsRead()}
            >
              {markingAll ? 'Marking…' : 'Mark all as read'}
            </button>
          </>
        )}
        footer={(
          <Link
            to="/rider/notifications"
            style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--accent)', textDecoration: 'none' }}
            onClick={() => setOpen(false)}
          >
            View all
          </Link>
        )}
      >
        {loading && latestEight.length === 0 ? (
          <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' }}>
            Loading notifications…
          </div>
        ) : error ? (
          <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' }}>
            <p style={{ margin: '0 0 8px' }}>{error.message || 'Unable to load notifications.'}</p>
            <button
              type="button"
              className="topbar-btn"
              style={{ width: 'auto', height: 'auto', padding: '4px 10px', fontSize: 'var(--font-size-xs)', color: 'var(--accent)' }}
              onClick={() => refresh()}
            >
              Retry
            </button>
          </div>
        ) : latestEight.length === 0 ? (
          <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' }}>
            You&apos;re all caught up
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {latestEight.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleItemClick(item)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  width: '100%',
                  padding: '10px 14px',
                  border: 0,
                  borderBottom: '1px solid var(--border-secondary)',
                  background: item.is_read ? 'transparent' : 'var(--accent-subtle)',
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)', color: 'var(--text-primary)' }}>
                    {item.title}
                  </span>
                  {!item.is_read && (
                    <span
                      aria-label="Unread"
                      style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }}
                    />
                  )}
                </div>
                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
                  {item.body}
                </span>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  {formatDateTimeManila(item.created_at)}
                </span>
              </button>
            ))}
          </div>
        )}
      </Popover>
    </>
  );
}
