import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useCart } from '../hooks/useCart';
import TopBar from '../components/navigation/TopBar';
import SideBar from '../components/navigation/SideBar';
import Button from '../components/common/Button';
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
              <Link to="/showcase" style={{ textDecoration: 'none' }}>
                <Button variant="ghost" size="sm" fullWidth style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  Design System Showcase
                </Button>
              </Link>
              <Button
                variant="ghost"
                size="sm"
                fullWidth
                onClick={() => {
                  logout();
                  navigate('/');
                }}
                style={{ fontSize: 11, color: 'var(--salo-error)' }}
              >
                Sign Out
              </Button>
            </div>
          }
        />
      </div>

      {/* ── Main Area ──────────────────────────────────── */}
      <div className={`customer-main ${collapsed ? 'sidebar-collapsed' : ''}`}>
        <TopBar
          userName={user?.name || 'Customer'}
          userInitials={userInitials}
          onMenuToggle={() => setMobileOpen(!mobileOpen)}
          actions={
            <Link to="/customer/cart" style={{ textDecoration: 'none' }} title="View Multi-Cart">
              <button
                type="button"
                className="topbar-btn"
                style={{ position: 'relative' }}
                aria-label={`Shopping cart with ${totalItemCount} items`}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z M3 6h18 M16 10a4 4 0 01-8 0" />
                </svg>
                {totalItemCount > 0 && (
                  <span
                    style={{
                      position: 'absolute',
                      top: 4,
                      right: 4,
                      background: 'var(--accent)',
                      color: '#fff',
                      fontSize: 10,
                      fontWeight: 700,
                      borderRadius: '50%',
                      width: 16,
                      height: 16,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
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
