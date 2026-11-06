import { Link, useLocation } from 'react-router-dom';
import ThemeToggle from './ThemeToggle';
import BrandMark from '../common/BrandMark';
import './TopBar.css';

const PAGE_TITLES = {
  '/customer': 'Explore & Feed',
  '/customer/restaurants': 'All Restaurants',
  '/customer/cart': 'Multi-Cart',
  '/customer/checkout': 'Checkout',
  '/customer/orders': 'My Orders',
  '/customer/favorites': 'Favorites',
  '/customer/notifications': 'Notifications',
  '/customer/reservations': 'Table Bookings',
  '/customer/addresses': 'Saved Addresses',
  '/customer/partner': 'Become a Partner',
  '/customer/profile': 'Profile Settings',
  '/owner': 'Dashboard',
  '/owner/orders': 'Live Orders',
  '/owner/menu': 'Menu Management',
  '/owner/reservations': 'Reservations',
  '/owner/earnings': 'Earnings',
  '/owner/profile': 'Restaurant Profile',
  '/rider': 'Dashboard',
  '/rider/active': 'Active Delivery',
  '/rider/jobs': 'Available Jobs',
  '/rider/history': 'Delivery History',
  '/rider/earnings': 'Earnings & Cash',
  '/rider/profile': 'Rider Profile',
  '/admin': 'Platform Overview',
  '/admin/restaurants': 'Restaurants & Partners',
  '/admin/riders': 'Courier Fleet',
  '/admin/orders': 'Orders & Disputes',
  '/admin/users': 'User Directory',
  '/admin/settings': 'System Configuration',
};

function getPageTitle(pathname) {
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];
  if (pathname.startsWith('/customer/restaurants/')) return 'Restaurant Details';
  if (pathname.startsWith('/customer/orders/')) return 'Order Details';
  return '';
}

/**
 * SALO TopBar
 *
 * @param {node}     search       - optional existing search input
 * @param {node}     actions      - extra action nodes (before notifications)
 * @param {string}   userName
 * @param {string}   userRole
 * @param {string}   userInitials
 * @param {string}   userAvatar
 * @param {boolean}  showNotifications
 * @param {number}   notificationCount
 * @param {function} onMenuToggle - mobile hamburger callback
 * @param {function} onAvatarClick
 */
export default function TopBar({
  search,
  actions,
  userName,
  userRole,
  userInitials = '?',
  userAvatar,
  showNotifications = true,
  notificationCount = 0,
  onMenuToggle,
  mobileMenuOpen = false,
  onAvatarClick,
  title,
  children,
}) {
  const { pathname } = useLocation();

  return (
    <header className="topbar">
      <div className="topbar-heading">
        {onMenuToggle && (
          <button
            className="topbar-hamburger"
            onClick={onMenuToggle}
            aria-label="Toggle navigation"
            type="button"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <line x1="3" y1="6" x2="21" y2="6"/>
              <line x1="3" y1="12" x2="21" y2="12"/>
              <line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>
        )}

        {!mobileMenuOpen && (
          <span className="topbar-mobile-brand" aria-hidden="true">
            <BrandMark size="sm" showText={false} />
          </span>
        )}

        <h1 className="topbar-title">{title || getPageTitle(pathname)}</h1>
      </div>

      {search && <div className="topbar-search">{search}</div>}

      <div className="topbar-actions">
        {children}
        {actions}

        {showNotifications && (
          <Link to="/customer/notifications" className="topbar-btn" aria-label={`Notifications${notificationCount ? ` (${notificationCount})` : ''}`} title="View notifications" style={{ textDecoration: 'none' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
              <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/>
              <path d="M13.73 21a2 2 0 01-3.46 0"/>
            </svg>
            {notificationCount > 0 && (
              <span className="topbar-notification-dot" aria-hidden="true">
                {notificationCount > 9 ? '9+' : notificationCount}
              </span>
            )}
          </Link>
        )}

        <ThemeToggle />

        {(userName || userInitials) && (
          <button
            className="topbar-user"
            onClick={onAvatarClick}
            aria-label={`${userName || 'User'}${userRole ? `, ${userRole}` : ''} profile`}
            type="button"
          >
            <span className="topbar-avatar" aria-hidden="true">
              {userAvatar
                ? <img src={userAvatar} alt="" />
                : userInitials}
            </span>
            {userName && (
              <span className="topbar-user-details">
                <span className="topbar-user-name">{userName}</span>
                {userRole && <span className="topbar-user-role">{userRole}</span>}
              </span>
            )}
            <svg className="topbar-user-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>
        )}
      </div>
    </header>
  );
}
