import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import TopBar from '../components/navigation/TopBar';
import SideBar from '../components/navigation/SideBar';
import ProfileMenu from '../components/navigation/ProfileMenu';
import Button from '../components/common/Button';
import { getRiderMock } from '../features/rider/mocks';
import { MOBILE_PRIMARY_NAV_KEYS, RIDER_NAV_ITEMS } from '../features/rider/constants/riderConstants';
import ScenarioLink from '../features/rider/components/ScenarioLink';
import { withScenario } from '../features/rider/utils/scenarioLinks';
import useScenario from '../features/rider/hooks/useScenario';
import '../components/navigation/NavigationShell.css';
import './RiderLayout.css';

const iconPaths = {
  dashboard: 'M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z',
  deliveries: 'M4 4h16v16H4zM8 8h8M8 12h8M8 16h5',
  map: 'M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3zM9 3v15M15 6v15',
  schedule: 'M4 5h16v16H4zM8 3v4M16 3v4M4 10h16',
  earnings: 'M12 2v20M17 6H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6',
  history: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
  notifications: 'M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9M10 21h4',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  support: 'M12 18h.01M9.09 9a3 3 0 015.82 1c0 2-3 3-3 5M22 12a10 10 0 11-20 0 10 10 0 0120 0z',
  profile: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
  settings: 'M12 8a4 4 0 100 8 4 4 0 000-8zM19.4 15a1.7 1.7 0 00.3 1.9l.1.1-1.6 2.8-.2-.1a1.7 1.7 0 00-1.8.4l-.1.1h-3.2l-.1-.2a1.7 1.7 0 00-1.6-1l-.2.1-2.8-1.6.1-.2a1.7 1.7 0 00-.4-1.8l-.1-.1v-3.2l.2-.1a1.7 1.7 0 001-1.6l-.1-.2 1.6-2.8.2.1a1.7 1.7 0 001.8-.4l.1-.1h3.2l.1.2a1.7 1.7 0 001.6 1l.2-.1 2.8 1.6-.1.2a1.7 1.7 0 00.4 1.8l.1.1v3.2z',
};

function icon(path) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d={path} /></svg>;
}

export default function RiderLayout({ children }) {
  const { logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const scenario = useScenario();
  const profile = getRiderMock('riderProfile', scenario);
  const notifications = getRiderMock('notifications', scenario);
  const deliveries = getRiderMock('deliveries', scenario);
  const unreadNotifications = Array.isArray(notifications)
    ? notifications.filter((item) => item.unread).length
    : 0;
  const items = RIDER_NAV_ITEMS.map((item) => ({
    ...item,
    id: item.key || item.id,
    href: withScenario(item.href || item.path, location.search),
    icon: icon(iconPaths[item.key || item.id] || iconPaths.dashboard),
    badge: item.key === 'notifications' && unreadNotifications > 0
      ? <span className="rider-nav-unread-dot" aria-label="Unread notifications" />
      : item.badge,
  }));

  const activePath = location.pathname;
  const current = items.find((item) => item.path === activePath || (item.path !== '/rider' && activePath.startsWith(`${item.path}/`)))?.key || 'dashboard';
  const activeDelivery = deliveries?.active;
  const signOut = async () => {
    await logout();
    navigate('/');
  };
  const profileMenuItems = [
    { id: 'profile', type: 'link', label: 'Rider Profile', href: withScenario('/rider/profile', location.search), icon: icon(iconPaths.profile) },
    { id: 'settings', type: 'link', label: 'Settings', href: withScenario('/rider/settings', location.search), icon: icon(iconPaths.settings) },
    { id: 'safety', type: 'link', label: 'Safety & emergency help', href: withScenario('/rider/safety', location.search), icon: icon(iconPaths.support) },
    { id: 'customer', type: 'link', label: 'Switch to Customer View', href: withScenario('/customer', location.search), icon: icon(iconPaths.dashboard) },
    { id: 'theme', label: 'Dark Mode', toggle: true, onClick: toggleTheme },
    {
      id: 'logout',
      label: 'Sign Out',
      icon: icon('M10 17l5-5-5-5M15 12H3m9-9h7a2 2 0 012 2v14a2 2 0 01-2 2h-7'),
      onClick: signOut,
      danger: true,
    },
  ];
  const primaryNavItems = items.filter((item) => MOBILE_PRIMARY_NAV_KEYS.includes(item.key));
  const moreNavItems = items.filter((item) => !MOBILE_PRIMARY_NAV_KEYS.includes(item.key));

  return (
    <div className="rider-shell navigation-shell">
      <div className={`rider-sidebar navigation-sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>
        <SideBar
          items={items}
          activeId={current}
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((value) => !value)}
          mobileOpen={mobileOpen}
          onMobileClose={() => setMobileOpen(false)}
          footer={(
            <div className="rider-sidebar-footer">
              <ProfileMenu
                placement="sidebar"
                collapsed={collapsed}
                profileName={profile.name}
                profileEmail={profile.email}
                profileInitials={profile.initials}
                profileAvatar={profile.photo}
                theme={theme}
                menuItems={profileMenuItems}
              />
            </div>
          )}
        />
      </div>

      <div className={`rider-main navigation-main ${collapsed ? 'sidebar-collapsed' : ''}`}>
        <TopBar
          userName={profile.name}
          userRole={profile.accountStatus}
          userInitials={profile.initials}
          showNotifications={false}
          showThemeToggle={false}
          showUserInfo={false}
          mobileMenuOpen={mobileOpen}
          profileButton={(
            <ProfileMenu
              profileName={profile.name}
              profileEmail={profile.email}
              profileInitials={profile.initials}
              profileAvatar={profile.photo}
              theme={theme}
              menuItems={profileMenuItems}
            />
          )}
          onMenuToggle={() => setMobileOpen((value) => !value)}
          actions={(
            <ScenarioLink
              to="/rider/notifications"
              className="topbar-btn"
              aria-label={`Notifications${unreadNotifications ? ` (${unreadNotifications})` : ''}`}
              title="View notifications"
              style={{ textDecoration: 'none' }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
                <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 01-3.46 0" />
              </svg>
              {unreadNotifications > 0 && (
                <span className="topbar-notification-dot" aria-hidden="true">
                  {unreadNotifications > 9 ? '9+' : unreadNotifications}
                </span>
              )}
            </ScenarioLink>
          )}
        />
        <main className="rider-content">
          {activeDelivery && (
            <div className="rider-active-shortcut">
              <span>{'Active delivery shortcut'}</span>
              <Button as={ScenarioLink} to="/rider/deliveries/active" variant={location.pathname === '/rider/deliveries/active' || location.pathname === '/rider/active' ? 'primary' : 'outline'} size="sm">
                {activeDelivery.id}
              </Button>
            </div>
          )}
          {children}
        </main>
        <nav className="rider-mobile-nav navigation-mobile-bottom-nav" aria-label="Rider mobile navigation">
          {primaryNavItems.map((item) => (
            <ScenarioLink
              key={item.key}
              to={item.href}
              className={`rider-mobile-nav-item navigation-mobile-nav-item ${current === item.key ? 'is-active active' : ''}`}
              aria-current={current === item.key ? 'page' : undefined}
              onClick={() => setMoreOpen(false)}
            >
              {item.icon}
              <span>{item.key === 'map' ? 'Map' : item.label === 'Delivery History' ? 'History' : item.label}</span>
            </ScenarioLink>
          ))}
          <button
            type="button"
            className={`rider-mobile-nav-item navigation-mobile-nav-item ${moreOpen || moreNavItems.some((item) => item.key === current) ? 'is-active active' : ''}`}
            aria-expanded={moreOpen}
            aria-controls="rider-mobile-more-menu"
            onClick={() => setMoreOpen((open) => !open)}
          >
            {icon(iconPaths.more)}
            <span>More</span>
          </button>
          {moreOpen && (
            <div className="rider-mobile-more-menu" id="rider-mobile-more-menu">
              {moreNavItems.map((item) => (
                <ScenarioLink
                  key={item.key}
                  to={item.href}
                  className={`rider-mobile-more-item ${current === item.key ? 'is-active' : ''}`}
                  onClick={() => setMoreOpen(false)}
                >
                  {item.icon}
                  <span>{item.label}</span>
                  {item.key === 'notifications' && unreadNotifications > 0 && (
                    <span className="rider-nav-unread-dot" aria-label="Unread notifications" />
                  )}
                </ScenarioLink>
              ))}
            </div>
          )}
        </nav>
      </div>
    </div>
  );
}
