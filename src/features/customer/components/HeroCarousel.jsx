import { useState, useEffect, useCallback } from 'react';
import Button from '../../../components/common/Button';

const HERO_SLIDES = [
  {
    id: 'featured-offer',
    pillPrimary: '★ Salo-Salo Featured Offer',
    pillSecondary: 'Multi-Kitchen Delivery & Dine-In',
    headline: 'Bring the neighborhood\u2019s finest tables & kitchens to your gathering.',
    description:
      'Mix dishes from multiple local restaurants in a single checkout or reserve a table ahead of time for effortless group dining.',
    image: '/promo/promo.png',
    imageAlt: 'SALO featured spread — order neighborhood favorites and reserve tables',
    badges: [
      { id: 'rating', text: '⭐ 4.8 Top Rated', position: 'top-right' },
      { id: 'delivery', text: '🕒 25 min delivery', position: 'bottom-left' },
    ],
  },
  {
    id: 'table-booking',
    pillPrimary: '★ Instant Table Booking',
    pillSecondary: 'Verified Dining Rooms',
    headline: 'Reserve the perfect table for family feasts & special gatherings.',
    description:
      'Lock in dining room seats ahead of time with instant confirmation and pre-order options for your whole group.',
    image: '/images/landing/restaurant-interior.png',
    imageAlt: 'Warmly lit Filipino restaurant dining room ready for reservations',
    badges: [
      { id: 'confirm', text: '✨ Instant Confirmation', position: 'top-right' },
      { id: 'rated', text: '⭐ 4.9 Host Rated', position: 'bottom-left' },
    ],
  },
  {
    id: 'local-flavors',
    pillPrimary: '★ Crafted Local Flavors',
    pillSecondary: 'Artisan Partner Kitchens',
    headline: 'Savor authentic heritage recipes crafted by neighborhood chefs.',
    description:
      'Discover heirloom family dishes, regional specialties, and modern Filipino comfort food prepared fresh daily.',
    image: '/images/landing/hero-food.png',
    imageAlt: 'Authentic Filipino dishes freshly prepared by partner kitchens',
    badges: [
      { id: 'top-rated', text: '⭐ 4.8 Top Rated', position: 'top-right' },
      { id: 'fresh', text: '🌿 100% Local Kitchens', position: 'bottom-left' },
    ],
  },
];

const SLIDE_INTERVAL_MS = 5000;

export default function HeroCarousel({ onExploreClick, onReserveClick }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [parallax, setParallax] = useState({ x: 0, y: 0 });

  const nextSlide = useCallback(() => {
    setActiveIndex((prev) => (prev + 1) % HERO_SLIDES.length);
  }, []);

  useEffect(() => {
    if (isPaused) return undefined;

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) return undefined;

    const timer = window.setInterval(nextSlide, SLIDE_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [isPaused, nextSlide]);

  const handleMouseMove = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const relX = (event.clientX - rect.left) / rect.width - 0.5;
    const relY = (event.clientY - rect.top) / rect.height - 0.5;
    setParallax({
      x: Number((relX * -10).toFixed(2)),
      y: Number((relY * -8).toFixed(2)),
    });
  };

  const handleMouseLeave = () => {
    setIsPaused(false);
    setParallax({ x: 0, y: 0 });
  };

  const currentSlide = HERO_SLIDES[activeIndex];

  return (
    <section
      className="customer-promo-section customer-stagger-item"
      style={{ '--stagger-index': 0 }}
      aria-label="Featured promotions carousel"
      aria-roledescription="carousel"
    >
      <div
        className="customer-promo-card"
        onMouseEnter={() => setIsPaused(true)}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onFocusCapture={() => setIsPaused(true)}
        onBlurCapture={() => setIsPaused(false)}
      >
        {/* Left column: Compact copy & actions */}
        <div className="customer-promo-card__content">
          <div className="customer-promo-card__badges">
            <span className="customer-promo-pill customer-promo-pill--mustard">
              {currentSlide.pillPrimary}
            </span>
            <span className="customer-promo-pill customer-promo-pill--green">
              {currentSlide.pillSecondary}
            </span>
          </div>

          <div className="customer-promo-card__slide-copy" key={currentSlide.id}>
            <h1 className="customer-promo-card__title">{currentSlide.headline}</h1>
            <p className="customer-promo-card__description">{currentSlide.description}</p>
          </div>

          <div className="customer-promo-card__footer">
            <div className="customer-promo-card__actions">
              <Button
                variant="primary"
                size="sm"
                className="customer-hero-btn-primary"
                onClick={onExploreClick}
              >
                Explore Kitchens
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="customer-hero-btn-secondary"
                onClick={onReserveClick}
              >
                Reserve a Table
              </Button>
            </div>

            {/* Carousel dot indicators */}
            <div className="customer-promo-dots" role="tablist" aria-label="Promotional slides">
              {HERO_SLIDES.map((slide, idx) => {
                const isActive = idx === activeIndex;
                return (
                  <button
                    key={slide.id}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    aria-label={`Slide ${idx + 1}: ${slide.pillPrimary.replace('★ ', '')}`}
                    className={`customer-promo-dot${isActive ? ' is-active' : ''}`}
                    onClick={() => setActiveIndex(idx)}
                  />
                );
              })}
            </div>
          </div>
        </div>

        {/* Right column: ~40% width visual panel with warm gradient overlay, Ken Burns & floating glass badges */}
        <div
          className="customer-promo-card__media"
          style={{
            '--parallax-x': `${parallax.x}px`,
            '--parallax-y': `${parallax.y}px`,
          }}
        >
          {HERO_SLIDES.map((slide, idx) => {
            const isActive = idx === activeIndex;
            return (
              <div
                key={slide.id}
                className={`customer-promo-card__slide-media${isActive ? ' is-active' : ''}`}
                aria-hidden={!isActive}
              >
                <img
                  src={slide.image}
                  alt={slide.imageAlt}
                  className="customer-promo-card__image"
                />
              </div>
            );
          })}

          <div className="customer-promo-card__media-overlay" aria-hidden="true" />

          {/* Floating glass mini badges */}
          <div className="customer-promo-floating-badges" aria-hidden="true">
            {currentSlide.badges.map((badge, bIdx) => (
              <span
                key={badge.id}
                className={`customer-glass-badge customer-glass-badge--${badge.position}`}
                style={{ '--float-delay': `${bIdx * -1.8}s` }}
              >
                {badge.text}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
