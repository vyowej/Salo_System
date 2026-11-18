import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Popover from '../../../components/common/Popover';
import { useWorkspaceNotifications } from '../../../hooks/useWorkspaceNotifications';
import { formatDateTimeManila } from '../../../utils/format';
import { getNotificationRoute } from '../../../utils/notificationUtils';
import './CustomerNotificationsMenu.css';

function renderTypeIcon(category) {
  switch (category) {
    case 'order':
      return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" />
          <line x1="3" y1="6" x2="21" y2="6" />
        </svg>
      );
    case 'reservation':
      return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      );
    case 'invitation':
      return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
          <polyline points="22,6 12,13 2,6" />
        </svg>
      );
    case 'application':
    case 'rider':
      return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
        </svg>
      );
    default:
      return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
      );
  }
}

export default function CustomerNotificationsMenu() {
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
    workspace: 'customer',
    perPage: 8,
  });

  const latestEight = items.slice(0, 8);

  const handleItemClick = async (item) => {
    setOpen(false);
    if (!item.is_read) {
      try {
        await markAsRead(item.id);
      } catch {
        // Navigation still proceeds if mark-read fails transiently.
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
        label="Notifications"
        width={360}
        header={(
          <>
            <h2 className="customer-notif-header-title">Notifications</h2>
            <button
              type="button"
              className="customer-notif-mark-all"
              disabled={workspaceUnreadCount === 0 || markingAll}
              onClick={() => markAllAsRead()}
            >
              {markingAll ? 'Marking…' : 'Mark all as read'}
            </button>
          </>
        )}
        footer={(
          <Link
            to="/customer/notifications"
            className="customer-notif-view-all"
            onClick={() => setOpen(false)}
          >
            View all
          </Link>
        )}
      >
        {loading && latestEight.length === 0 ? (
          <div className="customer-notif-empty">Loading notifications…</div>
        ) : error ? (
          <div className="customer-notif-empty">
            <p style={{ margin: '0 0 8px' }}>{error.message || 'Unable to load notifications.'}</p>
            <button
              type="button"
              className="customer-notif-mark-all"
              onClick={() => refresh()}
            >
              Retry
            </button>
          </div>
        ) : latestEight.length === 0 ? (
          <div className="customer-notif-empty">You&apos;re all caught up</div>
        ) : (
          <div className="customer-notif-list">
            {latestEight.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`customer-notif-item ${item.is_read ? '' : 'unread'}`.trim()}
                onClick={() => handleItemClick(item)}
              >
                <span className="customer-notif-icon">{renderTypeIcon(item.category)}</span>
                <span className="customer-notif-copy">
                  <span className="customer-notif-title-row">
                    <span className="customer-notif-title">{item.title}</span>
                    {!item.is_read && <span className="customer-notif-dot" aria-label="Unread" />}
                  </span>
                  <p className="customer-notif-desc">{item.body}</p>
                  <span className="customer-notif-time">{formatDateTimeManila(item.created_at)}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </Popover>
    </>
  );
}
