import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import TopBar from '../components/navigation/TopBar';
import SideBar from '../components/navigation/SideBar';
import Button from '../components/common/Button';
import Badge from '../components/common/Badge';
import './AdminLayout.css';

const mkIcon = (path) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d={path} />
  </svg>
);

const ICONS = {
  dashboard: 'M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z',
  restaurants: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4',
  riders: 'M13 10V3L4 14h7v7l9-11h-7z',
  orders: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2',
  users: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z',
  settings: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37a1.724 1.724 0 002.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z',
};

export default function AdminLayout({ children }) {
  const { logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const navItems = [
    { id: 'dashboard', label: 'Platform Overview', icon: mkIcon(ICONS.dashboard), href: '/admin', section: 'HQ Analytics' },
    { id: 'restaurants', label: 'Restaurants & Partners', icon: mkIcon(ICONS.restaurants), href: '/admin/restaurants', section: 'Operations' },
    { id: 'riders', label: 'Courier Fleet', icon: mkIcon(ICONS.riders), href: '/admin/riders' },
    { id: 'orders', label: 'Orders & Disputes', icon: mkIcon(ICONS.orders), href: '/admin/orders' },
    { id: 'users', label: 'User Directory', icon: mkIcon(ICONS.users), href: '/admin/users', section: 'Administration' },
    { id: 'settings', label: 'System Configuration', icon: mkIcon(ICONS.settings), href: '/admin/settings' },
  ];

  const activeItem = navItems.find((item) => {
    if (item.href === '/admin' && location.pathname === '/admin') return true;
    if (item.href !== '/admin' && location.pathname.startsWith(item.href)) return true;
    return false;
  })?.id || 'dashboard';

  return (
    <div className="admin-shell">
      {/* ── Sidebar ────────────────────────────────────── */}
      <div className={`admin-sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>
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
              <Link to="/owner" style={{ textDecoration: 'none' }}>
                <Button variant="ghost" size="sm" fullWidth style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  Switch to Restaurant View
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
      <div className={`admin-main ${collapsed ? 'sidebar-collapsed' : ''}`}>
        <TopBar
          userName="Super Administrator"
          userInitials="SA"
          onMenuToggle={() => setMobileOpen(!mobileOpen)}
          actions={
            <Badge size="sm" className="badge-on-nav">
              HQ Root Access
            </Badge>
          }
        />

        <main className="admin-content">
          {children}
        </main>
      </div>
    </div>
  );
}
