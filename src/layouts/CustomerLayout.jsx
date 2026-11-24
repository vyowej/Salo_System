import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useCart } from '../hooks/useCart';
import { useLogout } from '../hooks/useLogout';
import useAddresses from '../hooks/useAddresses';
import TopBar from '../components/navigation/TopBar';
import SideBar from '../components/navigation/SideBar';
import ProfileMenu from '../components/navigation/ProfileMenu';
import SwitchAccountModal from '../components/navigation/SwitchAccountModal';
import Modal from '../components/common/Modal';
import ConfirmDialog from '../components/common/ConfirmDialog';
import BackButton from '../components/common/BackButton';
import CustomerGlobalCallListener from '../features/customer/components/CustomerGlobalCallListener';
import CustomerNotificationsMenu from '../features/customer/components/CustomerNotificationsMenu';
import {
  CUSTOMER_NAV_CONFIG,
  CUSTOMER_SIDEBAR_COLLAPSED_KEY,
} from '../components/navigation/customerNavConfig';
import { buildProfileMenuItems, ROLE_META } from '../config/navigationConfig';
import customerService from '../services/customerService';
import '../components/navigation/NavigationShell.css';
import './CustomerLayout.css';



function getInitials(name) {
  const trimmed = (name || '').trim();
  if (!trimmed) return 'C';

  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function readSidebarCollapsed() {
  try {
    const stored = localStorage.getItem(CUSTOMER_SIDEBAR_COLLAPSED_KEY);
    return stored === null ? true : stored === 'true';
  } catch {
    return true;
  }
}

export default function CustomerLayout({ children }) {
  const { user } = useAuth();
  const { totalItemCount } = useCart();
  const { requestLogout, logoutDialogProps } = useLogout();
  const location = useLocation();
  const navigate = useNavigate();

  const [collapsed, setCollapsed] = useState(readSidebarCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [switchAccountOpen, setSwitchAccountOpen] = useState(false);

  const [hasActiveOrder, setHasActiveOrder] = useState(false);
  const [hasReservationUpdate, setHasReservationUpdate] = useState(false);

  const {
    addresses: addressOptions,
    defaultAddress,
    setDefaultAddress: setDefaultAddressApi,
  } = useAddresses();
  const [searchQuery, setSearchQuery] = useState(() => new URLSearchParams(location.search).get('q') || '');
  const [recentSearches, setRecentSearches] = useState(() => customerService.getRecentSearches());
  const [showSearchSuggestions, setShowSearchSuggestions] = useState(false);
  const [addressMenuOpen, setAddressMenuOpen] = useState(false);

  useEffect(() => {
    const nextQuery = new URLSearchParams(location.search).get('q') || '';
    setSearchQuery(nextQuery);
  }, [location.search]);

  useEffect(() => {
    setRecentSearches(customerService.getRecentSearches());
  }, [location.pathname]);

  useEffect(() => {
    const syncAttentionState = () => {
      const notifications = customerService.getNotifications();
      const unread = notifications.filter((item) => !item.read);

      const orders = customerService.getOrders();
      setHasActiveOrder(
        orders.some(
          (o) => !['Completed', 'Cancelled', 'Rejected', 'Partially Completed'].includes(o.overallStatus)
        )
      );

      const unreadReservationNote = unread.some((n) => n.type === 'reservation' || String(n.type || '').startsWith('reservation_'));
      Promise.resolve(customerService.getReservations({ tab: 'upcoming', perPage: 10 }))
        .then((res) => {
          const list = Array.isArray(res) ? res : (res?.items || []);
          const activeReservation = list.some((r) =>
            ['Pending', 'Approved', 'Confirmed', 'Arrived', 'Seated'].includes(r.status)
          );
          setHasReservationUpdate(unreadReservationNote || activeReservation);
        })
        .catch(() => {
          setHasReservationUpdate(unreadReservationNote);
        });
    };

    syncAttentionState();
    window.addEventListener('salo:notificationsUpdated', syncAttentionState);

    return () => {
      window.removeEventListener('salo:notificationsUpdated', syncAttentionState);
    };
  }, [location.pathname]);

  useEffect(() => {
    if (!addressMenuOpen) return undefined;

    const handlePointerDown = (event) => {
      if (!event.target.closest('.customer-topbar-address-selector')) {
        setAddressMenuOpen(false);
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setAddressMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [addressMenuOpen]);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(CUSTOMER_SIDEBAR_COLLAPSED_KEY, String(next));
      } catch {
        // Ignore storage errors
      }
      return next;
    });
  };

  const navItems = useMemo(
    () =>
      CUSTOMER_NAV_CONFIG.map((item) => {
        if (item.id === 'orders') {
          return { ...item, dot: hasActiveOrder };
        }
        if (item.id === 'reservations') {
          return { ...item, dot: hasReservationUpdate };
        }
        return item;
      }),
    [hasActiveOrder, hasReservationUpdate]
  );

  const profileName = user?.name || user?.username || 'Customer';
  const profileEmail = user?.email || user?.username || '';
  const profileInitials = getInitials(profileName);

  const profileMenuItems = buildProfileMenuItems({
    profileHref: ROLE_META.customer.profileHref,
    settingsHref: ROLE_META.customer.settingsHref,
    onSwitchAccount: () => setSwitchAccountOpen(true),
    onLogout: requestLogout,
  });



  const handleSearchSubmit = (nextValue) => {
    const trimmed = String(nextValue || '').trim();
    setSearchQuery(trimmed);
    setShowSearchSuggestions(false);

    if (trimmed) {
      customerService.saveRecentSearch(trimmed);
      setRecentSearches(customerService.getRecentSearches());
    }

    const target = `/customer${trimmed ? `?q=${encodeURIComponent(trimmed)}` : ''}`;
    if (location.pathname !== target) {
      navigate(target);
    }
  };

  const topbarSearch = (
    <div className={`customer-topbar-controls ${mobileSearchOpen ? 'search-expanded' : ''}`}>
      <div className="customer-topbar-location-group">
        <div className="customer-topbar-address-selector">
          <button
            type="button"
            className="customer-topbar-address-button"
            onClick={() => setAddressMenuOpen((value) => !value)}
            aria-expanded={addressMenuOpen}
            aria-label="Select delivery address"
          >
            <span className="customer-topbar-address-icon" aria-hidden="true">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
            </span>
            <span className="customer-topbar-address-copy">
              <span className="customer-topbar-address-label">Deliver to</span>
              <span className="customer-topbar-address-value">
                {defaultAddress ? `${defaultAddress.label} · ${defaultAddress.city}` : 'Set address'}
              </span>
            </span>
          </button>

          {addressMenuOpen && (
            <div className="customer-topbar-address-menu" role="menu" aria-label="Delivery address menu">
              {addressOptions.map((address) => (
                <button
                  key={address.id}
                  type="button"
                  className={`customer-topbar-address-option ${defaultAddress?.id === address.id ? 'active' : ''}`}
                  onMouseDown={async (event) => {
                    event.preventDefault();
                    await setDefaultAddressApi(address.id);
                    setAddressMenuOpen(false);
                  }}
                >
                  <span className="customer-topbar-address-option-name">{address.label}</span>
                  <span className="customer-topbar-address-option-details">{address.city}</span>
                  {defaultAddress?.id === address.id && <span className="customer-topbar-address-selected">Selected</span>}
                </button>
              ))}

              <button
                type="button"
                className="customer-topbar-address-option"
                style={{ color: 'var(--accent)', fontWeight: 600 }}
                onMouseDown={(event) => {
                  event.preventDefault();
                  setAddressMenuOpen(false);
                  navigate('/customer/addresses');
                }}
              >
                + Add a new address
              </button>

              <button
                type="button"
                className="customer-topbar-address-option manage"
                onMouseDown={(event) => {
                  event.preventDefault();
                  setAddressMenuOpen(false);
                  navigate('/customer/addresses');
                }}
              >
                Manage saved addresses
              </button>
            </div>
          )}
        </div>
      </div>

      <button
        type="button"
        className="customer-mobile-search-trigger"
        onClick={() => setMobileSearchOpen((v) => !v)}
        aria-label={mobileSearchOpen ? 'Close search' : 'Open search'}
        aria-expanded={mobileSearchOpen}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          {mobileSearchOpen ? (
            <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
          ) : (
            <>
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" />
            </>
          )}
        </svg>
      </button>

      <div className="customer-topbar-search" role="search">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </svg>
        <input
          type="text"
          value={searchQuery}
          onChange={(event) => {
            const nextValue = event.target.value;
            setSearchQuery(nextValue);
            setShowSearchSuggestions(Boolean(nextValue.trim()) || recentSearches.length > 0);
          }}
          onFocus={() => setShowSearchSuggestions(true)}
          onBlur={() => {
            window.setTimeout(() => setShowSearchSuggestions(false), 120);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              handleSearchSubmit(searchQuery);
            }
          }}
          placeholder="Search restaurants, dishes, cuisines"
          aria-label="Search restaurants"
        />

        {showSearchSuggestions && recentSearches.length > 0 && (
          <div className="customer-topbar-search-suggestions" role="listbox" aria-label="Recent searches">
            {recentSearches.map((item) => (
              <button
                key={item}
                type="button"
                className="customer-topbar-search-suggestion"
                onMouseDown={(event) => {
                  event.preventDefault();
                  handleSearchSubmit(item);
                }}
              >
                <span aria-hidden="true">↩</span>
                <span>{item}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="customer-shell navigation-shell">
      {/* ── Sidebar ────────────────────────────────────── */}
      <div className={`customer-sidebar navigation-sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>
        <SideBar
          items={navItems}
          collapsed={collapsed}
          onToggleCollapse={toggleCollapsed}
          mobileOpen={mobileOpen}
          onMobileClose={() => setMobileOpen(false)}
          logoHref="/customer"
          onLogout={requestLogout}
          onItemClick={(item) => {
            if (item.action === 'support') {
              setSupportOpen(true);
            }
          }}
          footer={
            !collapsed ? (
              <Link to="/customer/partner" className="customer-partner-link" onClick={() => setMobileOpen(false)}>
                <span>Become a Partner</span>
                <span aria-hidden="true">→</span>
              </Link>
            ) : null
          }
        />
      </div>

      {/* ── Main Area ──────────────────────────────────── */}
      <div className={`customer-main navigation-main ${collapsed ? 'sidebar-collapsed' : ''}`}>
        <TopBar
          mobileMenuOpen={mobileOpen}
          onMenuToggle={() => setMobileOpen((v) => !v)}
          showNotifications={false}
          headingPrefix={location.pathname.startsWith('/customer/restaurants/') ? <BackButton fallbackTo="/customer" /> : null}
          roleLabel={ROLE_META.customer.label}
          roleTone={ROLE_META.customer.tone}
          showThemeToggle
          search={topbarSearch}
          profileButton={(
            <ProfileMenu
              profileName={profileName}
              profileEmail={profileEmail}
              profileInitials={profileInitials}
              profileAvatar={user?.avatar}
              roleLabel={ROLE_META.customer.label}
              roleTone={ROLE_META.customer.tone}
              menuItems={profileMenuItems}
            />
          )}
          actions={
            <>
              <Link
                to="/customer/favorites"
                className="topbar-btn topbar-favorite-action"
                aria-label="View favorites"
                title="Favorites"
                style={{ textDecoration: 'none' }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <path d="M12 21s-8.5-4.9-10-9.5C1.2 8.5 3 5 6.8 5c2.1 0 3.3 1.1 4.2 2.5.9-1.4 2.1-2.5 4.2-2.5 3.8 0 5.6 3.5 5.6 6.5C20.5 16.1 12 21 12 21z" />
                </svg>
              </Link>

              <Link
                to="/customer/cart"
                className="topbar-btn topbar-cart-action"
                aria-label={`Shopping cart with ${totalItemCount} items`}
                title="Multi-Cart"
                style={{ textDecoration: 'none' }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z M3 6h18 M16 10a4 4 0 01-8 0" />
                </svg>
                {totalItemCount > 0 && (
                  <span className="topbar-cart-count">
                    {totalItemCount > 99 ? '99+' : totalItemCount}
                  </span>
                )}
              </Link>

              <CustomerNotificationsMenu />
            </>
          }
        />

        <main className="customer-content">
          {children}
        </main>
      </div>

      <Modal
        open={supportOpen}
        onClose={() => setSupportOpen(false)}
        title="Help & Support"
        size="sm"
      >
        <div className="customer-support-modal">
          <p className="customer-support-intro">
            Need help with an order, table reservation, or your SALO account?
          </p>
          <div className="customer-support-links">
            <Link to="/customer/orders" onClick={() => setSupportOpen(false)} className="customer-support-link">
              <span>Track or manage an order</span>
              <span aria-hidden="true">→</span>
            </Link>
            <Link to="/customer/reservations" onClick={() => setSupportOpen(false)} className="customer-support-link">
              <span>Check table reservations</span>
              <span aria-hidden="true">→</span>
            </Link>
            <Link to="/customer/settings" onClick={() => setSupportOpen(false)} className="customer-support-link">
              <span>Account &amp; security settings</span>
              <span aria-hidden="true">→</span>
            </Link>
          </div>
          <p className="customer-support-contact">
            Support email: <strong>support@salo.local</strong> · Daily 8:00 AM – 10:00 PM
          </p>
        </div>
      </Modal>

      <SwitchAccountModal
        open={switchAccountOpen}
        onClose={() => setSwitchAccountOpen(false)}
        currentRole="customer"
      />

      <ConfirmDialog {...logoutDialogProps} />
      <CustomerGlobalCallListener />
    </div>
  );
}
