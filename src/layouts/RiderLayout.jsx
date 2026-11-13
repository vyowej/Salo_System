import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useLogout } from '../hooks/useLogout';
import { useSidebarCollapse } from '../hooks/useSidebarCollapse';
import TopBar from '../components/navigation/TopBar';
import SideBar from '../components/navigation/SideBar';
import ProfileMenu from '../components/navigation/ProfileMenu';
import ConfirmDialog from '../components/common/ConfirmDialog';
import {
  RIDER_NAV_CONFIG,
  RIDER_SIDEBAR_COLLAPSED_KEY,
} from '../components/navigation/riderNavConfig';
import { getRiderMock } from '../features/rider/mocks';
import { MOBILE_PRIMARY_NAV_KEYS } from '../features/rider/constants/riderConstants';
import ScenarioLink from '../features/rider/components/ScenarioLink';
import { withScenario } from '../features/rider/utils/scenarioLinks';
import useScenario from '../features/rider/hooks/useScenario';
import '../components/navigation/NavigationShell.css';
import './RiderLayout.css';

const mkIcon = (path) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={path} />
  </svg>
);

function getStatusPill(profile, activeDelivery) {
  if (activeDelivery || profile?.availability === 'on_delivery') {
    return { label: 'On delivery', tone: 'orange' };
  }
  if (profile?.availability === 'online_available') {
    return { label: 'Online', tone: 'green' };
  }
  return { label: 'Offline', tone: 'gray' };
}

export default function RiderLayout({ children }) {
  const { requestLogout, logoutDialogProps } = useLogout();
  const [collapsed, toggleCollapsed] = useSidebarCollapse(RIDER_SIDEBAR_COLLAPSED_KEY, true);
  const location = useLocation();
  const isMapPage = location.pathname === '/rider/map';
  const [mobileOpen, setMobileOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const scenario = useScenario();
  const profile = getRiderMock('riderProfile', scenario);
  const notifications = getRiderMock('notifications', scenario);
  const deliveries = getRiderMock('deliveries', scenario);
  const unreadNotifications = Array.isArray(notifications)
    ? notifications.filter((item) => item.unread).length
    : 0;
  const activeDelivery = deliveries?.active;
  const statusPill = getStatusPill(profile, activeDelivery);

  const items = useMemo(
    () =>
      RIDER_NAV_CONFIG.map((item) => ({
        ...item,
        href: withScenario(item.path, location.search),
        dot: item.id === 'deliveries' && Boolean(activeDelivery),
      })),
    [location.search, activeDelivery]
  );

  const activePath = location.pathname;
  const current =
    items.find(
      (item) =>
        item.path === activePath ||
        (item.path !== '/rider' && activePath.startsWith(`${item.path}/`))
    )?.id || 'dashboard';

  useEffect(() => {
    if (!isMapPage) return undefined;
    document.body.classList.add('rider-map-route');
    document.documentElement.classList.add('rider-map-route-active');
    return () => {
      document.body.classList.remove('rider-map-route');
      document.documentElement.classList.remove('rider-map-route-active');
    };
  }, [isMapPage]);

  const profileMenuItems = [
    {
      id: 'profile',
      type: 'link',
      label: 'Profile',
      href: withScenario('/rider/profile', location.search),
      icon: mkIcon('M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2 M12 3a4 4 0 100 8 4 4 0 000-8z'),
    },
    {
      id: 'settings',
      type: 'link',
      label: 'Settings',
      href: withScenario('/rider/settings', location.search),
      icon: mkIcon('M12 15a3 3 0 100-6 3 3 0 000 6z M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9c.26.604.852.997 1.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z'),
    },
    {
      id: 'safety',
      type: 'link',
      label: 'Safety',
      href: withScenario('/rider/safety', location.search),
      icon: mkIcon('M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z'),
    },
    {
      id: 'support',
      type: 'link',
      label: 'Support',
      href: withScenario('/rider/support', location.search),
      icon: mkIcon('M12 22a10 10 0 100-20 10 10 0 000 20z M9.5 9a2.5 2.5 0 014.8.8c0 1.7-2.3 2.2-2.3 3.7 M12 17h.01'),
    },
    {
      id: 'logout',
      label: 'Log out',
      icon: mkIcon('M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4 M16 17l5-5-5-5 M21 12H9'),
      onClick: requestLogout,
      danger: true,
    },
  ];

  const primaryNavItems = items.filter((item) => MOBILE_PRIMARY_NAV_KEYS.includes(item.id));
  const moreNavItems = items.filter((item) => !MOBILE_PRIMARY_NAV_KEYS.includes(item.id));

  return (
    <div className={`rider-shell navigation-shell ${isMapPage ? 'rider-map-shell' : ''}`}>
      <div className={`rider-sidebar navigation-sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>
        <SideBar
          items={items}
          activeId={current}
          collapsed={collapsed}
          onToggleCollapse={toggleCollapsed}
          mobileOpen={mobileOpen}
          onMobileClose={() => setMobileOpen(false)}
          logoHref={withScenario('/rider', location.search)}
          onLogout={requestLogout}
        />
      </div>

      <div className={`rider-main navigation-main ${collapsed ? 'sidebar-collapsed' : ''} ${isMapPage ? 'rider-map-main' : ''}`}>
        <TopBar
          mobileMenuOpen={mobileOpen}
          onMenuToggle={() => setMobileOpen((value) => !value)}
          showNotifications
          notificationCount={unreadNotifications}
          notificationsHref={withScenario('/rider/notifications', location.search)}
          showThemeToggle={false}
          showUserInfo={false}
          headingExtras={(
            <ScenarioLink
              to="/rider#driver-mode"
              className={`rider-status-pill rider-status-pill--${statusPill.tone}`}
              aria-label={`Driver status: ${statusPill.label}. Go to Driver Mode`}
              title="Go to Driver Mode"
            >
              <span className="rider-status-pill-dot" aria-hidden="true" />
              <span>{statusPill.label}</span>
            </ScenarioLink>
          )}
          profileButton={(
            <ProfileMenu
              profileName={profile.name}
              profileEmail={profile.email}
              profileInitials={profile.initials}
              profileAvatar={profile.photo}
              menuItems={profileMenuItems}
            />
          )}
        />
        <main className={`rider-content ${isMapPage ? 'rider-content-map' : ''}`}>
          {children}
        </main>
        <nav className="rider-mobile-nav navigation-mobile-bottom-nav" aria-label="Rider mobile navigation">
          {primaryNavItems.map((item) => (
            <ScenarioLink
              key={item.id}
              to={item.href}
              className={`rider-mobile-nav-item navigation-mobile-nav-item ${current === item.id ? 'is-active active' : ''}`}
              aria-current={current === item.id ? 'page' : undefined}
              onClick={() => setMoreOpen(false)}
            >
              {item.icon}
              <span>{item.id === 'map' ? 'Map' : item.label === 'Delivery History' ? 'History' : item.label}</span>
            </ScenarioLink>
          ))}
          <button
            type="button"
            className={`rider-mobile-nav-item navigation-mobile-nav-item ${moreOpen || moreNavItems.some((item) => item.id === current) ? 'is-active active' : ''}`}
            aria-expanded={moreOpen}
            aria-controls="rider-mobile-more-menu"
            onClick={() => setMoreOpen((open) => !open)}
          >
            {mkIcon('M5 12h.01M12 12h.01M19 12h.01')}
            <span>More</span>
          </button>
          {moreOpen && (
            <div className="rider-mobile-more-menu" id="rider-mobile-more-menu">
              {moreNavItems.map((item) => (
                <ScenarioLink
                  key={item.id}
                  to={item.href}
                  className={`rider-mobile-more-item ${current === item.id ? 'is-active' : ''}`}
                  onClick={() => setMoreOpen(false)}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </ScenarioLink>
              ))}
            </div>
          )}
        </nav>
      </div>
      <ConfirmDialog {...logoutDialogProps} />
    </div>
  );
}
