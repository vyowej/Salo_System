import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import './SideBar.css';

/**
 * SALO Sidebar Navigation
 *
 * Dual-pane layout: a slim icon rail (always visible) plus an expandable
 * navigation panel. Items that share a `section` are rendered in the panel
 * as a collapsible group; items without a section (or single-item sections)
 * are rendered as top-level rows.
 *
 * @param {Array}    items     - [{id, label, icon, badge, section, href}]
 * @param {string}   activeId
 * @param {function} onItemClick - (item) => void
 * @param {boolean}  collapsed  - when true only the icon rail is shown
 * @param {function} onToggleCollapse
 * @param {boolean}  mobileOpen
 * @param {function} onMobileClose
 * @param {string}   title      - panel heading (defaults to "SALO")
 * @param {string}   subtitle   - small caption under the panel heading
 * @param {node}     headerAction - optional control rendered at the top-right of the panel
 * @param {node}     profile    - avatar / profile menu rendered at the bottom of the rail
 * @param {node}     footer     - extra content rendered at the bottom of the panel
 */
export default function SideBar({
  items = [],
  activeId,
  onItemClick,
  collapsed = false,
  onToggleCollapse,
  mobileOpen = false,
  onMobileClose,
  useRouterLinks = false,
  title = 'SALO',
  subtitle,
  headerAction,
  profile,
  footer,
}) {
  const sections = useMemo(() => groupBySection(items), [items]);
  const activeSection = sections.find((group) => group.items.some((item) => item.id === activeId))?.section;
  const [openSections, setOpenSections] = useState(() => new Set(activeSection ? [activeSection] : []));

  // Make sure the group that holds the current page is expanded.
  useEffect(() => {
    if (!activeSection) return;
    setOpenSections((current) => {
      if (current.has(activeSection)) return current;
      const next = new Set(current);
      next.add(activeSection);
      return next;
    });
  }, [activeSection]);

  const toggleSection = (section) => {
    setOpenSections((current) => {
      const next = new Set(current);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  };

  const handleItemClick = (item) => {
    onItemClick?.(item);
    onMobileClose?.();
  };

  return (
    <>
      {/* Mobile backdrop */}
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
        {/* ── Icon rail ─────────────────────────────────── */}
        <div className="sidebar-rail">
          <div className="sidebar-rail-logo" title="SALO">
            <img src="/brand/salo-icon.png" alt="SALO" draggable={false} />
          </div>

          <div className="sidebar-rail-nav">
            {items.map((item) => (
              <NavLink
                key={item.id}
                item={item}
                useRouterLinks={useRouterLinks}
                className={`sidebar-rail-item ${item.id === activeId ? 'active' : ''}`}
                active={item.id === activeId}
                onClick={() => handleItemClick(item)}
                title={item.label}
                ariaLabel={item.label}
              >
                <span className="sidebar-rail-icon" aria-hidden="true">{item.icon}</span>
                {hasBadge(item) && <span className="sidebar-rail-badge" aria-hidden="true" />}
              </NavLink>
            ))}
          </div>

          <div className="sidebar-rail-bottom">
            {onToggleCollapse && (
              <button
                className="sidebar-rail-btn sidebar-toggle-btn"
                onClick={onToggleCollapse}
                aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                aria-expanded={!collapsed}
                type="button"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="3" y="3" width="18" height="18" rx="3" />
                  <path d="M9 3v18" />
                  <path d={collapsed ? 'M13 10l2 2-2 2' : 'M16 10l-2 2 2 2'} />
                </svg>
              </button>
            )}
            {profile && <div className="sidebar-rail-profile">{profile}</div>}
          </div>
        </div>

        {/* ── Expandable panel ──────────────────────────── */}
        <div className="sidebar-panel" inert={collapsed && !mobileOpen}>
          <div className="sidebar-panel-header">
            <div className="sidebar-panel-heading">
              <h2 className="sidebar-panel-title">{title}</h2>
              {subtitle && <p className="sidebar-panel-subtitle">{subtitle}</p>}
            </div>
            {headerAction && <div className="sidebar-panel-action">{headerAction}</div>}
          </div>

          <div className="sidebar-nav">
            {sections.map(({ section, items: sectionItems }) => {
              const isGroup = Boolean(section) && sectionItems.length > 1;

              if (!isGroup) {
                return sectionItems.map((item) => (
                  <SideBarItem
                    key={item.id}
                    item={item}
                    active={item.id === activeId}
                    useRouterLinks={useRouterLinks}
                    onClick={() => handleItemClick(item)}
                  />
                ));
              }

              const open = openSections.has(section);
              const groupId = `sidebar-group-${slugify(section)}`;
              const containsActive = sectionItems.some((item) => item.id === activeId);

              return (
                <div key={section} className={`sidebar-group ${open ? 'open' : ''} ${containsActive ? 'has-active' : ''}`}>
                  <button
                    type="button"
                    className="sidebar-item sidebar-group-toggle"
                    aria-expanded={open}
                    aria-controls={groupId}
                    onClick={() => toggleSection(section)}
                  >
                    <span className="sidebar-item-icon" aria-hidden="true">
                      {getSectionIcon(section) || sectionItems[0]?.icon}
                    </span>
                    <span className="sidebar-item-label">{section}</span>
                    <span className="sidebar-group-indicator" aria-hidden="true">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <path d="M5 12h14" />
                        {!open && <path d="M12 5v14" />}
                      </svg>
                    </span>
                  </button>

                  {open && (
                    <div className="sidebar-subnav" id={groupId}>
                      {sectionItems.map((item) => (
                        <NavLink
                          key={item.id}
                          item={item}
                          useRouterLinks={useRouterLinks}
                          className={`sidebar-subitem ${item.id === activeId ? 'active' : ''}`}
                          active={item.id === activeId}
                          onClick={() => handleItemClick(item)}
                        >
                          <span className="sidebar-subitem-dot" aria-hidden="true" />
                          <span className="sidebar-item-label">{item.label}</span>
                          {hasBadge(item) && <span className="sidebar-item-badge">{item.badge}</span>}
                        </NavLink>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer slot */}
          {footer && (
            <div className="sidebar-footer">
              {footer}
            </div>
          )}
        </div>
      </nav>
    </>
  );
}

function NavLink({ item, useRouterLinks, className, active, onClick, title, ariaLabel, children }) {
  const Tag = item.href ? (useRouterLinks ? Link : 'a') : 'button';
  const destinationProps = item.href
    ? (useRouterLinks ? { to: item.href } : { href: item.href })
    : {};

  return (
    <Tag
      {...destinationProps}
      className={className}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      aria-label={ariaLabel}
      title={title}
      type={Tag === 'button' ? 'button' : undefined}
    >
      {children}
    </Tag>
  );
}

function SideBarItem({ item, active, onClick, useRouterLinks }) {
  return (
    <NavLink
      item={item}
      useRouterLinks={useRouterLinks}
      className={`sidebar-item ${active ? 'active' : ''}`}
      active={active}
      onClick={onClick}
    >
      {item.icon && (
        <span className="sidebar-item-icon" aria-hidden="true">
          {item.icon}
        </span>
      )}
      <span className="sidebar-item-label">{item.label}</span>
      {hasBadge(item) && (
        <span className="sidebar-item-badge">{item.badge}</span>
      )}
    </NavLink>
  );
}

function hasBadge(item) {
  return item.badge !== undefined && item.badge !== null && item.badge !== 0 && item.badge !== false;
}

function slugify(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

/**
 * Groups items by section. An item without a `section` inherits the section
 * of the item before it, so a section only needs to be declared once.
 */
function groupBySection(items) {
  const groups = [];
  let currentSection = '';
  for (const item of items) {
    if (item.section) currentSection = item.section;
    const last = groups[groups.length - 1];
    if (last && last.section === currentSection) {
      last.items.push(item);
    } else {
      groups.push({ section: currentSection, items: [item] });
    }
  }
  return groups;
}

const SECTION_ICON_PATHS = {
  workspace: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
  operations: 'M5 7h14l-1 13H6L5 7zM9 7V5a3 3 0 016 0v2',
  growth: 'M3 17l6-6 4 4 8-8M15 7h6v6',
  management: 'M4 8h16v12H4zM9 8V5h6v3M4 13h16',
  dining: 'M7 2v9a2 2 0 002 2v9M5 2v6M9 2v6M17 2c-1.7 1-3 3.2-3 6s1.3 4 3 4v10',
  activity: 'M3 12h4l3-8 4 16 3-8h4',
  account: 'M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 3a4 4 0 100 8 4 4 0 000-8z',
};

function getSectionIcon(section) {
  const path = SECTION_ICON_PATHS[String(section).toLowerCase()];
  if (!path) return null;
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={path} />
    </svg>
  );
}
