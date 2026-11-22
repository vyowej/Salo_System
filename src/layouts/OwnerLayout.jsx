import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useLogout } from '../hooks/useLogout';
import { useSidebarCollapse } from '../hooks/useSidebarCollapse';
import { useRestaurantAccess } from '../features/restaurant/access/useRestaurantAccess';
import TopBar from '../components/navigation/TopBar';
import SideBar from '../components/navigation/SideBar';
import ProfileMenu from '../components/navigation/ProfileMenu';
import SwitchAccountModal from '../components/navigation/SwitchAccountModal';
import ConfirmDialog from '../components/common/ConfirmDialog';
import Modal from '../components/common/Modal';
import AddBranchModal from '../features/restaurant/components/AddBranchModal';
import { BRANCH_WORKSPACE_COPY } from '../features/restaurant/content/branchContent';
import {
  OWNER_NAV_CONFIG,
  OWNER_SIDEBAR_COLLAPSED_KEY,
} from '../components/navigation/ownerNavConfig';
import { buildProfileMenuItems, ROLE_META } from '../config/navigationConfig';
import RoleOnboardingModal from '../components/onboarding/RoleOnboardingModal';
import OwnerNotificationsMenu from '../features/restaurant/components/OwnerNotificationsMenu';
import { useRoleOnboarding } from '../hooks/useRoleOnboarding';
import ownerService from '../services/ownerService';
import '../components/navigation/NavigationShell.css';
import './OwnerLayout.css';

function getInitials(name) {
  return (name || 'Owner').split(/\s+/).filter(Boolean).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
}

export default function OwnerLayout({ children }) {
  const { user } = useAuth();
  const { requestLogout, logoutDialogProps } = useLogout();
  const [collapsed, toggleCollapsed] = useSidebarCollapse(OWNER_SIDEBAR_COLLAPSED_KEY, true);
  const access = useRestaurantAccess();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [switchAccountOpen, setSwitchAccountOpen] = useState(false);
  const [branchMenuOpen, setBranchMenuOpen] = useState(false);
  const [addBranchOpen, setAddBranchOpen] = useState(false);
  const [branchNotice, setBranchNotice] = useState('');
  const branchSwitcherRef = useRef(null);
  const [pendingOrdersCount] = useState(0);
  const [pendingReservationsCount] = useState(0);

  useEffect(() => {
    if (!branchMenuOpen) return undefined;
    const handleClickOutside = (event) => {
      if (branchSwitcherRef.current && !branchSwitcherRef.current.contains(event.target)) {
        setBranchMenuOpen(false);
      }
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setBranchMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [branchMenuOpen]);

  const selectedRestaurant = access.selectedRestaurant;
  const selectedRestaurantId = selectedRestaurant?.id;
  const businessOnboarding = useRoleOnboarding('business', {
    access,
    selectedRestaurantId,
  });

  const navItems = useMemo(
    () =>
      OWNER_NAV_CONFIG
        .filter((item) => access.canAccessNavigationItem(item.id))
        .map((item) => {
          if (item.id === 'orders') {
            return { ...item, badge: pendingOrdersCount };
          }
          if (item.id === 'reservations') {
            return { ...item, badge: pendingReservationsCount };
          }
          return item;
        }),
    [access, pendingOrdersCount, pendingReservationsCount]
  );

  const activeItem =
    navItems.find((item) =>
      item.href === '/owner'
        ? location.pathname === item.href
        : location.pathname.startsWith(item.href)
    )?.id || 'overview';

  const initials = getInitials(user?.name || user?.username);
  const profileName = user?.name || selectedRestaurant?.name || 'Restaurant Team';
  const profileEmail = user?.email || user?.username || 'Restaurant workspace';

  const [acceptingOrdersOverride, setAcceptingOrdersOverride] = useState(null);
  const isRestaurantOpenNow = acceptingOrdersOverride !== null
    ? acceptingOrdersOverride
    : Boolean(
      selectedRestaurant?.isOpen &&
      selectedRestaurant?.operatingSchedule?.acceptingOrders !== false
    );

  const applyOpenClosedStatus = async (nextOpen) => {
    if (!selectedRestaurantId || selectedRestaurant?.status !== 'active') return;
    try {
      const updated = await ownerService.updateAcceptingStatus(selectedRestaurantId, {
        accepting_orders: nextOpen,
      });
      if (updated) {
        setAcceptingOrdersOverride(Boolean(updated.accepting_orders));
      }
    } catch {
      // Keep UI unchanged on failure
    }
  };

  const handleOpenClosedClick = () => {
    if (isRestaurantOpenNow) {
      setCloseConfirmOpen(true);
    } else {
      applyOpenClosedStatus(true);
    }
  };

  const profileMenuItems = buildProfileMenuItems({
    profileHref: access.canAccessNavigationItem('profile') ? ROLE_META.restaurant.profileHref : ROLE_META.restaurant.settingsHref,
    settingsHref: ROLE_META.restaurant.settingsHref,
    canViewSettings: access.canAccessNavigationItem('settings'),
    onSwitchAccount: () => setSwitchAccountOpen(true),
    onLogout: requestLogout,
  });

  const hasMultipleRestaurants = access.restaurants.length > 1;
  const currentBranchLabel = selectedRestaurant?.branchName || selectedRestaurant?.displayName || selectedRestaurant?.name || 'Workspace';
  const restaurantControl = selectedRestaurant ? (
    <div className="owner-topbar-controls">
      {hasMultipleRestaurants ? (
        <div className="owner-branch-switcher" ref={branchSwitcherRef}>
          <button
            type="button"
            className="owner-branch-trigger"
            aria-haspopup="listbox"
            aria-expanded={branchMenuOpen}
            aria-label={BRANCH_WORKSPACE_COPY.switcherAriaLabel}
            onClick={() => setBranchMenuOpen((prev) => !prev)}
          >
            <span className="owner-branch-trigger-copy">
              <span className="owner-branch-brand">{selectedRestaurant.name}</span>
              <span className="owner-branch-current">{currentBranchLabel}</span>
            </span>
            <span className="owner-branch-caret" aria-hidden="true">▾</span>
          </button>

          {branchMenuOpen && (
            <div className="owner-branch-popover" role="listbox" aria-label={BRANCH_WORKSPACE_COPY.switcherAriaLabel}>
              <div className="owner-branch-popover-list">
                {access.restaurants.map((branch) => {
                  const isCurrent = branch.id === access.selectedRestaurantId;
                  return (
                    <button
                      key={branch.id}
                      type="button"
                      role="option"
                      aria-selected={isCurrent}
                      className={`owner-branch-option ${isCurrent ? 'is-current' : ''}`}
                      onClick={() => {
                        setBranchMenuOpen(false);
                        if (!isCurrent) {
                          setBranchNotice('');
                          setAcceptingOrdersOverride(null);
                          access.selectRestaurant(branch.id);
                        }
                      }}
                    >
                      <div className="owner-branch-option-main">
                        <span className="owner-branch-option-name">
                          {branch.branchName || branch.displayName || branch.name}
                        </span>
                        {branch.shortAddress && (
                          <span className="owner-branch-option-addr">{branch.shortAddress}</span>
                        )}
                      </div>
                      <div className="owner-branch-option-badges">
                        <span className={`owner-branch-status-pill is-${String(branch.status || 'active').toLowerCase()}`}>
                          {branch.status || 'active'}
                        </span>
                        {isCurrent && (
                          <span className="owner-branch-current-tag">
                            {BRANCH_WORKSPACE_COPY.switcherCurrentBadge}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              {access.isOwner && (
                <div className="owner-branch-popover-footer">
                  <button
                    type="button"
                    className="owner-branch-add-btn"
                    onClick={() => {
                      setBranchMenuOpen(false);
                      setAddBranchOpen(true);
                    }}
                  >
                    {BRANCH_WORKSPACE_COPY.switcherAddBranchButton}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <span className="owner-restaurant-name">{selectedRestaurant.displayName || selectedRestaurant.name}</span>
      )}

      {access.canAccess(['business.hours.manage']) && (
        <button
          type="button"
          className={`owner-status-toggle ${isRestaurantOpenNow ? 'is-open' : 'is-closed'}`}
          aria-pressed={isRestaurantOpenNow}
          onClick={handleOpenClosedClick}
          title={isRestaurantOpenNow ? 'Click to close restaurant' : 'Click to open restaurant'}
        >
          <span className="owner-status-dot" aria-hidden="true" />
          <span>{isRestaurantOpenNow ? 'Open' : 'Closed'}</span>
        </button>
      )}
    </div>
  ) : null;

  return (
    <div className="owner-shell navigation-shell">
      <div className={`owner-sidebar navigation-sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>
        <SideBar
          items={navItems}
          activeId={activeItem}
          collapsed={collapsed}
          onToggleCollapse={toggleCollapsed}
          mobileOpen={mobileOpen}
          onMobileClose={() => setMobileOpen(false)}
          logoHref="/owner"
          onLogout={requestLogout}
        />
      </div>

      <div className={`owner-main navigation-main ${collapsed ? 'sidebar-collapsed' : ''}`}>
        <TopBar
          mobileMenuOpen={mobileOpen}
          onMenuToggle={() => setMobileOpen((value) => !value)}
          notificationsSlot={<OwnerNotificationsMenu />}
          roleLabel={ROLE_META.restaurant.label}
          roleTone={ROLE_META.restaurant.tone}
          showThemeToggle
          headingExtras={restaurantControl}
          profileButton={(
            <ProfileMenu
              profileName={profileName}
              profileEmail={profileEmail}
              profileInitials={initials}
              profileAvatar={user?.avatar}
              roleLabel={ROLE_META.restaurant.label}
              roleTone={ROLE_META.restaurant.tone}
              menuItems={profileMenuItems}
            />
          )}
        />
        <main className="owner-content">
          {branchNotice && (
            <div className="owner-branch-notice" role="status">
              <span>{branchNotice}</span>
              <button type="button" onClick={() => setBranchNotice('')} aria-label="Dismiss notice">✕</button>
            </div>
          )}
          {selectedRestaurant && selectedRestaurant.status !== 'active' ? (
            <section
              aria-label="Restaurant application status"
              style={{
                maxWidth: 640,
                margin: '48px auto',
                padding: '28px 24px',
                borderRadius: 12,
                border: '1px solid var(--border-primary)',
                background: 'var(--surface-primary)',
              }}
            >
              <h2 style={{ margin: '0 0 8px' }}>Restaurant Workspace Pending Activation</h2>
              <p style={{ margin: '0 0 16px', color: 'var(--text-secondary)' }}>
                <strong>{selectedRestaurant.displayName || selectedRestaurant.name || 'Your restaurant'}</strong> currently has status{' '}
                <strong>{selectedRestaurant.status}</strong>. The owner workspace is available once your restaurant
                application is approved and active.
              </p>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <Link to="/become-a-partner/status" className="salo-btn salo-btn--primary">
                  View Application Status
                </Link>
                <Link to="/customer" className="salo-btn salo-btn--outline">
                  Return to Customer Portal
                </Link>
              </div>
            </section>
          ) : (
            <div key={selectedRestaurantId || 'default'} className="owner-branch-scope">
              {children}
            </div>
          )}
        </main>
      </div>

      <ConfirmDialog
        open={closeConfirmOpen}
        title="Close restaurant?"
        message="Customers will not be able to place new orders while your restaurant is closed."
        confirmLabel="Close restaurant"
        cancelLabel="Cancel"
        onConfirm={() => {
          setCloseConfirmOpen(false);
          applyOpenClosedStatus(false);
        }}
        onCancel={() => setCloseConfirmOpen(false)}
      />

      <Modal
        open={supportOpen}
        onClose={() => setSupportOpen(false)}
        title="Partner Support"
        size="sm"
      >
        <div className="owner-support-modal">
          <p className="owner-support-intro">
            Need help managing orders, reservations, or restaurant settings?
          </p>
          <div className="owner-support-links">
            <Link to="/owner/orders" onClick={() => setSupportOpen(false)} className="owner-support-link">
              <span>View active orders</span>
              <span aria-hidden="true">→</span>
            </Link>
            <Link to="/owner/profile" onClick={() => setSupportOpen(false)} className="owner-support-link">
              <span>Restaurant profile &amp; hours</span>
              <span aria-hidden="true">→</span>
            </Link>
            <Link to="/owner/settings" onClick={() => setSupportOpen(false)} className="owner-support-link">
              <span>Workspace settings</span>
              <span aria-hidden="true">→</span>
            </Link>
          </div>
          <p className="owner-support-contact">
            Partner support: <strong>partners@salo.local</strong> · Daily 8:00 AM – 10:00 PM
          </p>
        </div>
      </Modal>

      <SwitchAccountModal
        open={switchAccountOpen}
        onClose={() => setSwitchAccountOpen(false)}
        currentRole="restaurant"
      />

      <RoleOnboardingModal
        open={businessOnboarding.shouldShow}
        role="business"
        user={businessOnboarding.user}
        businessChecklist={businessOnboarding.businessChecklist}
        onComplete={businessOnboarding.completeOnboarding}
        onSkip={businessOnboarding.skipOnboarding}
      />

      <ConfirmDialog {...logoutDialogProps} />

      {access.isOwner && (
        <AddBranchModal
          open={addBranchOpen}
          onClose={() => setAddBranchOpen(false)}
          onCreated={() => setBranchNotice(BRANCH_WORKSPACE_COPY.addBranchSuccessNote)}
        />
      )}
    </div>
  );
}
