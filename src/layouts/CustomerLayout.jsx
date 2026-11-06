import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useCart } from '../hooks/useCart';
import TopBar from '../components/navigation/TopBar';
import SideBar from '../components/navigation/SideBar';
import Button from '../components/common/Button';
import customerService from '../services/customerService';
import './CustomerLayout.css';

const mkIcon = (path) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d={path} />
  </svg>
);

const ICONS = {
  home: 'M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z',
  restaurants: 'M3 11l19-9-9 19-2-8-8-2z',
  cart: 'M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z M3 6h18 M16 10a4 4 0 01-8 0',
  orders: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2',
  reservation: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
  addresses: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 110-5 2.5 2.5 0 010 5z',
  profile: 'M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2 M12 3a4 4 0 100 8 4 4 0 000-8z',
};

export default function CustomerLayout({ children }) {
  const { user, logout } = useAuth();
  const { totalItemCount } = useCart();
  const location = useLocation();
  const navigate = useNavigate();

  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notificationCount, setNotificationCount] = useState(0);

  useEffect(() => {
    const syncNotificationCount = () => {
      const unreadCount = customerService.getNotifications().filter((item) => !item.read).length;
      setNotificationCount(unreadCount);
    };

    syncNotificationCount();
    window.addEventListener('salo:notificationsUpdated', syncNotificationCount);

    return () => {
      window.removeEventListener('salo:notificationsUpdated', syncNotificationCount);
    };
  }, [location.pathname]);

  const navItems = [
    { id: 'home', label: 'Explore & Feed', icon: mkIcon(ICONS.home), href: '/customer', section: 'Dining' },
    { id: 'restaurants', label: 'All Restaurants', icon: mkIcon(ICONS.restaurants), href: '/customer/restaurants' },
    {
      id: 'cart',
      label: 'Multi-Cart',
      icon: mkIcon(ICONS.cart),
      href: '/customer/cart',
      badge: totalItemCount > 0 ? totalItemCount : null,
    },
    { id: 'orders', label: 'My Orders', icon: mkIcon(ICONS.orders), href: '/customer/orders', section: 'Activity' },
    { id: 'favorites', label: 'Favorites', icon: mkIcon('M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z'), href: '/customer/favorites' },
    { id: 'notifications', label: 'Notifications', icon: mkIcon('M12 22a2.5 2.5 0 002.45-2h-4.9A2.5 2.5 0 0012 22zm8-6V11a8 8 0 10-16 0v5l-2 2v1h20v-1l-2-2z'), href: '/customer/notifications', badge: notificationCount > 0 ? notificationCount : null },
    { id: 'reservations', label: 'Table Bookings', icon: mkIcon(ICONS.reservation), href: '/customer/reservations' },
    { id: 'addresses', label: 'Saved Addresses', icon: mkIcon(ICONS.addresses), href: '/customer/addresses', section: 'Account' },
    { id: 'partner', label: 'Become a Partner', icon: mkIcon('M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z'), href: '/customer/partner' },
    { id: 'profile', label: 'Profile Settings', icon: mkIcon(ICONS.profile), href: '/customer/profile' },
  ];

  // Resolve active nav item based on pathname
  const activeItem = navItems.find((item) => {
    if (item.href === '/customer' && location.pathname === '/customer') return true;
    if (item.href !== '/customer' && location.pathname.startsWith(item.href)) return true;
    return false;
  })?.id || 'home';

  const userInitials = (user?.name || user?.username || 'CS')
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .substring(0, 2);

  return (
    <div className="customer-shell">
      {/* ── Sidebar ────────────────────────────────────── */}
      <div className={`customer-sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>
        <SideBar
          items={navItems}
          activeId={activeItem}
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed(!collapsed)}
          mobileOpen={mobileOpen}
          onMobileClose={() => setMobileOpen(false)}
          footer={
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              <Button as={Link} to="/showcase" variant="ghost" size="sm" fullWidth className="sidebar-footer-item sidebar-footer-link" title="Design System Showcase" leftIcon={
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
                    <path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" />
                  </svg>
                }>
                  <span className="sidebar-footer-label">Design System Showcase</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                fullWidth
                className="sidebar-footer-item"
                title="Sign Out"
                leftIcon={
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
                    <path d="M10 17l5-5-5-5M15 12H3m9-9h7a2 2 0 012 2v14a2 2 0 01-2 2h-7" />
                  </svg>
                }
                onClick={() => {
                  logout();
                  navigate('/');
                }}
              >
                <span className="sidebar-footer-label">Sign Out</span>
              </Button>
            </div>
          }
        />
      </div>

      {/* ── Main Area ──────────────────────────────────── */}
      <div className={`customer-main ${collapsed ? 'sidebar-collapsed' : ''}`}>
        <TopBar
          userName={user?.name || 'Customer'}
          userRole="Customer"
          userInitials={userInitials}
          mobileMenuOpen={mobileOpen}
          onMenuToggle={() => setMobileOpen(!mobileOpen)}
          notificationCount={notificationCount}
          actions={
            <Link to="/customer/cart" style={{ textDecoration: 'none' }} title="View Multi-Cart">
              <button
                type="button"
                className="topbar-btn topbar-cart-action"
                aria-label={`Shopping cart with ${totalItemCount} items`}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z M3 6h18 M16 10a4 4 0 01-8 0" />
                </svg>
                {totalItemCount > 0 && (
                  <span className="topbar-cart-count">
                    {totalItemCount}
                  </span>
                )}
              </button>
            </Link>
          }
        />

        <main className="customer-content">
          {children}
        </main>
      </div>
    </div>
  );
}
