import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import { useRestaurantAccess } from '../features/restaurant/access/useRestaurantAccess';
import { OWNER_NAV_ITEMS } from '../features/restaurant/access/permissionMap';
import TopBar from '../components/navigation/TopBar';
import SideBar from '../components/navigation/SideBar';
import ProfileMenu from '../components/navigation/ProfileMenu';
import restaurantService from '../services/restaurantService';
import '../components/navigation/NavigationShell.css';
import './OwnerLayout.css';

const ICON_PATHS = {
  dashboard: 'M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z',
  profile: 'M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2 M12 3a4 4 0 100 8 4 4 0 000-8z',
  menu: 'M4 6h16M4 12h16M4 18h16',
  orders: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2',
  reservation: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
  tables: 'M3 10h18M5 10V5h14v5M7 10v10m10-10v10',
  inventory: 'M21 8l-9-5-9 5m18 0v8l-9 5m9-13l-9 5m-9-5v8l9 5m0-8v8',
  promotions: 'M20.59 13.41L11 3.83V3H4v7h.83l9.58 9.59a2 2 0 002.83 0l3.35-3.35a2 2 0 000-2.83zM7 7h.01',
  team: 'M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2m16-11a4 4 0 010 8m4 3v-2a4 4 0 00-3-3.87M9 11a4 4 0 100-8 4 4 0 000 8z',
  reports: 'M4 19V5m0 14h17M8 15v-4m5 4V7m5 8v-6',
  activity: 'M3 12h4l3-8 4 16 3-8h4',
  settings: 'M12 8a4 4 0 100 8 4 4 0 000-8zm8.2 4a8.4 8.4 0 00-.1-1.3l1.5-1.2-1.5-2.6-1.8.7a8.2 8.2 0 00-2.2-1.3L15.8 4h-3.1l-.3 2.3a8.2 8.2 0 00-2.2 1.3l-1.8-.7-1.5 2.6 1.5 1.2a8.4 8.4 0 000 2.6l-1.5 1.2 1.5 2.6 1.8-.7a8.2 8.2 0 002.2 1.3l.3 2.3h3.1l.3-2.3a8.2 8.2 0 002.2-1.3l1.8.7 1.5-2.6-1.5-1.2c.1-.4.1-.8.1-1.3z',
};

function icon(name) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d={ICON_PATHS[name]} />
    </svg>
  );
}

function getInitials(name) {
  return (name || 'Owner').split(/\s+/).filter(Boolean).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
}

export default function OwnerLayout({ children }) {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const access = useRestaurantAccess();
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const navItems = OWNER_NAV_ITEMS
    .filter((item) => access.canAccessNavigationItem(item.id))
    .map((item) => ({ ...item, icon: icon(item.icon) }));
  const activeItem = OWNER_NAV_ITEMS.find((item) => (
    item.href === '/owner'
      ? location.pathname === item.href
      : location.pathname.startsWith(item.href)
  ))?.id || 'overview';
  const initials = getInitials(user?.name || user?.username);
  const selectedRestaurant = access.selectedRestaurant;
  const visibleMobileItems = navItems.filter((item) => ['overview', 'orders', 'menu', 'reservations'].includes(item.id));
  const profileName = user?.name || selectedRestaurant?.name || 'Restaurant Team';
  const profileEmail = user?.email || user?.username || 'Restaurant workspace';
  const signOut = async () => {
    await logout();
    navigate('/');
  };
  const profileMenuItems = [
    { id: 'profile', type: 'link', label: 'Business Profile', href: '/owner/profile', icon: icon('profile') },
    { id: 'settings', type: 'link', label: 'Settings', href: '/owner/settings', icon: icon('settings') },
    { id: 'customer', type: 'link', label: 'Switch to Customer View', href: '/customer', icon: icon('dashboard') },
    { id: 'theme', label: 'Dark Mode', toggle: true, onClick: toggleTheme },
    {
      id: 'logout',
      label: 'Sign Out',
      icon: icon('M10 17l5-5-5-5M15 12H3m9-9h7a2 2 0 012 2v14a2 2 0 01-2 2h-7'),
      onClick: signOut,
      danger: true,
    },
  ];

  const restaurantSelector = (
    <label className="owner-restaurant-selector">
      <span>Managing</span>
      <select
        aria-label="Select restaurant"
        value={access.selectedRestaurantId || ''}
        onChange={(event) => access.selectRestaurant(event.target.value)}
      >
        {access.restaurants.map((restaurant) => (
          <option key={restaurant.id} value={restaurant.id}>{restaurant.name}</option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="owner-shell navigation-shell">
      <div className={`owner-sidebar navigation-sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>
        <SideBar
          items={navItems}
          activeId={activeItem}
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((value) => !value)}
          mobileOpen={mobileOpen}
          onMobileClose={() => setMobileOpen(false)}
          footer={(
            <div className="owner-sidebar-footer">
              <ProfileMenu
                placement="sidebar"
                collapsed={collapsed}
                profileName={profileName}
                profileEmail={profileEmail}
                profileInitials={initials}
                profileAvatar={user?.avatar}
                theme={theme}
                menuItems={profileMenuItems}
              />
            </div>
          )}
        />
      </div>

      <div className={`owner-main navigation-main ${collapsed ? 'sidebar-collapsed' : ''}`}>
        <TopBar
          userName={profileName}
          userRole={access.isOwner ? (access.actorType === 'co-owner' ? 'Co-owner' : 'Restaurant Owner') : access.membership?.position || 'Restaurant Staff'}
          userInitials={initials}
          mobileMenuOpen={mobileOpen}
          onMenuToggle={() => setMobileOpen((value) => !value)}
          notificationCount={0}
          showNotifications={false}
          showThemeToggle={false}
          showUserInfo={false}
          profileButton={(
            <ProfileMenu
              profileName={profileName}
              profileEmail={profileEmail}
              profileInitials={initials}
              profileAvatar={user?.avatar}
              theme={theme}
              menuItems={profileMenuItems}
            />
          )}
          actions={restaurantSelector}
        />
        {restaurantService.dataSource === 'demo' && <div className="owner-demo-status" role="status">Demo Data</div>}
        <main className="owner-content">
          {!restaurantService.dataSource && (
            <div className="owner-data-state" role="status">Loading restaurant workspace…</div>
          )}
          {children}
        </main>
        <nav className="owner-mobile-bottom-nav navigation-mobile-bottom-nav" aria-label="Quick restaurant navigation">
          {visibleMobileItems.map((item) => (
            <Link key={item.id} to={item.href} className={`navigation-mobile-nav-item ${item.id === activeItem ? 'active' : ''}`} aria-current={item.id === activeItem ? 'page' : undefined}>
              {icon(item.icon)}
              <span>{item.label}</span>
            </Link>
          ))}
          <Link to="/customer" className="navigation-mobile-nav-item" aria-label="Switch to customer side">
            <span aria-hidden="true">↗</span>
            <span>Customer</span>
          </Link>
        </nav>
      </div>
    </div>
  );
}
