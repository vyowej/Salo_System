import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useCart } from '../hooks/useCart';
import { useTheme } from '../hooks/useTheme';
import { useRestaurantAccess } from '../features/restaurant/access/useRestaurantAccess';
import { OWNER_NAV_ITEMS } from '../features/restaurant/access/permissionMap';
import TopBar from '../components/navigation/TopBar';
import SideBar from '../components/navigation/SideBar';
import customerService from '../services/customerService';
import './CustomerLayout.css';

const mkIcon = (path) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d={path} />
  </svg>
);

const ICONS = {
  home: 'M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z',
  restaurants: 'M3 11l19-9-9 19-2-8-8-2z',
  cart: 'M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z M3 6h18 M16 10a4 4 0 01-8 0',
  orders: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2',
  reservation: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
  addresses: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 110-5 2.5 2.5 0 010 5z',
  profile: 'M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2 M12 3a4 4 0 100 8 4 4 0 000-8z',
};

function getInitials(name) {
  const trimmed = (name || '').trim();
  if (!trimmed) return 'C';

  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function CustomerProfileMenu({
  open,
  triggerRef,
  placement,
  onClose,
  profileName,
  profileEmail,
  profileInitials,
  theme,
  menuItems = [],
}) {
  const popoverRef = useRef(null);
  const [popoverStyle, setPopoverStyle] = useState({});

  useEffect(() => {
    if (!open) return undefined;

    const updatePosition = () => {
      const trigger = triggerRef?.current;
      const popover = popoverRef.current;
      if (!(trigger && popover)) return;

      const triggerRect = trigger.getBoundingClientRect();
      const menuWidth = Math.min(280, window.innerWidth - 24);
      const menuHeight = popover.offsetHeight || 280;
      const margin = 12;

      let left;
      if (placement === 'sidebar') {
        left = Math.min(
          triggerRect.left + triggerRect.width + 12,
          window.innerWidth - menuWidth - margin,
        );
      } else {
        left = Math.min(
          Math.max(margin, triggerRect.right - menuWidth),
          window.innerWidth - menuWidth - margin,
        );
      }

      const shouldOpenUpward = placement === 'sidebar'
        ? triggerRect.top - menuHeight - 12 > margin
        : triggerRect.bottom + menuHeight + 12 > window.innerHeight - margin;

      const top = shouldOpenUpward
        ? triggerRect.top - menuHeight - 12
        : triggerRect.bottom + 12;

      setPopoverStyle({
        left: `${Math.max(margin, left)}px`,
        top: `${Math.min(Math.max(margin, top), window.innerHeight - menuHeight - margin)}px`,
        width: `${menuWidth}px`,
      });
    };

    const frame = requestAnimationFrame(updatePosition);
    const handleResize = () => updatePosition();
    const handleScroll = () => updatePosition();

    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleScroll, true);

    const handlePointerDown = (event) => {
      const trigger = triggerRef?.current;
      const popover = popoverRef.current;
      if (!trigger || !popover) return;

      const clickedInside = popover.contains(event.target) || trigger.contains(event.target);
      if (!clickedInside) {
        onClose();
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleScroll, true);
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, placement, triggerRef, onClose]);

  const effectiveMenuItems = menuItems;

  if (!open) return null;

  return (
    <div
      ref={popoverRef}
      className="customer-profile-popover"
      role="menu"
      aria-label="Profile menu"
      style={popoverStyle}
    >
      <div className="customer-profile-popover-header">
        <span className="customer-profile-avatar large" aria-hidden="true">{profileInitials || 'C'}</span>
        <div className="customer-profile-popover-copy">
          <span className="customer-profile-name">{profileName}</span>
          <span className="customer-profile-email">{profileEmail}</span>
        </div>
      </div>

      <div className="customer-profile-menu-list">
        {effectiveMenuItems.map((item) => {
          const sharedClassName = `customer-profile-menu-item ${item.danger ? 'danger' : ''} ${item.toggle ? 'customer-profile-theme-item' : ''}`.trim();

          if (item.type === 'link') {
            return (
              <Link
                key={item.id}
                to={item.href}
                className={sharedClassName}
                onClick={() => onClose()}
                role="menuitem"
              >
                <span className="customer-profile-menu-left">
                  {item.icon}
                  <span>{item.label}</span>
                </span>
              </Link>
            );
          }

          return (
            <button
              key={item.id}
              type="button"
              className={sharedClassName}
              onClick={() => {
                onClose();
                item.onClick?.();
              }}
              role="menuitem"
            >
              {item.toggle ? (
                <>
                  <span>{item.label}</span>
                  <span className={`customer-profile-toggle ${theme === 'dark' ? 'checked' : ''}`} aria-hidden="true">
                    <span className="customer-profile-toggle-thumb" />
                  </span>
                </>
              ) : (
                <span className="customer-profile-menu-left">
                  {item.icon}
                  <span>{item.label}</span>
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function CustomerLayout({ children }) {
  const { user, logout } = useAuth();
  const { totalItemCount } = useCart();
  const { theme, toggleTheme } = useTheme();
  const restaurantAccess = useRestaurantAccess();
  const ownerDestination = OWNER_NAV_ITEMS.find((item) => restaurantAccess.canAccessNavigationItem(item.id))?.href || '/owner';
  const location = useLocation();
  const navigate = useNavigate();
  const sidebarProfileTriggerRef = useRef(null);
  const topbarProfileTriggerRef = useRef(null);

  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notificationCount, setNotificationCount] = useState(0);
  const [favoriteCount, setFavoriteCount] = useState(0);
  const [sidebarProfileMenuOpen, setSidebarProfileMenuOpen] = useState(false);
  const [topbarProfileMenuOpen, setTopbarProfileMenuOpen] = useState(false);
  const [defaultAddress, setDefaultAddress] = useState(() => customerService.getDefaultAddress());
  const [searchQuery, setSearchQuery] = useState(() => new URLSearchParams(location.search).get('q') || '');
  const [recentSearches, setRecentSearches] = useState(() => customerService.getRecentSearches());
  const [showSearchSuggestions, setShowSearchSuggestions] = useState(false);
  const [addressMenuOpen, setAddressMenuOpen] = useState(false);

  useEffect(() => {
    const nextQuery = new URLSearchParams(location.search).get('q') || '';
    setSearchQuery(nextQuery);
  }, [location.search]);

  useEffect(() => {
    setDefaultAddress(customerService.getDefaultAddress());
    setRecentSearches(customerService.getRecentSearches());
  }, [location.pathname]);

  useEffect(() => {
    const syncNotificationCount = () => {
      const unreadCount = customerService.getNotifications().filter((item) => !item.read).length;
      setNotificationCount(unreadCount);
    };

    const syncFavoriteCount = () => {
      setFavoriteCount(customerService.getFavoriteRestaurants().length);
    };

    syncNotificationCount();
    syncFavoriteCount();
    window.addEventListener('salo:notificationsUpdated', syncNotificationCount);
    window.addEventListener('salo:favoritesUpdated', syncFavoriteCount);

    return () => {
      window.removeEventListener('salo:notificationsUpdated', syncNotificationCount);
      window.removeEventListener('salo:favoritesUpdated', syncFavoriteCount);
    };
  }, [location.pathname]);

  useEffect(() => {
    if (!sidebarProfileMenuOpen && !topbarProfileMenuOpen) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setSidebarProfileMenuOpen(false);
        setTopbarProfileMenuOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [sidebarProfileMenuOpen, topbarProfileMenuOpen]);

  useEffect(() => {
    if (!addressMenuOpen) return undefined;

    const handlePointerDown = (event) => {
      const selector = event.target.closest('.customer-topbar-address-selector');
      if (!selector) {
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

  const navItems = [
    { id: 'home', label: 'Explore & Feed', icon: mkIcon(ICONS.home), href: '/customer', section: 'Dining' },
    { id: 'restaurants', label: 'All Restaurants', icon: mkIcon(ICONS.restaurants), href: '/customer/restaurants' },
    {
      id: 'cart',
      label: 'Multi-Cart',
      icon: mkIcon(ICONS.cart),
      href: '/customer/cart',
      badge: totalItemCount > 0 ? totalItemCount : null,
    },
    { id: 'orders', label: 'My Orders', icon: mkIcon(ICONS.orders), href: '/customer/orders', section: 'Activity' },
    { id: 'favorites', label: 'Favorites', icon: mkIcon('M12 21s-8.5-4.9-10-9.5C1.2 8.5 3 5 6.8 5c2.1 0 3.3 1.1 4.2 2.5.9-1.4 2.1-2.5 4.2-2.5 3.8 0 5.6 3.5 5.6 6.5C20.5 16.1 12 21 12 21z'), href: '/customer/favorites', badge: favoriteCount > 0 ? favoriteCount : null },
    { id: 'notifications', label: 'Notifications', icon: mkIcon('M12 22a2.5 2.5 0 002.45-2h-4.9A2.5 2.5 0 0012 22zm8-6V11a8 8 0 10-16 0v5l-2 2v1h20v-1l-2-2z'), href: '/customer/notifications', badge: notificationCount > 0 ? notificationCount : null },
    { id: 'reservations', label: 'Table Bookings', icon: mkIcon(ICONS.reservation), href: '/customer/reservations' },
    { id: 'settings', label: 'Settings', icon: mkIcon(ICONS.profile), href: '/customer/profile', section: 'Account' },
  ];

  // Resolve active nav item based on pathname
  const activeItem = navItems.find((item) => {
    if (item.href === '/customer' && location.pathname === '/customer') return true;
    if (item.href !== '/customer' && location.pathname.startsWith(item.href)) return true;
    return false;
  })?.id || 'home';

  const mobileNavItems = [
    { id: 'home', label: 'Home', href: '/customer', icon: mkIcon(ICONS.home) },
    { id: 'restaurants', label: 'Browse', href: '/customer/restaurants', icon: mkIcon(ICONS.restaurants) },
    { id: 'cart', label: 'Cart', href: '/customer/cart', icon: mkIcon(ICONS.cart), badge: totalItemCount > 0 ? totalItemCount : null },
    { id: 'orders', label: 'Orders', href: '/customer/orders', icon: mkIcon(ICONS.orders) },
    { id: 'reservations', label: 'Book', href: '/customer/reservations', icon: mkIcon(ICONS.reservation) },
  ];

  const profileName = user?.name || user?.username || 'Customer';
  const profileEmail = user?.email || user?.username || 'customer@salo.local';
  const profileInitials = getInitials(profileName);

  const sidebarProfileMenuItems = [
    {
      id: 'settings',
      label: 'Settings',
      icon: mkIcon(ICONS.profile),
      onClick: () => navigate('/customer/profile'),
    },
    ...(restaurantAccess.hasRestaurantAccess ? [{
      id: 'owner-workspace',
      label: 'Restaurant workspace',
      icon: mkIcon(ICONS.restaurants),
      onClick: () => navigate(ownerDestination),
    }] : []),
    {
      id: 'theme',
      label: 'Dark Mode',
      toggle: true,
      onClick: toggleTheme,
    },
    {
      id: 'logout',
      label: 'Log out',
      icon: mkIcon('M10 17l5-5-5-5M15 12H3m9-9h7a2 2 0 012 2v14a2 2 0 01-2 2h-7'),
      onClick: async () => {
        await logout();
        navigate('/');
      },
      danger: true,
    },
  ];

  const topbarProfileMenuItems = [
    {
      id: 'settings',
      label: 'Settings',
      icon: mkIcon(ICONS.profile),
      onClick: () => navigate('/customer/profile'),
    },
    ...(restaurantAccess.hasRestaurantAccess ? [{
      id: 'owner-workspace',
      label: 'Restaurant workspace',
      icon: mkIcon(ICONS.restaurants),
      onClick: () => navigate(ownerDestination),
    }] : []),
    {
      id: 'become-rider',
      label: 'Become a Rider',
      icon: mkIcon('M5 16l2-8h10l2 8M7 16l1 4h8l1-4M9 8V6a3 3 0 016 0v2'),
      onClick: () => navigate('/rider'),
    },
    {
      id: 'partner',
      label: 'Partner with SALO',
      icon: mkIcon('M3 21h18M7 17V7a2 2 0 012-2h6a2 2 0 012 2v10M9 11h6'),
      onClick: () => navigate('/customer/partner'),
    },
    {
      id: 'theme',
      label: 'Dark Mode',
      toggle: true,
      onClick: toggleTheme,
    },
    {
      id: 'logout',
      label: 'Log out',
      icon: mkIcon('M10 17l5-5-5-5M15 12H3m9-9h7a2 2 0 012 2v14a2 2 0 01-2 2h-7'),
      onClick: async () => {
        await logout();
        navigate('/');
      },
      danger: true,
    },
  ];

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

  const addressOptions = customerService.getSavedAddresses();

  const topbarSearch = (
    <div className="customer-topbar-search-panel">
      <div className="customer-topbar-address-selector">
        <button
          type="button"
          className="customer-topbar-address-button"
          onClick={() => setAddressMenuOpen((value) => !value)}
          aria-expanded={addressMenuOpen}
          aria-label="Select delivery address"
        >
          <span className="customer-topbar-address-icon" aria-hidden="true">📍</span>
          <span className="customer-topbar-address-copy">
            <span className="customer-topbar-address-label">Deliver to</span>
            <span className="customer-topbar-address-value">{defaultAddress ? `${defaultAddress.label} · ${defaultAddress.city}` : 'Set address'}</span>
          </span>
        </button>

        {addressMenuOpen && (
          <div className="customer-topbar-address-menu" role="menu" aria-label="Delivery address menu">
            {addressOptions.map((address) => (
              <button
                key={address.id}
                type="button"
                className={`customer-topbar-address-option ${defaultAddress?.id === address.id ? 'active' : ''}`}
                onMouseDown={(event) => {
                  event.preventDefault();
                  const next = customerService.setDefaultAddress(address.id);
                  setDefaultAddress(next.find((item) => item.isDefault) || next[0] || null);
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
              className="customer-topbar-address-option manage"
              onMouseDown={(event) => {
                event.preventDefault();
                setAddressMenuOpen(false);
                navigate('/customer/profile#saved-addresses');
              }}
            >
              Manage saved addresses
            </button>
          </div>
        )}
      </div>

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
    <div className="customer-shell">
      {/* ── Sidebar ────────────────────────────────────── */}
      <div className={`customer-sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>
        <SideBar
          items={navItems}
          activeId={activeItem}
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed(!collapsed)}
          mobileOpen={mobileOpen}
          onMobileClose={() => setMobileOpen(false)}
          footer={
            <div className="customer-profile-footer">
              <div className="customer-sidebar-divider" />

              <button
                type="button"
                className={`customer-partner-promo ${collapsed ? 'collapsed' : ''}`}
                onClick={() => navigate('/customer/partner')}
                title={collapsed ? 'Become a Partner' : undefined}
              >
                <span className="customer-partner-promo-icon" aria-hidden="true">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M3 21h18M7 17V7a2 2 0 012-2h6a2 2 0 012 2v10M9 11h6" />
                  </svg>
                </span>
                {!collapsed && (
                  <span className="customer-partner-promo-copy">
                    <span className="customer-partner-promo-title">Become a Partner</span>
                    <span className="customer-partner-promo-text">Open your restaurant or start as a rider.</span>
                    <span className="customer-partner-promo-link">Learn more</span>
                  </span>
                )}
              </button>

              <div className="customer-profile-menu-wrap">
                <button
                  ref={sidebarProfileTriggerRef}
                  type="button"
                  className={`customer-profile-trigger ${collapsed ? 'collapsed' : ''} ${sidebarProfileMenuOpen ? 'open' : ''}`}
                  aria-expanded={sidebarProfileMenuOpen}
                  aria-haspopup="menu"
                  title={collapsed ? profileName : undefined}
                  onClick={() => setSidebarProfileMenuOpen((value) => !value)}
                >
                  <span className="customer-profile-avatar" aria-hidden="true">{profileInitials || 'C'}</span>
                  {!collapsed && (
                    <span className="customer-profile-meta">
                      <span className="customer-profile-name">{profileName}</span>
                      <span className="customer-profile-email">{profileEmail}</span>
                    </span>
                  )}
                </button>

                <CustomerProfileMenu
                  open={sidebarProfileMenuOpen}
                  triggerRef={sidebarProfileTriggerRef}
                  placement="sidebar"
                  onClose={() => setSidebarProfileMenuOpen(false)}
                  profileName={profileName}
                  profileEmail={profileEmail}
                  profileInitials={profileInitials}
                  theme={theme}
                  toggleTheme={toggleTheme}
                  menuItems={sidebarProfileMenuItems}
                />
              </div>
            </div>
          }
        />
      </div>

      {/* ── Main Area ──────────────────────────────────── */}
      <div className={`customer-main ${collapsed ? 'sidebar-collapsed' : ''}`}>
        <TopBar
          mobileMenuOpen={mobileOpen}
          onMenuToggle={() => setMobileOpen(!mobileOpen)}
          notificationCount={notificationCount}
          showThemeToggle={false}
          showUserInfo={false}
          search={topbarSearch}
          profileButton={
            <button
              ref={topbarProfileTriggerRef}
              type="button"
              className={`topbar-profile-button ${topbarProfileMenuOpen ? 'open' : ''}`}
              aria-label={`${profileName} profile menu`}
              aria-expanded={topbarProfileMenuOpen}
              aria-haspopup="menu"
              onClick={() => setTopbarProfileMenuOpen((value) => !value)}
            >
              <span className="topbar-avatar" aria-hidden="true">
                {user?.avatar ? <img src={user.avatar} alt="" /> : profileInitials}
              </span>
            </button>
          }
          actions={
            <>
              <Link to="/customer/favorites" style={{ textDecoration: 'none' }} title="View favorites">
                <button
                  type="button"
                  className="topbar-btn topbar-favorite-action"
                  aria-label={`View favorites with ${favoriteCount} saved restaurants`}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M12 21s-8.5-4.9-10-9.5C1.2 8.5 3 5 6.8 5c2.1 0 3.3 1.1 4.2 2.5.9-1.4 2.1-2.5 4.2-2.5 3.8 0 5.6 3.5 5.6 6.5C20.5 16.1 12 21 12 21z" />
                  </svg>
                  {favoriteCount > 0 && (
                    <span className="topbar-favorite-count">{favoriteCount > 9 ? '9+' : favoriteCount}</span>
                  )}
                </button>
              </Link>

              <Link to="/customer/cart" style={{ textDecoration: 'none' }} title="View Multi-Cart">
                <button
                  type="button"
                  className="topbar-btn topbar-cart-action"
                  aria-label={`Shopping cart with ${totalItemCount} items`}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z M3 6h18 M16 10a4 4 0 01-8 0" />
                  </svg>
                  {totalItemCount > 0 && (
                    <span className="topbar-cart-count">
                      {totalItemCount}
                    </span>
                  )}
                </button>
              </Link>
            </>
          }
        />

        <CustomerProfileMenu
          open={topbarProfileMenuOpen}
          triggerRef={topbarProfileTriggerRef}
          placement="topbar"
          onClose={() => setTopbarProfileMenuOpen(false)}
          profileName={profileName}
          profileEmail={profileEmail}
          profileInitials={profileInitials}
          theme={theme}
          toggleTheme={toggleTheme}
          menuItems={topbarProfileMenuItems}
        />

        <main className="customer-content">
          {children}
        </main>

        <nav className="customer-mobile-bottom-nav" aria-label="Customer mobile navigation">
          {mobileNavItems.map((item) => {
            const isActive = item.href === '/customer'
              ? location.pathname === '/customer'
              : location.pathname.startsWith(item.href);

            return (
              <Link
                key={item.id}
                to={item.href}
                className={`customer-mobile-nav-item ${isActive ? 'active' : ''}`}
                aria-current={isActive ? 'page' : undefined}
                title={item.label}
              >
                <span className="customer-mobile-nav-icon" aria-hidden="true">
                  {item.icon}
                </span>
                <span className="customer-mobile-nav-label">{item.label}</span>
                {item.badge !== undefined && item.badge !== null && item.badge > 0 && (
                  <span className="customer-mobile-nav-badge">{item.badge > 9 ? '9+' : item.badge}</span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
