import { Link } from 'react-router-dom';
import BrandMark from '../components/common/BrandMark';
import ThemeToggle from '../components/navigation/ThemeToggle';
import './AuthLayout.css';

/**
 * SALO Two-Column Auth Layout
 * Desktop: Warm brand presentation on left (with local food photography) + Form on right.
 * Mobile: Clean stacked responsive experience.
 */
export default function AuthLayout({
  children,
  headline = 'Kain tayo!',
  subheading = 'Good food, good company, great memories.',
  imageSrc = '/images/auth/login-food.png',
  imageAlt = 'Authentic Filipino Salo-salo Spread',
  badgeText = 'Order. Reserve. Gather.',
  compact = false,
  maxWidth,
}) {

  // Compact mode for password reset or simple flows
  if (compact || maxWidth) {
    return (
      <div className="auth-page-shell">
        <header className="auth-topbar">
          <Link to="/" className="auth-back-link" aria-label="Return to SALO Home">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            <span>Back to SALO</span>
          </Link>
          <div className="auth-topbar-actions">
            <ThemeToggle />
          </div>
        </header>

        <div className="auth-compact-card animate-fade-in" style={maxWidth ? { maxWidth: `${maxWidth}px` } : undefined}>
          <div style={{ textAlign: 'center', marginBottom: 'var(--space-6)' }}>
            <Link to="/" aria-label="SALO Home" style={{ display: 'inline-block' }}>
              <BrandMark size="md" />
            </Link>
          </div>
          {children}
        </div>
      </div>
    );
  }

  // Full Two-Column Split Layout for Login and Registration
  return (
    <div className="auth-page-shell">
      {/* Floating Topbar: Back to Home + Theme Toggle */}
      <header className="auth-topbar">
        <Link to="/" className="auth-back-link" aria-label="Return to SALO Home">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          <span>Back to SALO</span>
        </Link>
        <div className="auth-topbar-actions">
          <ThemeToggle />
        </div>
      </header>

      {/* Main Two-Column Split Frame */}
      <div className="auth-split-wrapper animate-fade-in">
        {/* Left Side: Brand presentation */}
        <aside className="auth-brand-pane">
          <div className="auth-brand-header">
            <Link to="/" aria-label="SALO Home">
              <BrandMark size="md" dark />
            </Link>
            <div>
              <span className="auth-brand-badge">{badgeText}</span>
              <h1 className="auth-brand-title font-display">{headline}</h1>
              <p className="auth-brand-tagline">{subheading}</p>
            </div>
          </div>

          {/* High-res Filipino Food Showcase Image */}
          <div className="auth-food-frame">
            <img
              src={imageSrc}
              alt={imageAlt}
              className="auth-food-img"
              loading="eager"
            />
            <div className="auth-food-caption">
              <span>Salo-salo sa sarap</span>
              <span className="auth-food-badge">Authentic Comfort</span>
            </div>
          </div>

          {/* Feature Highlights Row */}
          <div className="auth-feature-row">
            <span className="auth-feature-pill">
              <span role="img" aria-label="food">🍛</span> Multi-Kitchen Cart
            </span>
            <span className="auth-feature-pill">
              <span role="img" aria-label="table">🪑</span> Table Reservations
            </span>
            <span className="auth-feature-pill">
              <span role="img" aria-label="delivery">🛵</span> Express Delivery
            </span>
          </div>
        </aside>

        {/* Right Side: Form pane */}
        <main className="auth-form-pane">
          {children}
        </main>
      </div>
    </div>
  );
}
