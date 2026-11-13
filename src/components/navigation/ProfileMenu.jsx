import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import './ProfileMenu.css';

export default function ProfileMenu({
  profileName,
  profileEmail,
  profileInitials = '?',
  profileAvatar,
  theme,
  menuItems = [],
  placement = 'topbar',
  collapsed = false,
}) {
  const triggerRef = useRef(null);
  const popoverRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [popoverStyle, setPopoverStyle] = useState({});

  useEffect(() => {
    if (!open) return undefined;

    const updatePosition = () => {
      const trigger = triggerRef.current;
      const popover = popoverRef.current;
      if (!(trigger && popover)) return;

      const triggerRect = trigger.getBoundingClientRect();
      const menuWidth = Math.min(280, window.innerWidth - 24);
      const menuHeight = popover.offsetHeight || 280;
      const margin = 12;

      const left = placement === 'sidebar'
        ? Math.min(triggerRect.left + triggerRect.width + 12, window.innerWidth - menuWidth - margin)
        : Math.min(Math.max(margin, triggerRect.right - menuWidth), window.innerWidth - menuWidth - margin);
      const shouldOpenUpward = triggerRect.bottom + menuHeight + 12 > window.innerHeight - margin;
      // Sidebar menus open beside the trigger, bottom-aligned with it.
      const top = placement === 'sidebar'
        ? triggerRect.bottom - menuHeight
        : shouldOpenUpward
          ? triggerRect.top - menuHeight - 12
          : triggerRect.bottom + 12;

      setPopoverStyle({
        left: `${Math.max(margin, left)}px`,
        top: `${Math.min(Math.max(margin, top), window.innerHeight - menuHeight - margin)}px`,
        width: `${menuWidth}px`,
      });
    };

    const frame = requestAnimationFrame(updatePosition);
    const closeOnOutsideClick = (event) => {
      if (!triggerRef.current?.contains(event.target) && !popoverRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };

    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open, placement]);

  const isSidebar = placement === 'sidebar';
  const triggerClassName = isSidebar
    ? `profile-menu-trigger ${collapsed ? 'collapsed' : ''} ${open ? 'open' : ''}`.trim()
    : `topbar-profile-button ${open ? 'open' : ''}`.trim();
  const avatarClassName = isSidebar ? 'profile-menu-avatar' : 'topbar-avatar';
  const containerClassName = isSidebar
    ? 'profile-menu-container'
    : 'profile-menu-container profile-menu-topbar';

  return (
    <div className={containerClassName}>
      <button
        ref={triggerRef}
        type="button"
        className={triggerClassName}
        aria-label={`${profileName || 'User'} profile menu`}
        aria-expanded={open}
        aria-haspopup="menu"
        title={isSidebar && collapsed ? profileName : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        <span className={avatarClassName} aria-hidden="true">
          {profileAvatar
            ? <img src={profileAvatar} alt="" />
            : profileInitials}
        </span>
        {isSidebar && !collapsed && (
          <span className="profile-menu-meta">
            <span className="profile-menu-name">{profileName}</span>
            <span className="profile-menu-email">{profileEmail}</span>
          </span>
        )}
      </button>

      {open && (
        <div
          ref={popoverRef}
          className="profile-menu-popover"
          role="menu"
          aria-label="Profile menu"
          style={popoverStyle}
        >
          <div className="profile-menu-popover-header">
            <span className="profile-menu-avatar large" aria-hidden="true">
              {profileAvatar ? <img src={profileAvatar} alt="" /> : profileInitials}
            </span>
            <div className="profile-menu-popover-copy">
              <span className="profile-menu-name">{profileName}</span>
              <span className="profile-menu-email">{profileEmail}</span>
            </div>
          </div>

          <div className="profile-menu-list">
            {menuItems.map((item) => {
              const className = `profile-menu-item ${item.danger ? 'danger' : ''} ${item.toggle ? 'profile-menu-theme-item' : ''}`.trim();
              const content = item.toggle ? (
                <>
                  <span>{item.label}</span>
                  <span className={`profile-menu-toggle ${theme === 'dark' ? 'checked' : ''}`} aria-hidden="true">
                    <span className="profile-menu-toggle-thumb" />
                  </span>
                </>
              ) : (
                <span className="profile-menu-item-left">
                  {item.icon}
                  <span>{item.label}</span>
                </span>
              );

              if (item.type === 'link') {
                return (
                  <Link
                    key={item.id}
                    to={item.href}
                    className={className}
                    role="menuitem"
                    onClick={() => setOpen(false)}
                  >
                    {content}
                    {item.badge > 0 && (
                      <span className="profile-menu-badge" aria-label={`${item.badge} ${item.label.toLowerCase()}`}>
                        {item.badge}
                      </span>
                    )}
                  </Link>
                );
              }

              return (
                <button
                  key={item.id}
                  type="button"
                  className={className}
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    item.onClick?.();
                  }}
                >
                  {content}
                  {item.badge > 0 && (
                    <span className="profile-menu-badge" aria-label={`${item.badge} ${item.label.toLowerCase()}`}>
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
