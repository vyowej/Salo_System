import { useTheme } from '../../contexts/ThemeContext';
import ThemeToggle from './ThemeToggle';
import './TopBar.css';

/**
 * SALO TopBar
 *
 * @param {node}     logo         - optional override
 * @param {node}     search       - search input node
 * @param {node}     actions      - extra action nodes (before avatar)
 * @param {string}   userName
 * @param {string}   userInitials
 * @param {string}   userAvatar
 * @param {boolean}  showNotifications
 * @param {number}   notificationCount
 * @param {function} onMenuToggle - mobile hamburger callback
 * @param {function} onAvatarClick
 */
export default function TopBar({
  logo,
  search,
  actions,
  userName,
  userInitials = '?',
  userAvatar,
  showNotifications = true,
  notificationCount = 0,
  onMenuToggle,
  onAvatarClick,
  children,
}) {
  const { theme } = useTheme();

  const logoSrc = theme === 'dark'
    ? '/brand/salo-logo-dark.png'
    : '/brand/salo-logo-light.png';

  return (
    <header className="topbar">
      {/* Mobile hamburger */}
      {onMenuToggle && (
        <button
          className="topbar-hamburger"
          onClick={onMenuToggle}
          aria-label="Toggle navigation"
          type="button"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <line x1="3" y1="6" x2="21" y2="6"/>
            <line x1="3" y1="12" x2="21" y2="12"/>
            <line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
        </button>
      )}

      {/* Logo */}
      {logo || (
        <a href="/" className="topbar-logo" aria-label="SALO home">
          <img src={logoSrc} alt="SALO" />
        </a>
      )}

      {/* Search */}
      {search && (
        <div className="topbar-search">{search}</div>
      )}

      <div className="topbar-spacer" />

      {/* Custom actions */}
      {children}

      <div className="topbar-actions">
        {/* Notifications */}
        {showNotifications && (
          <button className="topbar-btn" aria-label={`Notifications${notificationCount ? ` (${notificationCount})` : ''}`} type="button">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
              <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/>
              <path d="M13.73 21a2 2 0 01-3.46 0"/>
            </svg>
            {notificationCount > 0 && (
              <span className="topbar-notification-dot" aria-hidden="true" />
            )}
          </button>
        )}

        {/* Extra actions */}
        {actions}

        {/* Theme toggle */}
        <ThemeToggle />

        {/* Avatar */}
        {(userName || userInitials) && (
          <button
            className="topbar-avatar"
            onClick={onAvatarClick}
            aria-label={`${userName || 'User'} profile`}
            type="button"
          >
            {userAvatar
              ? <img src={userAvatar} alt={userName} />
              : userInitials}
          </button>
        )}
      </div>
    </header>
  );
}
