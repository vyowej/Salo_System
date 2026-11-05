import { Link } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';
import ThemeToggle from '../components/navigation/ThemeToggle';

/**
 * SALO Auth Layout
 * Centered panel layout for login, register, password reset, etc.
 */
export default function AuthLayout({ children, maxWidth = 460 }) {
  const { theme } = useTheme();

  const logoSrc = theme === 'dark'
    ? '/brand/salo-logo-dark.png'
    : '/brand/salo-logo-light.png';

  return (
    <div className="auth-shell">
      {/* Top action bar: back to home + theme toggle */}
      <div style={{
        position: 'fixed',
        top: 'var(--space-4)',
        left: 'var(--space-6)',
        right: 'var(--space-6)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        zIndex: 'var(--z-sticky)',
        pointerEvents: 'none',
      }}>
        <Link
          to="/"
          style={{
            pointerEvents: 'auto',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            fontSize: 'var(--font-size-sm)',
            fontWeight: 'var(--font-weight-medium)',
            color: 'var(--text-secondary)',
            textDecoration: 'none',
            padding: '6px 12px',
            borderRadius: 'var(--radius-md)',
            background: 'var(--surface-primary)',
            border: '1px solid var(--border-primary)',
            boxShadow: 'var(--shadow-xs)',
            transition: 'color var(--transition-fast), border-color var(--transition-fast)',
          }}
          className="auth-back-link"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back to SALO
        </Link>
        <div style={{ pointerEvents: 'auto' }}>
          <ThemeToggle />
        </div>
      </div>

      <div
        className="auth-panel animate-scale-in"
        style={{ maxWidth: `${maxWidth}px`, margin: 'var(--space-12) auto var(--space-6)' }}
      >
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 'var(--space-6)' }}>
          <Link to="/" aria-label="SALO Home" style={{ display: 'inline-block' }}>
            <img
              src={logoSrc}
              alt="SALO"
              style={{ height: 36, width: 'auto', objectFit: 'contain', margin: '0 auto' }}
            />
          </Link>
        </div>
        {children}
      </div>
    </div>
  );
}
