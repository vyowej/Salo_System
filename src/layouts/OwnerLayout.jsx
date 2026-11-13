import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useLogout } from '../hooks/useLogout';
import { useSidebarCollapse } from '../hooks/useSidebarCollapse';
import { useRestaurantAccess } from '../features/restaurant/access/useRestaurantAccess';
import TopBar from '../components/navigation/TopBar';
import SideBar from '../components/navigation/SideBar';
import ProfileMenu from '../components/navigation/ProfileMenu';
import ConfirmDialog from '../components/common/ConfirmDialog';
import Modal from '../components/common/Modal';
import {
  OWNER_NAV_CONFIG,
  OWNER_SIDEBAR_COLLAPSED_KEY,
} from '../components/navigation/ownerNavConfig';
import restaurantService from '../services/restaurantService';
import { getLocalDateKey, normalizeOperatingHours } from '../services/demo/operatingHours';
import '../components/navigation/NavigationShell.css';
import './OwnerLayout.css';

const mkIcon = (path) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={path} />
  </svg>
);

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
  const [pendingOrdersCount, setPendingOrdersCount] = useState(0);
  const [pendingReservationsCount, setPendingReservationsCount] = useState(0);

  const selectedRestaurant = access.selectedRestaurant;
  const selectedRestaurantId = selectedRestaurant?.id;

  useEffect(() => {
    const syncCounts = () => {
      if (!selectedRestaurantId) {
        setPendingOrdersCount(0);
        setPendingReservationsCount(0);
        return;
      }

      try {
        if (access.canAccessNavigationItem('orders')) {
          const orders = restaurantService.getOrders(selectedRestaurantId);
          setPendingOrdersCount(
            orders.filter(
              (order) =>
                ['Pending', 'Pending Confirmation'].includes(order.status) ||
                order.cancellationRequest?.status === 'requested'
            ).length
          );
        } else {
          setPendingOrdersCount(0);
        }
      } catch {
        setPendingOrdersCount(0);
      }

      try {
        if (access.canAccessNavigationItem('reservations')) {
          const reservations = restaurantService.getReservations(selectedRestaurantId);
          setPendingReservationsCount(
            reservations.filter((res) => res.status === 'Pending').length
          );
        } else {
          setPendingReservationsCount(0);
        }
      } catch {
        setPendingReservationsCount(0);
      }
    };

    syncCounts();
    window.addEventListener('salo:demoStoreUpdated', syncCounts);
    return () => window.removeEventListener('salo:demoStoreUpdated', syncCounts);
  }, [selectedRestaurantId, access]);

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

  const isRestaurantOpenNow = Boolean(
    selectedRestaurant?.isOpen &&
    selectedRestaurant?.operatingSchedule?.acceptingOrders !== false
  );

  const applyOpenClosedStatus = (nextOpen) => {
    if (!selectedRestaurantId) return;
    try {
      const currentHours = normalizeOperatingHours(
        restaurantService.getOperatingHours(selectedRestaurantId)
      );
      const todayKey = getLocalDateKey(new Date());
      const filteredClosures = (currentHours.temporaryClosures || []).filter(
        (closure) => !(closure.startDate <= todayKey && closure.endDate >= todayKey)
      );

      const nextHours = nextOpen
        ? {
            ...currentHours,
            acceptingOrders: true,
            temporaryClosures: filteredClosures,
          }
        : {
            ...currentHours,
            acceptingOrders: false,
            temporaryClosures: [
              ...filteredClosures,
              {
                id: 'manual-close-today',
                startDate: todayKey,
                endDate: todayKey,
                reason: 'Temporarily closed by owner',
              },
            ],
          };

      restaurantService.updateOperatingHours(nextHours, selectedRestaurantId);
    } catch {
      /* Ignore if current staff role cannot manage hours */
    }
  };

  const handleOpenClosedClick = () => {
    if (isRestaurantOpenNow) {
      setCloseConfirmOpen(true);
    } else {
      applyOpenClosedStatus(true);
    }
  };

  const profileMenuItems = [
    ...(access.canAccessNavigationItem('profile')
      ? [{
          id: 'profile',
          type: 'link',
          label: 'Restaurant Profile',
          href: '/owner/profile',
          icon: mkIcon('M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2 M12 3a4 4 0 100 8 4 4 0 000-8z'),
        }]
      : []),
    ...(access.canAccessNavigationItem('activity')
      ? [{
          id: 'activity',
          type: 'link',
          label: 'Activity Log',
          href: '/owner/activity',
          icon: mkIcon('M3 12h4l3-8 4 16 3-8h4'),
        }]
      : []),
    ...(access.canAccessNavigationItem('settings')
      ? [{
          id: 'settings',
          type: 'link',
          label: 'Settings',
          href: '/owner/settings',
          icon: mkIcon('M12 15a3 3 0 100-6 3 3 0 000 6z M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9c.26.604.852.997 1.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z'),
        }]
      : []),
    {
      id: 'support',
      label: 'Support',
      icon: mkIcon('M12 22a10 10 0 100-20 10 10 0 000 20z M9.5 9a2.5 2.5 0 014.8.8c0 1.7-2.3 2.2-2.3 3.7 M12 17h.01'),
      onClick: () => setSupportOpen(true),
    },
    {
      id: 'logout',
      label: 'Log out',
      icon: mkIcon('M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4 M16 17l5-5-5-5 M21 12H9'),
      onClick: requestLogout,
      danger: true,
    },
  ];

  const hasMultipleRestaurants = access.restaurants.length > 1;
  const restaurantControl = selectedRestaurant ? (
    <div className="owner-topbar-controls">
      {hasMultipleRestaurants ? (
        <select
          className="owner-restaurant-select"
          aria-label="Select restaurant"
          value={access.selectedRestaurantId || ''}
          onChange={(event) => access.selectRestaurant(event.target.value)}
        >
          {access.restaurants.map((restaurant) => (
            <option key={restaurant.id} value={restaurant.id}>
              {restaurant.name}
            </option>
          ))}
        </select>
      ) : (
        <span className="owner-restaurant-name">{selectedRestaurant.name}</span>
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

  const totalPendingAlerts = pendingOrdersCount + pendingReservationsCount;
  const bellTarget = pendingOrdersCount > 0 || pendingReservationsCount === 0
    ? '/owner/orders'
    : '/owner/reservations';

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
          showNotifications
          notificationCount={totalPendingAlerts}
          notificationsHref={bellTarget}
          showThemeToggle={false}
          showUserInfo={false}
          headingExtras={restaurantControl}
          profileButton={(
            <ProfileMenu
              profileName={profileName}
              profileEmail={profileEmail}
              profileInitials={initials}
              profileAvatar={user?.avatar}
              menuItems={profileMenuItems}
            />
          )}
        />
        <main className="owner-content">
          {!restaurantService.dataSource && (
            <div className="owner-data-state" role="status">Loading restaurant workspace…</div>
          )}
          {children}
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

      <ConfirmDialog {...logoutDialogProps} />
    </div>
  );
}
