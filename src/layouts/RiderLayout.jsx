import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
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
import { MOBILE_PRIMARY_NAV_KEYS } from '../features/rider/constants/riderConstants';
import riderService from '../services/riderService';
import RoleOnboardingModal from '../components/onboarding/RoleOnboardingModal';
import RiderNotificationsMenu from '../features/rider/components/RiderNotificationsMenu';
import useRiderGpsTracker from '../features/rider/hooks/useRiderGpsTracker';
import { useRoleOnboarding } from '../hooks/useRoleOnboarding';
import '../components/navigation/NavigationShell.css';
import './RiderLayout.css';

const mkIcon = (path) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={path} />
  </svg>
);

function getStatusPill(availability, activeDelivery) {
  if (activeDelivery) {
    return { label: 'On delivery', tone: 'orange' };
  }
  if (availability === 'online') {
    return { label: 'Online', tone: 'green' };
  }
  if (availability === 'temporarily_unavailable') {
    return { label: 'Paused', tone: 'gray' };
  }
  return { label: 'Offline', tone: 'gray' };
}

function getInitials(name = 'Rider') {
  return String(name)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('') || 'R';
}

export default function RiderLayout({ children }) {
  const { user } = useAuth();
  const { requestLogout, logoutDialogProps } = useLogout();
  const [collapsed, toggleCollapsed] = useSidebarCollapse(RIDER_SIDEBAR_COLLAPSED_KEY, true);
  const riderOnboarding = useRoleOnboarding('rider');
  const location = useLocation();
  const isMapPage = location.pathname === '/rider/map';
  const [mobileOpen, setMobileOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [switchAccountOpen, setSwitchAccountOpen] = useState(false);
  const [dashboard, setDashboard] = useState(null);

  useEffect(() => {
    let active = true;
    const loadDashboard = async () => {
      try {
        const data = await riderService.getDashboard();
        if (active) setDashboard(data);
      } catch {
        if (active) setDashboard(null);
      }
    };
    loadDashboard();
    window.addEventListener('salo:riderUpdated', loadDashboard);
    return () => {
      active = false;
      window.removeEventListener('salo:riderUpdated', loadDashboard);
    };
  }, []);

  const activeDelivery = dashboard?.active_delivery || null;
  const rawAvailability = dashboard?.availability;
  const availability = typeof rawAvailability === 'string'
    ? rawAvailability
    : (rawAvailability?.status || (rawAvailability?.is_online ? 'online' : 'offline'));
  const statusPill = getStatusPill(availability, activeDelivery);

  const items = useMemo(
    () =>
      RIDER_NAV_CONFIG.map((item) => ({
        ...item,
        href: item.path,
        dot: item.id === 'deliveries' && Boolean(activeDelivery),
      })),
    [activeDelivery]
  );

  const activePath = location.pathname;
  const riderStatus = user?.rider_profile?.rider_status ?? dashboard?.rider?.rider_status ?? null;
  const shouldTrackGps = riderStatus === 'active' && (availability === 'online' || Boolean(activeDelivery));

  useRiderGpsTracker({
    enabled: shouldTrackGps,
    deliveryId: activeDelivery?.delivery_id ?? null,
  });
  const isOperationalRoute = [
    '/rider/go-online',
    '/rider/deliveries',
    '/rider/deliveries/active',
    '/rider/active',
    '/rider/jobs',
  ].includes(activePath);
  const isBlockedPendingActivation = Boolean(riderStatus && riderStatus !== 'active' && isOperationalRoute);
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
    profileHref: ROLE_META.rider.profileHref,
    settingsHref: ROLE_META.rider.settingsHref,
    onSwitchAccount: () => setSwitchAccountOpen(true),
    onLogout: requestLogout,
  });

  const primaryNavItems = items.filter((item) => MOBILE_PRIMARY_NAV_KEYS.includes(item.id));
  const moreNavItems = items.filter((item) => !MOBILE_PRIMARY_NAV_KEYS.includes(item.id));

  const displayName = user?.name || dashboard?.rider?.name || user?.username || 'Rider';
  const displayEmail = user?.email || dashboard?.rider?.email || '';
  const displayInitials = getInitials(displayName);

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
          logoHref="/rider"
          onLogout={requestLogout}
        />
      </div>

      <div className={`rider-main navigation-main ${collapsed ? 'sidebar-collapsed' : ''} ${isMapPage ? 'rider-map-main' : ''}`}>
        <TopBar
          mobileMenuOpen={mobileOpen}
          onMenuToggle={() => setMobileOpen((value) => !value)}
          notificationsSlot={<RiderNotificationsMenu />}
          roleLabel={ROLE_META.rider.label}
          roleTone={ROLE_META.rider.tone}
          showThemeToggle
          headingExtras={(
            <Link
              to="/rider#driver-mode"
              className={`rider-status-pill rider-status-pill--${statusPill.tone}`}
              aria-label={`Driver status: ${statusPill.label}. Go to Driver Mode`}
              title="Go to Driver Mode"
            >
              <span className="rider-status-pill-dot" aria-hidden="true" />
              <span>{statusPill.label}</span>
            </Link>
          )}
          profileButton={(
            <ProfileMenu
              profileName={displayName}
              profileEmail={displayEmail}
              profileInitials={displayInitials}
              profileAvatar={user?.avatar}
              roleLabel={ROLE_META.rider.label}
              roleTone={ROLE_META.rider.tone}
              menuItems={profileMenuItems}
            />
          )}
        />

        <main className={`rider-content ${isMapPage ? 'rider-content-map' : ''}`}>
          {isBlockedPendingActivation ? (
            <div className="rider-page-shell" role="status" style={{ padding: 'var(--space-6)' }}>
              <h2 style={{ marginTop: 0 }}>Awaiting activation</h2>
              <p>
                Your rider account status is <strong>{riderStatus}</strong>. An admin must activate your account before you can go online or accept deliveries.
              </p>
              <Link to="/rider" style={{ fontWeight: 600 }}>Return to Rider Dashboard</Link>
            </div>
          ) : children}
        </main>

        {!isMapPage && (
          <nav className="rider-mobile-nav navigation-mobile-bottom-nav" aria-label="Rider mobile navigation">
            {primaryNavItems.map((item) => (
              <Link
                key={item.id}
                to={item.href}
                className={`rider-mobile-nav-item navigation-mobile-nav-item ${current === item.id ? 'is-active active' : ''}`}
                aria-current={current === item.id ? 'page' : undefined}
                onClick={() => setMoreOpen(false)}
              >
                {item.icon}
                <span>{item.id === 'map' ? 'Map' : item.label === 'Delivery History' ? 'History' : item.label}</span>
              </Link>
            ))}
            {moreNavItems.length > 0 && (
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
            )}
            {moreOpen && (
              <div className="rider-mobile-more-menu" id="rider-mobile-more-menu">
                {moreNavItems.map((item) => (
                  <Link
                    key={item.id}
                    to={item.href}
                    className={`rider-mobile-more-item ${current === item.id ? 'is-active' : ''}`}
                    onClick={() => setMoreOpen(false)}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </Link>
                ))}
              </div>
            )}
          </nav>
        )}
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
