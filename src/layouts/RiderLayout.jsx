import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useLogout } from '../hooks/useLogout';
import { useSidebarCollapse } from '../hooks/useSidebarCollapse';
import TopBar from '../components/navigation/TopBar';
import SideBar from '../components/navigation/SideBar';
import ProfileMenu from '../components/navigation/ProfileMenu';
import SwitchAccountModal from '../components/navigation/SwitchAccountModal';
import ConfirmDialog from '../components/common/ConfirmDialog';
import {
  RIDER_NAV_CONFIG,
  RIDER_SIDEBAR_COLLAPSED_KEY,
} from '../components/navigation/riderNavConfig';
import { buildProfileMenuItems, ROLE_META } from '../config/navigationConfig';
import { getRiderMock } from '../features/rider/mocks';
import { MOBILE_PRIMARY_NAV_KEYS } from '../features/rider/constants/riderConstants';
import ScenarioLink from '../features/rider/components/ScenarioLink';
import { withScenario } from '../features/rider/utils/scenarioLinks';
import useScenario from '../features/rider/hooks/useScenario';
import RoleOnboardingModal from '../components/onboarding/RoleOnboardingModal';
import { useRoleOnboarding } from '../hooks/useRoleOnboarding';
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
  const riderOnboarding = useRoleOnboarding('rider');
  const location = useLocation();
  const isMapPage = location.pathname === '/rider/map';
  const [mobileOpen, setMobileOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [switchAccountOpen, setSwitchAccountOpen] = useState(false);

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

  const profileMenuItems = buildProfileMenuItems({
    profileHref: withScenario(ROLE_META.rider.profileHref, location.search),
    settingsHref: withScenario(ROLE_META.rider.settingsHref, location.search),
    onSwitchAccount: () => setSwitchAccountOpen(true),
    onLogout: requestLogout,
  });

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
          roleLabel={ROLE_META.rider.label}
          roleTone={ROLE_META.rider.tone}
          showThemeToggle
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
              roleLabel={ROLE_META.rider.label}
              roleTone={ROLE_META.rider.tone}
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
      <SwitchAccountModal
        open={switchAccountOpen}
        onClose={() => setSwitchAccountOpen(false)}
        currentRole="rider"
      />

      <RoleOnboardingModal
        open={riderOnboarding.shouldShow}
        role="rider"
        user={riderOnboarding.user}
        riderDashboardData={riderOnboarding.riderDashboardData}
        onComplete={riderOnboarding.completeOnboarding}
        onSkip={riderOnboarding.skipOnboarding}
      />

      <ConfirmDialog {...logoutDialogProps} />
    </div>
  );
}
