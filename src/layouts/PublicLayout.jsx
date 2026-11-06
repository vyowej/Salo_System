import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import BrandMark from '../components/common/BrandMark';
import Button from '../components/common/Button';
import Badge from '../components/common/Badge';
import ThemeToggle from '../components/navigation/ThemeToggle';
import './PublicLayout.css';

const NAV_LINKS = [
  { label: 'Discover',    href: '#explore' },
  { label: 'How It Works', href: '#how-it-works' },
  { label: 'Services',    href: '#services' },
  { label: 'Partners',    href: '#partners' },
  { label: 'FAQ',         href: '#faq' },
];

export default function PublicLayout({ children }) {
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  return (
    <div className="public-shell">
      {/* ── Floating Pill Navbar ───────────────────────────── */}
      <div className="public-navbar-wrapper">
        <header className="public-navbar-pill" role="banner">
          {/* Left: Brand */}
          <Link to="/" className="public-nav-brand" aria-label="SALO home">
            <BrandMark size="sm" dark />
          </Link>

          {/* Centre: Nav links */}
          <nav className="public-nav-links" aria-label="Main navigation">
            {NAV_LINKS.map((link) => (
              <a key={link.href} href={link.href} className="public-nav-link">
                {link.label}
              </a>
            ))}
            {/* Showcase kept — has active route. Limitation: visible in production. */}
            <Link to="/showcase" className="public-nav-link public-nav-showcase">
              Showcase <span className="showcase-dev-pill">Dev</span>
            </Link>
          </nav>

          {/* Right: Actions */}
          <div className="public-nav-actions">
            <ThemeToggle />

            {isAuthenticated ? (
              <>
                <span className="nav-user-label">
                  {user?.name || user?.username}
                </span>
                <Link to="/customer" style={{ textDecoration: 'none' }}>
                  <Button variant="primary" size="sm">Portal</Button>
                </Link>
                <Button variant="ghost" size="sm" onClick={handleLogout}
                  style={{ color: 'var(--nav-pill-text)' }}>
                  Sign Out
                </Button>
              </>
            ) : (
              <>
                <Link to="/login" style={{ textDecoration: 'none' }}>
                  <Button variant="ghost" size="sm"
                    style={{ color: 'var(--nav-pill-text)' }}>
                    Sign In
                  </Button>
                </Link>
                <Link to="/register" style={{ textDecoration: 'none' }}>
                  <Button variant="primary" size="sm">Get Started</Button>
                </Link>
              </>
            )}

            {/* Mobile hamburger */}
            <button
              className="public-mobile-toggle"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation menu"
              type="button"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
          </div>
        </header>
      </div>

      {/* ── Mobile Drawer ──────────────────────────────────── */}
      {mobileOpen && (
        <div
          className="mobile-menu-overlay"
          onClick={() => setMobileOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Navigation menu"
        >
          <div className="mobile-menu-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="mobile-menu-header">
              <BrandMark size="sm" />
              <button
                onClick={() => setMobileOpen(false)}
                className="mobile-menu-close"
                aria-label="Close menu"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="mobile-menu-links">
              {NAV_LINKS.map((link) => (
                <a key={link.href} href={link.href}
                  className="mobile-menu-link"
                  onClick={() => setMobileOpen(false)}>
                  {link.label}
                </a>
              ))}
              <Link to="/showcase" className="mobile-menu-link"
                onClick={() => setMobileOpen(false)}>
                Design Showcase
              </Link>
            </div>

            <div className="mobile-menu-footer">
              {isAuthenticated ? (
                <Button variant="outline" fullWidth onClick={handleLogout}>
                  Sign Out ({user?.name || user?.username})
                </Button>
              ) : (
                <>
                  <Link to="/login" style={{ textDecoration: 'none' }}
                    onClick={() => setMobileOpen(false)}>
                    <Button variant="secondary" fullWidth>Sign In</Button>
                  </Link>
                  <Link to="/register" style={{ textDecoration: 'none' }}
                    onClick={() => setMobileOpen(false)}>
                    <Button variant="primary" fullWidth>Get Started</Button>
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Main Content ───────────────────────────────────── */}
      <main className="public-content">
        {children}
      </main>

      {/* ── Footer ─────────────────────────────────────────── */}
      <footer className="public-footer">
        <div className="footer-inner">
          <div className="footer-top">
            <div className="footer-brand-col">
              <Link to="/" className="footer-brand-link">
                <BrandMark size="md" dark tagline />
              </Link>
              <p className="footer-brand-desc">
                The unified Filipino restaurant platform — multi-kitchen ordering,
                guaranteed table reservations, and multi-destination delivery.
              </p>
              <div className="footer-badges">
                <Badge variant="primary" size="sm">Philippines (PHP ₱)</Badge>
                <Badge variant="default" size="sm">Asia/Manila</Badge>
              </div>
            </div>

            <div className="footer-links-group">
              <div className="footer-col">
                <h4 className="footer-col-title">Platform</h4>
                <div className="footer-col-links">
                  <a href="#explore" className="footer-link">Explore Restaurants</a>
                  <a href="#how-it-works" className="footer-link">How It Works</a>
                  <a href="#services" className="footer-link">Ordering &amp; Reservations</a>
                  <a href="#partners" className="footer-link">Become a Partner</a>
                  <a href="#faq" className="footer-link">FAQ</a>
                </div>
              </div>

              <div className="footer-col">
                <h4 className="footer-col-title">Partners</h4>
                <div className="footer-col-links">
                  <Link to="/register" className="footer-link">Restaurant Partner</Link>
                  <Link to="/register" className="footer-link">Delivery Rider</Link>
                  <Link to="/login" className="footer-link">Restaurant Portal</Link>
                  <Link to="/login" className="footer-link">Rider Portal</Link>
                </div>
              </div>

              <div className="footer-col">
                <h4 className="footer-col-title">Legal</h4>
                <div className="footer-col-links">
                  <span className="footer-link footer-link--static">Terms of Service</span>
                  <span className="footer-link footer-link--static">Privacy Policy (RA 10173)</span>
                  <span className="footer-link footer-link--static">Cancellation &amp; Refund</span>
                  <span className="footer-link footer-link--static">COD Remittance</span>
                </div>
              </div>
            </div>
          </div>

          {/* Large wordmark row at the footer bottom */}
          <div className="footer-wordmark-row" aria-hidden="true">
            SALO
          </div>

          <div className="footer-bottom">
            <span>© {new Date().getFullYear()} SALO Platform. All rights reserved.</span>
            <span>Where good food brings us together.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
