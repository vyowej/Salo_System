import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import TopBar from '../components/navigation/TopBar';
import SideBar from '../components/navigation/SideBar';
import Button from '../components/common/Button';
import riderService from '../services/riderService';
import './RiderLayout.css';

const mkIcon = (path) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d={path} />
  </svg>
);

const ICONS = {
  dashboard: 'M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z',
  active: 'M13 10V3L4 14h7v7l9-11h-7z',
  jobs: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2',
  history: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
  earnings: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-4H9l3-3 3 3h-2v4z',
  profile: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
};

export default function RiderLayout({ children }) {
  const { logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    const profile = riderService.getRiderProfile();
    setIsOnline(profile.isOnline);
  }, []);

  function handleToggleOnline() {
    const nextStatus = riderService.toggleOnlineStatus();
    setIsOnline(nextStatus);
  }

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: mkIcon(ICONS.dashboard), href: '/rider', section: 'Overview' },
    { id: 'active', label: 'Active Delivery', icon: mkIcon(ICONS.active), href: '/rider/active', section: 'Dispatch' },
    { id: 'jobs', label: 'Available Jobs', icon: mkIcon(ICONS.jobs), href: '/rider/jobs' },
    { id: 'history', label: 'Delivery History', icon: mkIcon(ICONS.history), href: '/rider/history', section: 'Performance' },
    { id: 'earnings', label: 'Earnings & Cash', icon: mkIcon(ICONS.earnings), href: '/rider/earnings' },
    { id: 'profile', label: 'Rider Profile', icon: mkIcon(ICONS.profile), href: '/rider/profile', section: 'Account' },
  ];

  const activeItem = navItems.find((item) => {
    if (item.href === '/rider' && location.pathname === '/rider') return true;
    if (item.href !== '/rider' && location.pathname.startsWith(item.href)) return true;
    return false;
  })?.id || 'dashboard';

  return (
    <div className="rider-shell">
      {/* ── Sidebar ────────────────────────────────────── */}
      <div className={`rider-sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>
        <SideBar
          items={navItems}
          activeId={activeItem}
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed(!collapsed)}
          mobileOpen={mobileOpen}
          onMobileClose={() => setMobileOpen(false)}
          footer={
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              <Button as={Link} to="/customer" variant="ghost" size="sm" fullWidth className="sidebar-footer-item sidebar-footer-link" title="Switch to Customer View" leftIcon={
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
                    <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z" />
                  </svg>
                }>
                  <span className="sidebar-footer-label">Switch to Customer View</span>
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
      <div className={`rider-main ${collapsed ? 'sidebar-collapsed' : ''}`}>
        <TopBar
          userName="Danilo Ramos"
          userRole="Rider"
          userInitials="DR"
          mobileMenuOpen={mobileOpen}
          onMenuToggle={() => setMobileOpen(!mobileOpen)}
          actions={
            <Button
              variant="ghost"
              size="sm"
              className={`rider-online-toggle ${isOnline ? 'is-online' : ''}`}
              aria-label={isOnline ? 'Go offline; currently receiving jobs' : 'Go online to receive jobs'}
              leftIcon={
                <span className={`rider-online-dot ${isOnline ? 'is-online' : ''}`} aria-hidden="true" />
              }
              onClick={handleToggleOnline}
              title="Click to toggle dispatch availability"
            >
              <span className="rider-online-label">{isOnline ? 'Online · Receiving Jobs' : 'Offline · Paused'}</span>
            </Button>
          }
        />

        <main className="rider-content">
          {children}
        </main>
      </div>
    </div>
  );
}
