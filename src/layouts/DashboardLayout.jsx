import { useState } from 'react';
import TopBar from '../components/navigation/TopBar';
import SideBar from '../components/navigation/SideBar';

/**
 * SALO Dashboard Layout Shell
 *
 * Shared by all role-specific dashboards.
 * Pass role-specific navItems and topbar config from parent.
 */
export default function DashboardLayout({
  navItems = [],
  activeNavId,
  onNavItemClick,
  userName,
  userInitials,
  userAvatar,
  topbarSearch,
  topbarActions,
  children,
}) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="dashboard-shell">
      {/* Sidebar */}
      <div
        className={`dashboard-sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}
        style={{ width: sidebarCollapsed ? 'var(--sidebar-collapsed-width)' : 'var(--sidebar-width)' }}
      >
        <SideBar
          items={navItems}
          activeId={activeNavId}
          onItemClick={onNavItemClick}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
          mobileOpen={mobileOpen}
          onMobileClose={() => setMobileOpen(false)}
        />
      </div>

      {/* Main area */}
      <div className={`dashboard-main ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
        <TopBar
          userName={userName}
          userInitials={userInitials}
          userAvatar={userAvatar}
          search={topbarSearch}
          actions={topbarActions}
          onMenuToggle={() => setMobileOpen((v) => !v)}
          logo={<span />} {/* Logo lives in sidebar */}
        />
        <main className="dashboard-content">
          {children}
        </main>
      </div>
    </div>
  );
}
