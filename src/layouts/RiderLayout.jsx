import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import TopBar from '../components/navigation/TopBar';
import SideBar from '../components/navigation/SideBar';
import Button from '../components/common/Button';
import Badge from '../components/common/Badge';
import { riderMockData } from '../features/rider/mocks';
import { RIDER_NAV_ITEMS } from '../features/rider/constants/riderConstants';
import './RiderLayout.css';

const iconPaths = {
  dashboard: 'M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z',
  deliveries: 'M4 4h16v16H4zM8 8h8M8 12h8M8 16h5',
  map: 'M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3zM9 3v15M15 6v15',
  schedule: 'M4 5h16v16H4zM8 3v4M16 3v4M4 10h16',
  earnings: 'M12 2v20M17 6H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6',
  history: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
  notifications: 'M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9M10 21h4',
  support: 'M12 18h.01M9.09 9a3 3 0 015.82 1c0 2-3 3-3 5M22 12a10 10 0 11-20 0 10 10 0 0120 0z',
  profile: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
  settings: 'M12 8a4 4 0 100 8 4 4 0 000-8zM19.4 15a1.7 1.7 0 00.3 1.9l.1.1-1.6 2.8-.2-.1a1.7 1.7 0 00-1.8.4l-.1.1h-3.2l-.1-.2a1.7 1.7 0 00-1.6-1l-.2.1-2.8-1.6.1-.2a1.7 1.7 0 00-.4-1.8l-.1-.1v-3.2l.2-.1a1.7 1.7 0 001-1.6l-.1-.2 1.6-2.8.2.1a1.7 1.7 0 001.8-.4l.1-.1h3.2l.1.2a1.7 1.7 0 001.6 1l.2-.1 2.8 1.6-.1.2a1.7 1.7 0 00.4 1.8l.1.1v3.2z',
};

function icon(path) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d={path} /></svg>;
}

export default function RiderLayout({ children }) {
  const { logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [online, setOnline] = useState(false);
  const items = RIDER_NAV_ITEMS.map((item) => ({ ...item, icon: icon(iconPaths[item.id]) }));
  const current = items.find((item) => item.href === location.pathname)?.id || 'dashboard';

  return (
    <div className="rider-shell">
      <div className={`rider-sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>
        <SideBar
          items={items}
          activeId={current}
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((value) => !value)}
          mobileOpen={mobileOpen}
          onMobileClose={() => setMobileOpen(false)}
          footer={(
            <div className="rider-sidebar-footer">
              <Button as={Link} to="/customer" variant="ghost" size="sm" fullWidth>{'Switch to customer view'}</Button>
              <Button variant="ghost" size="sm" fullWidth onClick={async () => { await logout(); navigate('/'); }}>{'Sign out'}</Button>
            </div>
          )}
        />
      </div>

      <div className={`rider-main ${collapsed ? 'sidebar-collapsed' : ''}`}>
        <TopBar
          userName={riderMockData.profile.name}
          userRole={riderMockData.profile.accountStatus}
          userInitials={riderMockData.profile.initials}
          showNotifications={false}
          onMenuToggle={() => setMobileOpen((value) => !value)}
          actions={(
            <div className="rider-top-actions">
              <Button
                variant={online ? 'secondary' : 'outline'}
                size="sm"
                aria-pressed={online}
                onClick={() => setOnline((value) => !value)}
              >
                {online ? 'Driver Mode · Preview' : 'Driver Mode · Off'}
              </Button>
              <Button as={Link} to="/rider/notifications" variant="ghost" size="sm" aria-label="Rider notifications">
                {'Notifications'}
                <Badge variant="primary" size="sm">{riderMockData.notifications.filter((item) => item.unread).length}</Badge>
              </Button>
            </div>
          )}
        />
        <main className="rider-content">
          <div className="rider-active-shortcut">
            <span>{'Active delivery shortcut'}</span>
            <Button as={Link} to="/rider/active" variant={location.pathname === '/rider/active' ? 'primary' : 'outline'} size="sm">
              {riderMockData.activeDelivery ? riderMockData.activeDelivery.id : 'Open delivery workspace'}
            </Button>
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}
