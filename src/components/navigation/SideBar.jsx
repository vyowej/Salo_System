import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import './SideBar.css';

/**
 * SALO Sidebar Navigation
 *
 * Single-panel collapsible sidebar:
 * - collapsed (72px): icon rail with floating hover tooltips
 * - expanded (240px): icon + label
 */
export default function SideBar({
  items = [],
  activeId,
  onItemClick,
  collapsed = false,
  onToggleCollapse,
  mobileOpen = false,
  onMobileClose,
  logoHref = '/customer',
  onLogout,
  profile,
  footer,
}) {
  const { pathname } = useLocation();
  const [tooltip, setTooltip] = useState(null);
  const hasSections = items.some((item) => Boolean(item.section));
  const sections = hasSections ? groupBySection(items) : [{ section: '', items }];

  const handleItemClick = (item) => {
    setTooltip(null);
    onItemClick?.(item);
    onMobileClose?.();
  };

  const showTooltip = (label, event) => {
    if (!collapsed || mobileOpen || !label) return;
    const rect = event.currentTarget.getBoundingClientRect();
    setTooltip({
      label,
      top: rect.top + rect.height / 2,
      left: rect.right + 10,
    });
  };

  const hideTooltip = () => setTooltip(null);

  return (
    <>
      {mobileOpen && (
        <div
          className="sidebar-backdrop"
          onClick={onMobileClose}
          aria-hidden="true"
        />
      )}

      <nav
        className={`sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}
        aria-label="Main navigation"
      >
        {/* ── Brand logo ──────────────────────────────── */}
        <div className="sidebar-header">
          <NavLink
            to={logoHref}
            end
            className="sidebar-logo-link"
            onClick={() => onMobileClose?.()}
            aria-label="SALO Home"
            onMouseEnter={(e) => showTooltip('SALO', e)}
            onMouseLeave={hideTooltip}
            onFocus={(e) => showTooltip('SALO', e)}
            onBlur={hideTooltip}
          >
            <img
              src="/brand/salo-icon.png"
              alt="SALO"
              className="sidebar-logo-img"
              draggable={false}
            />
            <span className="sidebar-logo-wordmark font-display">SALO</span>
          </NavLink>
        </div>

        {/* ── Navigation items ────────────────────────── */}
        <div className="sidebar-nav">
          {sections.map(({ section, items: sectionItems }) => (
            <div key={section || '__flat'} className="sidebar-section">
              {section && (
                <span className="sidebar-section-label">{section}</span>
              )}
              {sectionItems.map((item) => (
                <SideBarItem
                  key={item.id}
                  item={item}
                  pathname={pathname}
                  fallbackActive={item.id === activeId}
                  collapsed={collapsed}
                  onShowTooltip={showTooltip}
                  onHideTooltip={hideTooltip}
                  onClick={() => handleItemClick(item)}
                />
              ))}
            </div>
          ))}
        </div>

        {/* ── Bottom utilities (pinned) ───────────────── */}
        <div className="sidebar-bottom">
          {footer && (
            <div className={`sidebar-footer ${collapsed ? 'collapsed' : ''}`}>
              {footer}
            </div>
          )}

          {profile && (
            <div className="sidebar-bottom-profile">
              {profile}
            </div>
          )}

          {onLogout && (
            <button
              type="button"
              className="sidebar-item sidebar-logout-btn"
              onClick={() => {
                hideTooltip();
                onMobileClose?.();
                onLogout();
              }}
              aria-label="Log out"
              onMouseEnter={(e) => showTooltip('Log out', e)}
              onMouseLeave={hideTooltip}
              onFocus={(e) => showTooltip('Log out', e)}
              onBlur={hideTooltip}
            >
              <span className="sidebar-item-icon" aria-hidden="true">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
              </span>
              <span className="sidebar-item-label">Log out</span>
            </button>
          )}

          {onToggleCollapse && (
            <button
              type="button"
              className="sidebar-item sidebar-collapse-btn"
              onClick={() => {
                hideTooltip();
                onToggleCollapse();
              }}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-expanded={!collapsed}
              onMouseEnter={(e) => showTooltip('Expand sidebar', e)}
              onMouseLeave={hideTooltip}
              onFocus={(e) => showTooltip('Expand sidebar', e)}
              onBlur={hideTooltip}
            >
              <span className="sidebar-item-icon" aria-hidden="true">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="3" />
                  <path d="M9 3v18" />
                  <path d={collapsed ? 'M13 10l2 2-2 2' : 'M16 10l-2 2 2 2'} />
                </svg>
              </span>
              <span className="sidebar-item-label">{collapsed ? 'Expand' : 'Collapse'}</span>
            </button>
          )}
        </div>
      </nav>

      {collapsed && !mobileOpen && tooltip && (
        <div
          className="sidebar-floating-tooltip"
          role="tooltip"
          style={{ top: `${tooltip.top}px`, left: `${tooltip.left}px` }}
        >
          {tooltip.label}
        </div>
      )}
    </>
  );
}

function SideBarItem({
  item,
  pathname,
  fallbackActive,
  collapsed,
  onShowTooltip,
  onHideTooltip,
  onClick,
}) {
  const hasCountBadge = typeof item.badge === 'number' && item.badge > 0;
  const hasDot = Boolean(item.dot) && !hasCountBadge;

  const content = (
    <>
      {item.icon && (
        <span className="sidebar-item-icon" aria-hidden="true">
          {item.icon}
          {hasDot && <span className="sidebar-item-dot" />}
          {hasCountBadge && collapsed && (
            <span className="sidebar-item-rail-badge">
              {item.badge > 9 ? '9+' : item.badge}
            </span>
          )}
        </span>
      )}
      <span className="sidebar-item-label">{item.label}</span>
      {hasCountBadge && (
        <span className="sidebar-item-badge">{item.badge > 99 ? '99+' : item.badge}</span>
      )}
    </>
  );

  if (item.href) {
    return (
      <NavLink
        to={item.href}
        end={item.end}
        onClick={onClick}
        onMouseEnter={(e) => onShowTooltip(item.label, e)}
        onMouseLeave={onHideTooltip}
        onFocus={(e) => onShowTooltip(item.label, e)}
        onBlur={onHideTooltip}
        aria-label={item.label}
        className={({ isActive }) => {
          const matchedExtra = Array.isArray(item.matchPaths)
            && item.matchPaths.includes(pathname);
          const active = isActive || matchedExtra || (!item.end && fallbackActive);
          return `sidebar-item ${active ? 'active' : ''}`;
        }}
      >
        {content}
      </NavLink>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={(e) => onShowTooltip(item.label, e)}
      onMouseLeave={onHideTooltip}
      onFocus={(e) => onShowTooltip(item.label, e)}
      onBlur={onHideTooltip}
      aria-label={item.label}
      className={`sidebar-item ${fallbackActive ? 'active' : ''}`}
    >
      {content}
    </button>
  );
}

function groupBySection(items) {
  const map = new Map();
  for (const item of items) {
    const key = item.section || '';
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return Array.from(map.entries()).map(([section, sectionItems]) => ({
    section,
    items: sectionItems,
  }));
}
