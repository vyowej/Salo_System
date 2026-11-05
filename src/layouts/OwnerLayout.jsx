import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../hooks/useAuth';
import TopBar from '../components/navigation/TopBar';
import SideBar from '../components/navigation/SideBar';
import Button from '../components/common/Button';
import ownerService from '../services/ownerService';
import './OwnerLayout.css';

const mkIcon = (path) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d={path} />
  </svg>
);

const ICONS = {
  dashboard: 'M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z',
  orders: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2',
  menu: 'M4 6h16M4 10h16M4 14h16M4 18h16',
  reservation: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
  earnings: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-4H9l3-3 3 3h-2v4z',
  profile: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37a1.724 1.724 0 002.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z',
};

export default function OwnerLayout({ children }) {
  const { theme } = useTheme();
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const restaurant = ownerService.getRestaurant();

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: mkIcon(ICONS.dashboard), href: '/owner', section: 'Overview' },
    { id: 'orders', label: 'Live Orders', icon: mkIcon(ICONS.orders), href: '/owner/orders', section: 'Operations' },
    { id: 'menu', label: 'Menu Management', icon: mkIcon(ICONS.menu), href: '/owner/menu' },
    { id: 'reservations', label: 'Reservations', icon: mkIcon(ICONS.reservation), href: '/owner/reservations' },
    { id: 'earnings', label: 'Earnings', icon: mkIcon(ICONS.earnings), href: '/owner/earnings', section: 'Finance' },
    { id: 'profile', label: 'Restaurant Profile', icon: mkIcon(ICONS.profile), href: '/owner/profile', section: 'Settings' },
  ];

  const activeItem = navItems.find((item) => {
    if (item.href === '/owner' && location.pathname === '/owner') return true;
    if (item.href !== '/owner' && location.pathname.startsWith(item.href)) return true;
    return false;
  })?.id || 'dashboard';

  const userInitials = (user?.name || user?.username || 'OW')
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .substring(0, 2);

  return (
    <div className="owner-shell">
      {/* ── Sidebar ────────────────────────────────────── */}
      <div className={`owner-sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>
        <SideBar
          items={navItems}
          activeId={activeItem}
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed(!collapsed)}
          mobileOpen={mobileOpen}
          onMobileClose={() => setMobileOpen(false)}
          footer={
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              <Link to="/customer" style={{ textDecoration: 'none' }}>
                <Button variant="ghost" size="sm" fullWidth style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  Switch to Customer View
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
      <div className={`owner-main ${collapsed ? 'sidebar-collapsed' : ''}`}>
        <div className="fiesta-banderitas-strip" aria-hidden="true" />
        <TopBar
          userName={restaurant?.name || user?.name || 'Restaurant Owner'}
          userInitials={userInitials}
          onMenuToggle={() => setMobileOpen(!mobileOpen)}
          notificationCount={2}
        />

        <main className="owner-content">
          {children}
        </main>
      </div>
    </div>
  );
}
