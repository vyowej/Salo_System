import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useLogout } from '../hooks/useLogout';
import ConfirmDialog from '../components/common/ConfirmDialog';
import { AdminToastViewport } from '../features/admin/components/Modal';
import AdminSidebar from '../features/admin/components/AdminSidebar';
import AdminTopbar from '../features/admin/components/AdminTopbar';
import { getAdminNavItems } from '../features/admin/constants';
import useAdminSession from '../features/admin/contexts/useAdminSession';
import '../components/navigation/NavigationShell.css';
import './AdminLayout.css';

function resolveAdminPageTitle(pathname, navItems) {
  if (pathname === '/admin/settings/security') return 'Security and Sessions';
  if (pathname.startsWith('/admin/orders/disputes')) return 'Disputes';
  if (pathname.startsWith('/admin/orders/')) return 'Order Details';
  if (pathname.startsWith('/admin/reservations/')) return 'Reservation Details';
  if (pathname.startsWith('/admin/accounts/')) return 'Account Details';
  if (pathname.startsWith('/admin/administrators/')) return 'Administrator Details';
  if (pathname.startsWith('/admin/restaurants/')) return 'Restaurant Details';
  if (pathname.startsWith('/admin/riders/')) return 'Rider Details';
  const matched = navItems.find((item) => (
    item.href === '/admin'
      ? pathname === item.href
      : pathname === item.href || pathname.startsWith(`${item.href}/`)
  ));
  return matched?.label || 'Admin';
}

export default function AdminLayout({ children }) {
  const { currentAdmin } = useAdminSession();
  const { requestLogout, logoutDialogProps } = useLogout();
  const location = useLocation();

  const [collapsed, setCollapsed] = useState(() => {
    try {
      const stored = localStorage.getItem('salo_admin_sidebar_collapsed');
      return stored === null ? false : stored === 'true';
    } catch {
      return false;
    }
  });
  const [mobileOpen, setMobileOpen] = useState(false);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('salo_admin_sidebar_collapsed', String(next));
      } catch {
        // Ignore storage errors
      }
      return next;
    });
  };

  const navItems = getAdminNavItems(currentAdmin.role);
  const activeItem = navItems.find((item) => (
    item.href === '/admin'
      ? location.pathname === item.href
      : location.pathname === item.href || location.pathname.startsWith(`${item.href}/`)
  ))?.id || 'dashboard';
  const topBarTitle = resolveAdminPageTitle(location.pathname, navItems);

  return (
    <div className="admin-shell navigation-shell">
      <AdminSidebar
        role={currentAdmin.role}
        activeId={activeItem}
        collapsed={collapsed}
        onToggleCollapse={toggleCollapsed}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
        onLogout={requestLogout}
      />

      <div className={`admin-main navigation-main ${collapsed ? 'sidebar-collapsed' : ''}`}>
        <AdminTopbar
          title={topBarTitle}
          currentAdmin={currentAdmin}
          mobileMenuOpen={mobileOpen}
          onMenuToggle={() => setMobileOpen((value) => !value)}
          onLogout={requestLogout}
        />
        <main className="admin-content">{children}</main>
      </div>
      <ConfirmDialog {...logoutDialogProps} />
      <AdminToastViewport />
    </div>
  );
}
