import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
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
  const availability = dashboard?.availability || 'offline';
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
    onSwitchWorkspace: () => setSwitchAccountOpen(true),
    onLogout: requestLogout,
  });

  const primaryBottomItems = items.filter((item) => MOBILE_PRIMARY_NAV_KEYS.includes(item.id));
  const overflowItems = items.filter((item) => !MOBILE_PRIMARY_NAV_KEYS.includes(item.id));
  const activeNavItem = items.find((item) => item.id === current);

  const displayName = user?.name || dashboard?.rider?.name || user?.username || 'Rider';
  const displayEmail = user?.email || dashboard?.rider?.email || '';
  const displayInitials = getInitials(displayName);

  const topbarLeft = (
    <div className="rider-topbar-title-group">
      <div className="rider-topbar-breadcrumb">
        <span>Rider</span>
        <span aria-hidden="true">/</span>
        <strong>{activeNavItem?.label || 'Dashboard'}</strong>
      </div>
    </div>
  );

  const topbarRight = (
    <div className="rider-topbar-actions">
      <span className={`rider-status-pill ${statusPill.tone}`}>
        <span className="rider-status-dot" aria-hidden="true" />
        {statusPill.label}
      </span>

      <ProfileMenu
        name={displayName}
        email={displayEmail}
        initials={displayInitials}
        roleLabel={ROLE_META.rider.label}
        items={profileMenuItems}
      />
    </div>
  );

  return (
    <div className="salo-shell salo-shell--rider">
      <SideBar
        brandTitle="SALO"
        brandSub="Rider Fleet"
        brandHref="/rider"
        navItems={items}
        activeId={current}
        collapsed={collapsed}
        onToggleCollapse={toggleCollapsed}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />

      <div className="salo-shell__main">
        <TopBar
          left={topbarLeft}
          right={topbarRight}
          showMobileMenuButton
          mobileBrandHref="/rider"
          onOpenMobileMenu={() => setMobileOpen(true)}
        />

        <main className={`salo-shell__content ${isMapPage ? 'rider-main-map' : ''}`}>
          {children}
        </main>
      </div>

      {!isMapPage && (
        <nav className="rider-bottom-nav" aria-label="Primary rider navigation">
          {primaryBottomItems.map((item) => (
            <a
              key={item.id}
              href={item.path}
              className={`rider-bottom-link ${current === item.id ? 'active' : ''}`}
            >
              {item.icon}
              <span>{item.shortLabel || item.label}</span>
              {item.dot && <span className="rider-bottom-dot" aria-hidden="true" />}
            </a>
          ))}
          {overflowItems.length > 0 && (
            <button
              type="button"
              className={`rider-bottom-link ${moreOpen ? 'active' : ''}`}
              onClick={() => setMoreOpen((v) => !v)}
            >
              {mkIcon('M4 12h16M4 6h16M4 18h16')}
              <span>More</span>
            </button>
          )}
        </nav>
      )}

      {moreOpen && (
        <div className="rider-more-drawer" role="dialog" aria-label="More rider pages">
          <div className="rider-more-backdrop" onClick={() => setMoreOpen(false)} />
          <div className="rider-more-sheet">
            <div className="rider-more-header">
              <strong>More</strong>
              <button type="button" onClick={() => setMoreOpen(false)} aria-label="Close menu">✕</button>
            </div>
            <div className="rider-more-links">
              {overflowItems.map((item) => (
                <a
                  key={item.id}
                  href={item.path}
                  className={current === item.id ? 'active' : ''}
                  onClick={() => setMoreOpen(false)}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </a>
              ))}
            </div>
          </div>
        </div>
      )}

      <SwitchAccountModal
        open={switchAccountOpen}
        onClose={() => setSwitchAccountOpen(false)}
      />

      <ConfirmDialog {...logoutDialogProps} />

      <RoleOnboardingModal {...riderOnboarding} />
    </div>
  );
}
