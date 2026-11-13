import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import TopBar from '../components/navigation/TopBar';
import SideBar from '../components/navigation/SideBar';
import ProfileMenu from '../components/navigation/ProfileMenu';
import Button from '../components/common/Button';
import Badge from '../components/common/Badge';
import { getAdminNavItems } from '../features/admin/constants';
import useAdminSession from '../features/admin/contexts/useAdminSession';
import '../components/navigation/NavigationShell.css';
import './AdminLayout.css';

const ICON_PATHS = {
  dashboard: 'M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z',
  accounts: 'M17 20h5v-2a3 3 0 00-5.3-1.9M7 20H2v-2a3 3 0 015.3-1.9m1.7 3.9v-2a5 5 0 0110 0v2m-5-9a3 3 0 110-6 3 3 0 010 6z',
  administrators: 'M12 15l-3.5 2 1-4-3-2.5 4-.3L12 6l1.5 4.2 4 .3-3 2.5 1 4z',
  restaurants: 'M3 21h18M5 21V7l7-4v18m7 0V11l-7-4M9 9v.01M9 12v.01M9 15v.01',
  riders: 'M13 10V3L4 14h7v7l9-11h-7z',
  orders: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2',
  reservations: 'M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 012 2v14H3V6a2 2 0 012-2z',
  finance: 'M12 2v20m5-15H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6',
  fees: 'M20 7H4m16 0l-3-3m3 3l-3 3M4 17h16m-16 0l3-3m-3 3l3 3',
  discounts: 'M20.5 13.5L13 21l-10-10V3h8l9.5 10.5zM7 7h.01',
  serviceAreas: 'M12 21s7-6.2 7-12a7 7 0 10-14 0c0 5.8 7 12 7 12zm0-9a3 3 0 110-6 3 3 0 010 6z',
  reports: 'M4 19V5m0 14h17M8 15l3-4 3 2 5-7',
  support: 'M4 4h16v12H8l-4 4V4zm4 5h8m-8 3h5',
  content: 'M4 5h16v14H4zM8 9h8m-8 4h8m-8 3h4',
  activity: 'M3 12h4l3-8 4 16 3-8h4',
  settings: 'M12 8a4 4 0 100 8 4 4 0 000-8zm0-6v3m0 14v3m10-10h-3M5 12H2m17.1-7.1L17 7m-10 10l-2.1 2.1m14.2 0L17 17M7 7L4.9 4.9',
};

function icon(path) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d={path} /></svg>;
}

export default function AdminLayout({ children }) {
  const { logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { currentAdmin, admins, isDemoMode, selectDemoAdmin, resetMfa } = useAdminSession();
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const navItems = getAdminNavItems(currentAdmin.role).map((item) => ({
    ...item,
    icon: icon(ICON_PATHS[item.id]),
  }));
  const activeItem = navItems.find((item) => (
    item.href === '/admin'
      ? location.pathname === item.href
      : location.pathname === item.href || location.pathname.startsWith(`${item.href}/`)
  ))?.id || 'dashboard';
  const topBarTitle = location.pathname === '/admin/settings/security'
    ? 'Security and Sessions'
    : navItems.find((item) => item.id === activeItem)?.label || 'Admin';
  const initials = currentAdmin.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase();
  const signOut = async () => {
    resetMfa();
    await logout();
    navigate('/');
  };
  const profileMenuItems = [
    { id: 'settings', type: 'link', label: 'Settings', href: '/admin/settings', icon: icon(ICON_PATHS.settings) },
    { id: 'customer', type: 'link', label: 'Switch to Customer View', href: '/customer', icon: icon(ICON_PATHS.dashboard) },
    { id: 'theme', label: 'Dark Mode', toggle: true, onClick: toggleTheme },
    {
      id: 'logout',
      label: 'Sign Out',
      icon: icon('M10 17l5-5-5-5M15 12H3m9-9h7a2 2 0 012 2v14a2 2 0 01-2 2h-7'),
      onClick: signOut,
      danger: true,
    },
  ];

  return (
    <div className="admin-shell navigation-shell">
      <div className={`admin-sidebar navigation-sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>
        <SideBar
          items={navItems}
          activeId={activeItem}
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((value) => !value)}
          mobileOpen={mobileOpen}
          onItemClick={() => setMobileOpen(false)}
          onMobileClose={() => setMobileOpen(false)}
          useRouterLinks
          title="Admin Console"
          subtitle={currentAdmin.role}
          profile={(
            <ProfileMenu
              placement="sidebar"
              collapsed
              profileName={currentAdmin.name}
              profileEmail={currentAdmin.email}
              profileInitials={initials}
              theme={theme}
              menuItems={profileMenuItems}
            />
          )}
          footer={(
            <div className="admin-sidebar-footer">
              {isDemoMode && (
                <div className="admin-demo-switcher">
                  <label htmlFor="admin-demo-role">Demo role switcher</label>
                  <select id="admin-demo-role" value={currentAdmin.id} onChange={(event) => selectDemoAdmin(event.target.value)} aria-label="Switch demo administrator role">
                    {admins.filter((admin) => admin.status === 'Active').map((admin) => (
                      <option key={admin.id} value={admin.id}>{admin.role}</option>
                    ))}
                  </select>
                </div>
              )}
              <Button as={Link} to="/owner" variant="ghost" size="sm" fullWidth className="sidebar-footer-item sidebar-footer-link">
                <span className="sidebar-footer-label">Switch to Restaurant View</span>
              </Button>
            </div>
          )}
        />
      </div>

      <div className={`admin-main navigation-main ${collapsed ? 'sidebar-collapsed' : ''}`}>
        <TopBar
          title={topBarTitle}
          userName={currentAdmin.name}
          userRole={currentAdmin.role}
          userInitials={initials}
          mobileMenuOpen={mobileOpen}
          onMenuToggle={() => setMobileOpen((value) => !value)}
          showNotifications={false}
          showThemeToggle={false}
          showUserInfo={false}
          profileButton={(
            <ProfileMenu
              profileName={currentAdmin.name}
              profileEmail={currentAdmin.email}
              profileInitials={initials}
              theme={theme}
              menuItems={profileMenuItems}
            />
          )}
          actions={isDemoMode ? <Badge size="sm" variant="warning">Demo</Badge> : null}
        />
        <main className="admin-content">{children}</main>
      </div>
    </div>
  );
}
