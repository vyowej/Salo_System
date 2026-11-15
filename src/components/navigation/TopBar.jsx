import { Link, useLocation } from 'react-router-dom';
import ThemeToggle from './ThemeToggle';
import BrandMark from '../common/BrandMark';
import { resolveTopbarTitle } from '../../config/navigationConfig';
import './TopBar.css';

/**
 * Unified SALO TopBar shared across Customer, Restaurant Owner, Rider, and Admin.
 */
export default function TopBar({
  search,
  actions,
  notificationsSlot,
  showNotifications = true,
  notificationCount = 0,
  notificationsHref = '/customer/notifications',
  headingPrefix,
  headingExtras,
  roleLabel,
  roleTone = 'orange',
  onMenuToggle,
  mobileMenuOpen = false,
  title,
  children,
  showThemeToggle = true,
  profileButton,
}) {
  const { pathname } = useLocation();
  const pageTitle = title || resolveTopbarTitle(pathname);

  return (
    <header className="topbar">
      <div className="topbar-heading">
        {onMenuToggle && (
          <button
            className="topbar-hamburger"
            onClick={onMenuToggle}
            aria-label={mobileMenuOpen ? 'Close navigation' : 'Toggle navigation'}
            aria-expanded={mobileMenuOpen}
            type="button"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
        )}

        {!mobileMenuOpen && (
          <span className="topbar-mobile-brand" aria-hidden="true">
            <BrandMark size="sm" showText={false} />
          </span>
        )}

        {headingPrefix}
        <h1 className="topbar-title">{pageTitle}</h1>
        {roleLabel && (
          <span className={`topbar-role-chip tone-${roleTone}`}>
            {roleLabel}
          </span>
        )}
        {headingExtras}
      </div>

      {search && <div className="topbar-search">{search}</div>}

      <div className="topbar-actions">
        {children}
        {actions}

        {notificationsSlot || (showNotifications && (
          <Link
            to={notificationsHref}
            className="topbar-btn"
            aria-label={`Notifications${notificationCount ? ` (${notificationCount})` : ''}`}
            title="View notifications"
            style={{ textDecoration: 'none' }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
              <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 01-3.46 0" />
            </svg>
            {notificationCount > 0 && (
              <span className="topbar-notification-dot" aria-hidden="true">
                {notificationCount > 9 ? '9+' : notificationCount}
              </span>
            )}
          </Link>
        ))}

        {showThemeToggle && <ThemeToggle />}

        {profileButton && <div className="topbar-profile-slot">{profileButton}</div>}
      </div>
    </header>
  );
}
