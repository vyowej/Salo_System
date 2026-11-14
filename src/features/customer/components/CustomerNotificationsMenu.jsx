import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Popover from '../../../components/common/Popover';
import { getNotificationTarget } from '../../../utils/format';
import customerService from '../../../services/customerService';
import './CustomerNotificationsMenu.css';

function renderTypeIcon(type) {
  switch (type) {
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
    case 'promo':
      return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" />
          <line x1="7" y1="7" x2="7.01" y2="7" />
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
  const [notifications, setNotifications] = useState(() => customerService.getNotifications());

  useEffect(() => {
    const sync = () => setNotifications(customerService.getNotifications());
    sync();
    window.addEventListener('salo:notificationsUpdated', sync);
    window.addEventListener('salo:demoStoreUpdated', sync);
    return () => {
      window.removeEventListener('salo:notificationsUpdated', sync);
      window.removeEventListener('salo:demoStoreUpdated', sync);
    };
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;
  const latestEight = notifications.slice(0, 8);

  const handleItemClick = (item) => {
    if (!item.read) {
      customerService.markNotificationRead(item.id);
    }
    setOpen(false);
    navigate(getNotificationTarget(item));
  };

  return (
    <>
      <button
        ref={bellRef}
        type="button"
        className="topbar-btn"
        aria-label={`Notifications${unreadCount ? ` (${unreadCount} unread)` : ''}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Notifications"
        onClick={() => setOpen((prev) => !prev)}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
          <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 01-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="topbar-notification-dot" aria-hidden="true">
            {unreadCount > 9 ? '9+' : unreadCount}
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
              disabled={unreadCount === 0}
              onClick={() => customerService.markAllNotificationsRead()}
            >
              Mark all as read
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
        {latestEight.length === 0 ? (
          <div className="customer-notif-empty">You&apos;re all caught up</div>
        ) : (
          <div className="customer-notif-list">
            {latestEight.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`customer-notif-item ${item.read ? '' : 'unread'}`.trim()}
                onClick={() => handleItemClick(item)}
              >
                <span className="customer-notif-icon">{renderTypeIcon(item.type)}</span>
                <span className="customer-notif-copy">
                  <span className="customer-notif-title-row">
                    <span className="customer-notif-title">{item.title}</span>
                    {!item.read && <span className="customer-notif-dot" aria-label="Unread" />}
                  </span>
                  <p className="customer-notif-desc">{item.description}</p>
                  <span className="customer-notif-time">{item.time}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </Popover>
    </>
  );
}
