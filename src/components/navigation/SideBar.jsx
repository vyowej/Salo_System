import { useState, useCallback } from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import './SideBar.css';

/**
 * SALO Sidebar Navigation
 *
 * @param {Array}    items     - [{id, label, icon, badge, section, href}]
 * @param {string}   activeId
 * @param {function} onItemClick - (item) => void
 * @param {boolean}  collapsed
 * @param {function} onToggleCollapse
 * @param {boolean}  mobileOpen
 * @param {function} onMobileClose
 * @param {node}     footer
 */
export default function SideBar({
  items = [],
  activeId,
  onItemClick,
  collapsed = false,
  onToggleCollapse,
  mobileOpen = false,
  onMobileClose,
  footer,
}) {
  const { theme } = useTheme();

  const logoSrc = theme === 'dark'
    ? '/brand/salo-logo-dark.png'
    : '/brand/salo-logo-light.png';

  const iconSrc = '/brand/salo-icon.png';

  // Group items by section
  const sections = groupBySection(items);

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
        {/* Header */}
        <div className="sidebar-header">
          <div className="sidebar-logo">
            {collapsed
              ? <img src={iconSrc} alt="SALO" style={{ height: 28 }} />
              : <img src={logoSrc} alt="SALO" />}
          </div>
          {onToggleCollapse && (
            <button
              className="sidebar-collapse-btn"
              onClick={onToggleCollapse}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              type="button"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
            </button>
          )}
        </div>

        {/* Nav items */}
        <div className="sidebar-nav">
          {sections.map(({ section, items: sectionItems }) => (
            <div key={section || '__default'}>
              {section && (
                <span className="sidebar-section-label">{section}</span>
              )}
              {sectionItems.map((item) => (
                <SideBarItem
                  key={item.id}
                  item={item}
                  active={item.id === activeId}
                  collapsed={collapsed}
                  onClick={() => {
                    onItemClick?.(item);
                    onMobileClose?.();
                  }}
                />
              ))}
            </div>
          ))}
        </div>

        {/* Footer slot */}
        {footer && <div className="sidebar-footer">{footer}</div>}
      </nav>
    </>
  );
}

function SideBarItem({ item, active, collapsed, onClick }) {
  const Tag = item.href ? 'a' : 'button';

  return (
    <Tag
      className={`sidebar-item ${active ? 'active' : ''}`}
      href={item.href}
      onClick={!item.href ? onClick : undefined}
      aria-current={active ? 'page' : undefined}
      title={collapsed ? item.label : undefined}
      type={Tag === 'button' ? 'button' : undefined}
    >
      {item.icon && (
        <span className="sidebar-item-icon" aria-hidden="true">
          {item.icon}
        </span>
      )}
      <span className="sidebar-item-label">{item.label}</span>
      {item.badge !== undefined && item.badge !== null && (
        <span className="sidebar-item-badge">{item.badge}</span>
      )}
    </Tag>
  );
}

function groupBySection(items) {
  const map = new Map();
  for (const item of items) {
    const key = item.section || '';
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return Array.from(map.entries()).map(([section, items]) => ({ section, items }));
}
