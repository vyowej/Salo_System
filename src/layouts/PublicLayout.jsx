import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../hooks/useAuth';
import ThemeToggle from '../components/navigation/ThemeToggle';
import Button from '../components/common/Button';
import Badge from '../components/common/Badge';
import './PublicLayout.css';

/**
 * SALO Public Layout
 * Header, navigation, theme toggle, drawer, main container, and footer.
 */
export default function PublicLayout({ children }) {
  const { theme } = useTheme();
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const logoSrc = theme === 'dark'
    ? '/brand/salo-logo-dark.png'
    : '/brand/salo-logo-light.png';

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  return (
    <div className="app-shell">
      {/* ── Public Navbar ─────────────────────────────────── */}
      <header className="public-navbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-6)' }}>
          <Link to="/" aria-label="SALO Home" style={{ display: 'flex', alignItems: 'center' }}>
            <img src={logoSrc} alt="SALO" style={{ height: 32, width: 'auto', objectFit: 'contain' }} />
          </Link>

          <nav className="public-nav-links" aria-label="Main menu">
            <Link to="/#features" className="public-nav-link">Features</Link>
            <Link to="/#how-it-works" className="public-nav-link">How It Works</Link>
            <Link to="/#partners" className="public-nav-link">For Restaurants</Link>
            <Link to="/#riders" className="public-nav-link">For Riders</Link>
            <Link to="/showcase" className="public-nav-link" style={{ color: 'var(--accent)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span>Showcase</span>
              <span style={{ fontSize: 10, background: 'var(--accent-subtle)', padding: '1px 5px', borderRadius: 4 }}>Dev</span>
            </Link>
          </nav>
        </div>

        <div className="public-nav-actions">
          <ThemeToggle />

          {isAuthenticated ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: 1.2 }}>
                <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {user?.name || user?.username}
                </span>
                <Badge variant="primary" size="sm" dot>
                  {user?.role ? user.role.toUpperCase() : 'USER'}
                </Badge>
              </div>

              <Link to="/customer" style={{ textDecoration: 'none' }}>
                <Button variant="primary" size="sm">
                  Customer Portal →
                </Button>
              </Link>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleLogout}
              >
                Sign Out
              </Button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <Link to="/login" style={{ textDecoration: 'none' }}>
                <Button variant="ghost" size="sm">
                  Sign In
                </Button>
              </Link>
              <Link to="/register" style={{ textDecoration: 'none' }}>
                <Button variant="primary" size="sm">
                  Get Started
                </Button>
              </Link>
            </div>
          )}

          {/* Mobile hamburger */}
          <button
            className="public-mobile-toggle"
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Open navigation menu"
            type="button"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
        </div>
      </header>

      {/* ── Mobile Menu Drawer ────────────────────────────── */}
      {mobileMenuOpen && (
        <div
          className="mobile-menu-overlay"
          onClick={() => setMobileMenuOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <div className="mobile-menu-drawer" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <img src={logoSrc} alt="SALO" style={{ height: 26, objectFit: 'contain' }} />
              <button
                onClick={() => setMobileMenuOpen(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                aria-label="Close menu"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="mobile-menu-links">
              <Link to="/#features" className="mobile-menu-link" onClick={() => setMobileMenuOpen(false)}>Features</Link>
              <Link to="/#how-it-works" className="mobile-menu-link" onClick={() => setMobileMenuOpen(false)}>How It Works</Link>
              <Link to="/#partners" className="mobile-menu-link" onClick={() => setMobileMenuOpen(false)}>For Restaurants</Link>
              <Link to="/#riders" className="mobile-menu-link" onClick={() => setMobileMenuOpen(false)}>For Riders</Link>
              <Link to="/showcase" className="mobile-menu-link" onClick={() => setMobileMenuOpen(false)}>Design Showcase</Link>
            </div>

            <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              {isAuthenticated ? (
                <Button variant="outline" fullWidth onClick={handleLogout}>
                  Sign Out ({user?.name || user?.username})
                </Button>
              ) : (
                <>
                  <Link to="/login" style={{ textDecoration: 'none' }} onClick={() => setMobileMenuOpen(false)}>
                    <Button variant="secondary" fullWidth>Sign In</Button>
                  </Link>
                  <Link to="/register" style={{ textDecoration: 'none' }} onClick={() => setMobileMenuOpen(false)}>
                    <Button variant="primary" fullWidth>Get Started</Button>
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Content ───────────────────────────────────────── */}
      <main className="public-content">
        {children}
      </main>

      {/* ── Public Footer ─────────────────────────────────── */}
      <footer className="public-footer">
        <div className="public-footer-inner">
          <div className="footer-brand-col">
            <img src={logoSrc} alt="SALO" className="footer-brand-logo" />
            <p className="footer-brand-tagline">
              <strong>Order. Reserve. Gather.</strong><br />
              The unified Philippine restaurant platform bringing multi-restaurant ordering, table reservations, and flexible delivery together.
            </p>
            <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-1)' }}>
              <Badge variant="primary" size="sm">Philippines (PHP ₱)</Badge>
              <Badge variant="default" size="sm">Asia/Manila</Badge>
            </div>
          </div>

          <div>
            <h4 className="footer-col-title">Platform</h4>
            <div className="footer-col-links">
              <Link to="/#features" className="footer-link">Multi-Restaurant Cart</Link>
              <Link to="/#features" className="footer-link">Table Reservations</Link>
              <Link to="/#features" className="footer-link">Multi-Destination Delivery</Link>
              <Link to="/showcase" className="footer-link">Design System Showcase</Link>
            </div>
          </div>

          <div>
            <h4 className="footer-col-title">Partners</h4>
            <div className="footer-col-links">
              <Link to="/register" className="footer-link">Register Restaurant</Link>
              <Link to="/register" className="footer-link">Apply as Delivery Rider</Link>
              <Link to="/login" className="footer-link">Partner Portal</Link>
              <Link to="/login" className="footer-link">Rider Portal</Link>
            </div>
          </div>

          <div>
            <h4 className="footer-col-title">Legal & Security</h4>
            <div className="footer-col-links">
              <span className="footer-link" style={{ cursor: 'pointer' }}>Terms of Service</span>
              <span className="footer-link" style={{ cursor: 'pointer' }}>Privacy Policy (RA 10173)</span>
              <span className="footer-link" style={{ cursor: 'pointer' }}>Cancellation & Refund Policy</span>
              <span className="footer-link" style={{ cursor: 'pointer' }}>COD Remittance Standards</span>
            </div>
          </div>
        </div>

        <div className="public-footer-bottom">
          <span>&copy; {new Date().getFullYear()} SALO Platform. All rights reserved.</span>
          <span>Where good food brings us together.</span>
        </div>
      </footer>
    </div>
  );
}
