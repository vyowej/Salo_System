import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { hasAdminPermission } from '../constants';
import { useAdminNotifications } from '../contexts/useAdminNotifications';
import { useAdminSearch } from '../contexts/useAdminSearch';
import { formatRelativeTime } from '../services/notificationsService';

const NOTIFICATION_ICONS = {
  applications: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  disputes: 'M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z',
  support: 'M4 4h16v12H8l-4 4V4zm4 5h8m-8 3h5',
  finance: 'M12 2v20m5-15H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6',
  system: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
};

export default function AdminTopbar({
  title,
  currentAdmin,
  mobileMenuOpen,
  onMenuToggle,
  onLogout,
}) {
  const navigate = useNavigate();
  const { rawQuery, setQuery, clearQuery, config } = useAdminSearch();
  const {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    pendingApplicationsCount,
  } = useAdminNotifications();

  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const searchInputRef = useRef(null);
  const notifRef = useRef(null);
  const profileRef = useRef(null);

  const searchDisabled = !config || Boolean(config.disabled);
  const searchPlaceholder = searchDisabled
    ? 'Search is not available on this page'
    : (config.placeholder || 'Search records');

  const canViewApplications = hasAdminPermission(currentAdmin.role, 'applications', 'view');
  const canViewSupport = hasAdminPermission(currentAdmin.role, 'support', 'view');
  const canViewSettings = hasAdminPermission(currentAdmin.role, 'settings', 'view');
  const canViewAdmins = hasAdminPermission(currentAdmin.role, 'administrators', 'view');
  const canViewActivity = hasAdminPermission(currentAdmin.role, 'activity', 'view');

  const initials = useMemo(() => (
    (currentAdmin.name || 'A')
      .split(/\s+/)
      .map((part) => part[0])
      .slice(0, 2)
      .join('')
      .toUpperCase()
  ), [currentAdmin.name]);

  // Keyboard shortcut "/" focuses search bar when not typing in an input
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target;
      const tag = target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable) {
        return;
      }
      if (!searchDisabled && searchInputRef.current) {
        event.preventDefault();
        searchInputRef.current.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [searchDisabled]);

  // Close dropdowns on outside click and Escape
  useEffect(() => {
    if (!notifOpen && !profileOpen) return undefined;

    const handleMouseDown = (event) => {
      if (notifOpen && notifRef.current && !notifRef.current.contains(event.target)) {
        setNotifOpen(false);
      }
      if (profileOpen && profileRef.current && !profileRef.current.contains(event.target)) {
        setProfileOpen(false);
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setNotifOpen(false);
        setProfileOpen(false);
      }
    };

    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [notifOpen, profileOpen]);

  // Max 8 notifications grouped by type
  const groupedNotifications = useMemo(() => {
    const sliced = notifications.slice(0, 8);
    const groups = new Map();
    for (const item of sliced) {
      if (!groups.has(item.groupLabel)) groups.set(item.groupLabel, []);
      groups.get(item.groupLabel).push(item);
    }
    return Array.from(groups.entries()).map(([label, items]) => ({ label, items }));
  }, [notifications]);

  const profileDestination = canViewAdmins && currentAdmin.id && !String(currentAdmin.id).startsWith('session-')
    ? `/admin/administrators/${currentAdmin.id}`
    : (canViewSettings ? '/admin/settings' : '/admin');

  return (
    <header className="admin-topbar">
      <div className="admin-topbar__left">
        <button
          type="button"
          className="admin-topbar__hamburger"
          onClick={onMenuToggle}
          aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
          aria-expanded={mobileMenuOpen}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <h1 className="admin-topbar__title">{title}</h1>
      </div>

      <div className="admin-topbar__search">
        <div className={`admin-search-box ${searchDisabled ? 'is-disabled' : ''}`}>
          <svg className="admin-search-box__icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          {!searchDisabled && config?.scopeLabel && (
            <span className="admin-search-box__scope" aria-hidden="true">
              Searching in {config.scopeLabel}
            </span>
          )}
          <input
            ref={searchInputRef}
            type="search"
            className="admin-search-box__input"
            value={rawQuery}
            disabled={searchDisabled}
            placeholder={searchPlaceholder}
            aria-label={searchDisabled ? 'Search unavailable on this page' : `Searching in ${config?.scopeLabel || 'current page'}: ${searchPlaceholder}`}
            onChange={(event) => setQuery(event.target.value)}
          />
          {!searchDisabled && rawQuery && (
            <button
              type="button"
              className="admin-search-box__clear"
              onClick={() => {
                clearQuery();
                searchInputRef.current?.focus();
              }}
              aria-label="Clear search"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className="admin-topbar__right">
        {canViewApplications && (
          <Link
            to="/admin/applications"
            className="admin-topbar__apps-btn"
            aria-label={`Applications (${pendingApplicationsCount} pending)`}
          >
            <span>Applications</span>
            {pendingApplicationsCount > 0 && (
              <span className="admin-topbar__pill-badge">{pendingApplicationsCount}</span>
            )}
          </Link>
        )}

        <div className="admin-topbar__dropdown-wrap" ref={notifRef}>
          <button
            type="button"
            className="admin-topbar__icon-btn"
            aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
            aria-expanded={notifOpen}
            aria-haspopup="true"
            onClick={() => {
              setNotifOpen((prev) => !prev);
              setProfileOpen(false);
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
              <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 01-3.46 0" />
            </svg>
            {unreadCount > 0 && (
              <span className="admin-topbar__count-badge" aria-hidden="true">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {notifOpen && (
            <div className="admin-topbar-popover admin-notif-popover" role="region" aria-label="Notifications">
              <div className="admin-topbar-popover__header">
                <strong>Notifications</strong>
                {unreadCount > 0 && (
                  <button
                    type="button"
                    className="admin-topbar-popover__action"
                    onClick={markAllAsRead}
                  >
                    Mark all as read
                  </button>
                )}
              </div>

              <div className="admin-notif-popover__list">
                {groupedNotifications.length === 0 ? (
                  <p className="admin-notif-popover__empty">No notifications right now.</p>
                ) : (
                  groupedNotifications.map((group) => (
                    <div key={group.label} className="admin-notif-group">
                      <div className="admin-notif-group__label">{group.label}</div>
                      {group.items.map((item) => (
                        <Link
                          key={item.id}
                          to={item.href}
                          className={`admin-notif-item ${item.read ? 'is-read' : ''}`}
                          onClick={() => {
                            markAsRead(item.id);
                            setNotifOpen(false);
                          }}
                        >
                          <span className="admin-notif-item__icon" aria-hidden="true">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d={NOTIFICATION_ICONS[item.type] || NOTIFICATION_ICONS.system} />
                            </svg>
                          </span>
                          <span className="admin-notif-item__body">
                            <span className="admin-notif-item__text">{item.text}</span>
                            <span className="admin-notif-item__time">{formatRelativeTime(item.time)}</span>
                          </span>
                        </Link>
                      ))}
                    </div>
                  ))
                )}
              </div>

              <div className="admin-topbar-popover__footer">
                <button
                  type="button"
                  className="admin-topbar-popover__view-all"
                  onClick={() => {
                    setNotifOpen(false);
                    navigate(canViewActivity ? '/admin/activity' : (canViewSupport ? '/admin/support' : '/admin'));
                  }}
                >
                  View all
                </button>
              </div>
            </div>
          )}
        </div>

        {canViewSupport && (
          <Link
            to="/admin/support"
            className="admin-topbar__icon-btn"
            aria-label="Help and Support"
            title="Support and Complaints"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </Link>
        )}

        <div className="admin-topbar__dropdown-wrap" ref={profileRef}>
          <button
            type="button"
            className={`admin-topbar__avatar-btn ${profileOpen ? 'is-open' : ''}`}
            aria-label={`${currentAdmin.name} account menu`}
            aria-expanded={profileOpen}
            aria-haspopup="menu"
            onClick={() => {
              setProfileOpen((prev) => !prev);
              setNotifOpen(false);
            }}
          >
            <span aria-hidden="true">{initials}</span>
          </button>

          {profileOpen && (
            <div className="admin-topbar-popover admin-profile-popover" role="menu" aria-label="Account menu">
              <div className="admin-profile-popover__header">
                <span className="admin-profile-popover__avatar" aria-hidden="true">{initials}</span>
                <div className="admin-profile-popover__meta">
                  <strong className="admin-profile-popover__name">{currentAdmin.name}</strong>
                  <span className="admin-profile-popover__email">{currentAdmin.email}</span>
                  <span className="admin-profile-popover__role">{currentAdmin.role}</span>
                </div>
              </div>
              <div className="admin-profile-popover__menu">
                <Link
                  to={profileDestination}
                  role="menuitem"
                  className="admin-profile-popover__item"
                  onClick={() => setProfileOpen(false)}
                >
                  My Profile
                </Link>
                {canViewSettings && (
                  <Link
                    to="/admin/settings"
                    role="menuitem"
                    className="admin-profile-popover__item"
                    onClick={() => setProfileOpen(false)}
                  >
                    Settings
                  </Link>
                )}
                <button
                  type="button"
                  role="menuitem"
                  className="admin-profile-popover__item is-danger"
                  onClick={() => {
                    setProfileOpen(false);
                    onLogout();
                  }}
                >
                  Log out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
