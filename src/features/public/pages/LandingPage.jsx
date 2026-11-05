import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import PublicLayout from '../../../layouts/PublicLayout';
import Button from '../../../components/common/Button';
import Badge from '../../../components/common/Badge';
import WelcomeModal from '../../auth/components/WelcomeModal';
import { useAuth } from '../../../hooks/useAuth';
import './LandingPage.css';

const CUISINE_CATEGORIES = [
  'All',
  'Filipino & Silog',
  'Grill & BBQ',
  'Burgers & Chicken',
  'Pizza & Pasta',
  'Asian & Noodles',
  'Desserts & Milk Tea',
];

const SAMPLE_RESTAURANTS = [
  {
    id: 1,
    name: 'Dalisay Heritage Grill',
    cuisine: 'Filipino · Grill & BBQ',
    rating: 4.9,
    reviews: 1420,
    time: '20–35 min',
    minOrder: '₱150',
    status: 'Open Now',
    icon: '🔥',
    features: ['Multi-Delivery', 'Table Reservations'],
  },
  {
    id: 2,
    name: 'Manila Artisan Pizza',
    cuisine: 'Pizza & Pasta · Italian',
    rating: 4.8,
    reviews: 980,
    time: '25–40 min',
    minOrder: '₱200',
    status: 'Open Now',
    icon: '🍕',
    features: ['Table Reservations', 'Curbside Pickup'],
  },
  {
    id: 3,
    name: 'Calle Crisologo Silog',
    cuisine: 'Filipino · Breakfast & Bowls',
    rating: 4.7,
    reviews: 2150,
    time: '15–25 min',
    minOrder: '₱100',
    status: 'Open Now',
    icon: '🍳',
    features: ['Multi-Delivery', 'Budget Friendly'],
  },
];

export default function LandingPage() {
  const location = useLocation();
  const { user, isAuthenticated } = useAuth();

  const [activeCategory, setActiveCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [welcomeOpen, setWelcomeOpen] = useState(false);

  // Check if redirected from newly registered flow
  useEffect(() => {
    if (location.state?.newlyRegistered && isAuthenticated) {
      setWelcomeOpen(true);
    }
  }, [location.state, isAuthenticated]);

  return (
    <PublicLayout>
      {/* Guided Welcome Modal for new customers */}
      {isAuthenticated && (
        <WelcomeModal
          open={welcomeOpen}
          onClose={() => setWelcomeOpen(false)}
        />
      )}

      {/* ── 1. Hero Section ──────────────────────────────── */}
      <section className="hero-section">
        <div className="hero-container">
          <div>
            <div className="hero-eyebrow">
              <span>🇵🇭</span>
              <span>Philippines’ Premier Food & Gathering Platform</span>
            </div>

            <h1 className="hero-title">
              Order. Reserve. <span className="highlight">Gather.</span>
            </h1>

            <p className="hero-lead">
              Enjoy your favorite meals together. Order from multiple restaurants in a single checkout,
              send dishes to different addresses, or reserve authentic dining tables with live confirmation.
            </p>

            {/* Quick action search bar */}
            <div className="hero-search-box">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                style={{ color: 'var(--text-muted)', marginRight: 10, flexShrink: 0 }}
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                className="hero-search-input"
                placeholder="Search restaurants, cuisines, or dishes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Search restaurants"
              />
              <Link to="/register" style={{ textDecoration: 'none' }}>
                <Button variant="primary" size="md">
                  Find Food
                </Button>
              </Link>
            </div>

            <div style={{ display: 'flex', gap: 'var(--space-4)', alignItems: 'center', marginTop: 'var(--space-5)', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: 'var(--salo-success)' }}>✓</span> Consolidated Multi-Cart
              </span>
              <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: 'var(--salo-success)' }}>✓</span> Live Table Capacity
              </span>
              <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: 'var(--salo-success)' }}>✓</span> Multi-Address Checkout
              </span>
            </div>
          </div>

          {/* ── Hero Visual Graphic (Mock Multi-Order Preview) ── */}
          <div className="hero-visual">
            <div className="hero-order-card">
              <span className="hero-badge-float">One Single Checkout</span>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
                <div>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
                    Active Order Group
                  </span>
                  <p style={{ fontSize: 'var(--font-size-md)', fontWeight: 700, color: 'var(--text-primary)' }}>
                    #SALO-MNL-2041
                  </p>
                </div>
                <Badge variant="primary" dot>Preparing 2 of 2</Badge>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                <div style={{ padding: 'var(--space-3)', background: 'var(--surface-secondary)', borderRadius: 'var(--radius-md)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 18 }}>🔥</span>
                    <div>
                      <p style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600 }}>Dalisay Heritage Grill</p>
                      <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Liempo Inasal + Garlic Rice → <strong style={{ color: 'var(--accent)' }}>Home</strong></p>
                    </div>
                  </div>
                  <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600 }}>₱320</span>
                </div>

                <div style={{ padding: 'var(--space-3)', background: 'var(--surface-secondary)', borderRadius: 'var(--radius-md)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 18 }}>🍕</span>
                    <div>
                      <p style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600 }}>Manila Artisan Pizza</p>
                      <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Truffle 4-Cheese → <strong style={{ color: 'var(--accent)' }}>Office (BGC)</strong></p>
                    </div>
                  </div>
                  <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600 }}>₱480</span>
                </div>
              </div>

              <div style={{ marginTop: 'var(--space-3)', paddingTop: 'var(--space-3)', borderTop: '1px solid var(--border-secondary)', display: 'flex', justifyContent: 'space-between', fontSize: 'var(--font-size-xs)' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Fulfillment: 2 Independent Deliveries</span>
                <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>Total: ₱800</span>
              </div>
            </div>

            {/* Quick Table Reservation Snapshot Card */}
            <div className="hero-order-card" style={{ padding: 'var(--space-4)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 24 }}>🪑</span>
                  <div>
                    <p style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600 }}>Table for 4 Confirmed</p>
                    <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Tonight at 7:30 PM · Dalisay Heritage</p>
                  </div>
                </div>
                <Badge variant="success" dot size="sm">Confirmed</Badge>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 2. Core Value Propositions (Open layout) ────────── */}
      <section id="features" className="landing-section">
        <div className="landing-container">
          <div className="section-header-centered">
            <span className="section-badge">Platform Innovation</span>
            <h2 className="section-heading">Built specifically for how Filipinos gather and eat</h2>
            <p className="section-subtitle">
              No more arguing over which restaurant to order from or switching between multiple apps.
              SALO brings ordering, reservations, and delivery together.
            </p>
          </div>

          <div className="features-grid">
            <div className="feature-item">
              <div className="feature-icon-wrapper">🛒</div>
              <h3 className="feature-title">Multi-Restaurant Single Checkout</h3>
              <p className="feature-desc">
                Combine lechon from one place, pizza from another, and drinks from a third in one consolidated cart. Each restaurant fulfills independently without holding up the others.
              </p>
            </div>

            <div className="feature-item">
              <div className="feature-icon-wrapper">📍</div>
              <h3 className="feature-title">Multi-Destination Delivery</h3>
              <p className="feature-desc">
                Surprise your family at home while sending lunch to your office coworkers in the exact same order. Assign distinct delivery addresses to each restaurant sub-order.
              </p>
            </div>

            <div className="feature-item">
              <div className="feature-icon-wrapper">🍽️</div>
              <h3 className="feature-title">Real-Time Table Reservations</h3>
              <p className="feature-desc">
                Reserve authentic restaurant tables with verified capacity and transparent deposit policies. Zero double-booking, guaranteed seating.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── 3. Multi-Restaurant Deep Dive Interactive Demo ─── */}
      <section className="landing-section">
        <div className="landing-container">
          <div className="showcase-banner">
            <div>
              <span className="section-badge">How Multi-Cart Works</span>
              <h3 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 'var(--space-3)' }}>
                One payment, independent restaurant outcomes
              </h3>
              <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 'var(--space-6)' }}>
                Unlike generic delivery apps where you must checkout 3 separate times, SALO generates an intelligent order group. If one restaurant runs out of an item, the rest of your order proceeds smoothly without cancelation cascades.
              </p>
              <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
                <Link to="/register" style={{ textDecoration: 'none' }}>
                  <Button variant="primary">Experience Multi-Order</Button>
                </Link>
                <Link to="/showcase" style={{ textDecoration: 'none' }}>
                  <Button variant="secondary">View UI System</Button>
                </Link>
              </div>
            </div>

            <div className="multi-restaurant-list">
              <div className="sub-order-pill">
                <div>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>SUB-ORDER A</span>
                  <p style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)' }}>Jollibee EDSA Guadalupe</p>
                  <p style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Deliver to: <strong>Home (Mandaluyong)</strong></p>
                </div>
                <Badge variant="success" dot size="sm">Accepted</Badge>
              </div>

              <div className="sub-order-pill">
                <div>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>SUB-ORDER B</span>
                  <p style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)' }}>Dalisay Heritage Bistro</p>
                  <p style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Deliver to: <strong>Office (BGC Taguig)</strong></p>
                </div>
                <Badge variant="primary" dot size="sm">Preparing</Badge>
              </div>

              <div className="sub-order-pill">
                <div>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>SUB-ORDER C</span>
                  <p style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)' }}>The Milk Tea Hub</p>
                  <p style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Fulfillment: <strong>Customer Pickup</strong></p>
                </div>
                <Badge variant="info" dot size="sm">Ready for Pickup</Badge>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 4. Popular Cuisines & Discovery Preview ───────── */}
      <section className="landing-section">
        <div className="landing-container">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 'var(--space-6)', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
            <div>
              <span className="section-badge">Discover & Gather</span>
              <h2 className="section-heading" style={{ marginBottom: 0 }}>Featured Dining Spots</h2>
            </div>
            <Link to="/register" style={{ textDecoration: 'none' }}>
              <Button variant="outline" size="sm">
                View All Restaurants ↗
              </Button>
            </Link>
          </div>

          {/* Cuisine Filter Chips */}
          <div className="category-chips">
            {CUISINE_CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                className={`category-chip ${activeCategory === cat ? 'active' : ''}`}
                onClick={() => setActiveCategory(cat)}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Restaurant Grid */}
          <div className="restaurant-grid">
            {SAMPLE_RESTAURANTS.map((rest) => (
              <div key={rest.id} className="restaurant-preview-card">
                <div className="restaurant-cover-placeholder">
                  <span style={{ fontSize: 48 }}>{rest.icon}</span>
                  <span style={{
                    position: 'absolute',
                    top: 12,
                    right: 12,
                    background: 'var(--surface-primary)',
                    padding: '2px 8px',
                    borderRadius: 'var(--radius-full)',
                    fontSize: 11,
                    fontWeight: 600,
                    boxShadow: 'var(--shadow-xs)'
                  }}>
                    ★ {rest.rating} ({rest.reviews})
                  </span>
                </div>

                <div className="restaurant-info">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <h3 className="restaurant-name">{rest.name}</h3>
                    <Badge variant="success" size="sm" dot>{rest.status}</Badge>
                  </div>

                  <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
                    {rest.cuisine}
                  </p>

                  <div className="restaurant-meta">
                    <span>🕒 {rest.time}</span>
                    <span>•</span>
                    <span>Min. {rest.minOrder}</span>
                  </div>

                  <div style={{ display: 'flex', gap: 6, marginTop: 'var(--space-2)', flexWrap: 'wrap' }}>
                    {rest.features.map(f => (
                      <span key={f} style={{
                        fontSize: 10,
                        background: 'var(--bg-tertiary)',
                        color: 'var(--text-muted)',
                        padding: '2px 6px',
                        borderRadius: 4,
                        fontWeight: 600,
                      }}>
                        {f}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 5. How It Works ──────────────────────────────── */}
      <section id="how-it-works" className="landing-section">
        <div className="landing-container">
          <div className="section-header-centered">
            <span className="section-badge">Simple 3-Step Process</span>
            <h2 className="section-heading">Effortless from craving to gathering</h2>
            <p className="section-subtitle">
              Designed with care so you spend less time coordinating and more time enjoying good food.
            </p>
          </div>

          <div className="steps-grid">
            <div className="step-card">
              <span className="step-number">01</span>
              <h3 className="feature-title">Explore & Select</h3>
              <p className="feature-desc">
                Browse nearby restaurants, menus, or available table schedules. Add items from multiple vendors directly into your consolidated cart.
              </p>
            </div>

            <div className="step-card">
              <span className="step-number">02</span>
              <h3 className="feature-title">Customize & Review</h3>
              <p className="feature-desc">
                Choose delivery destinations per restaurant group or lock in table reservations. Pay with COD, GCash, Maya, or cards with guaranteed transparency.
              </p>
            </div>

            <div className="step-card">
              <span className="step-number">03</span>
              <h3 className="feature-title">Track & Enjoy</h3>
              <p className="feature-desc">
                Monitor preparation and rider dispatch independently. Gather around the table and enjoy food crafted by local culinary artisans.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── 6. Partner Banners (Dual CTA) ────────────────── */}
      <section id="partners" className="landing-section">
        <div className="landing-container">
          <div className="partner-dual-grid">
            {/* Restaurant Partner */}
            <div className="partner-card">
              <div>
                <span className="section-badge">For Restaurant Owners</span>
                <h3 className="partner-card-title">Grow your restaurant with SALO</h3>
                <p className="partner-card-desc">
                  Reach more customers through our unified ordering and reservation network. Enjoy dedicated menu management, live table management, and fair, transparent commissions.
                </p>
              </div>

              <div>
                <Link to="/register" style={{ textDecoration: 'none' }}>
                  <Button variant="primary">
                    Register as Restaurant Partner
                  </Button>
                </Link>
              </div>
            </div>

            {/* Rider Partner */}
            <div id="riders" className="partner-card">
              <div>
                <span className="section-badge">For Delivery Riders</span>
                <h3 className="partner-card-title">Ride with SALO</h3>
                <p className="partner-card-desc">
                  Earn competitive payouts with flexible shift scheduling and clear delivery dispatch rules. Track your earnings and manage your assignments with confidence.
                </p>
              </div>

              <div>
                <Link to="/register" style={{ textDecoration: 'none' }}>
                  <Button variant="secondary">
                    Apply as a SALO Rider
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
