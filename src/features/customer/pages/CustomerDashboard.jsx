import { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import CustomerLayout from '../../../layouts/CustomerLayout';
import customerService from '../../../services/customerService';
import Button from '../../../components/common/Button';
import Badge from '../../../components/common/Badge';
import RestaurantImage from '../components/RestaurantImage';
import ActiveStatusStrip from '../components/ActiveStatusStrip';
import './CustomerDashboard.css';

const CATEGORIES = [
  { label: 'All', icon: '🍽️' },
  { label: 'Filipino & Silog', icon: '🍲' },
  { label: 'Grill & BBQ', icon: '🔥' },
  { label: 'Burgers & Wings', icon: '🍔' },
  { label: 'Pizza & Pasta', icon: '🍕' },
  { label: 'Asian & Noodles', icon: '🍜' },
  { label: 'Café & Bakery', icon: '🥐' },
];

const FALLBACK_COVERS = [
  '/images/landing/hero-food.png',
  '/images/landing/food-gathering.png',
  '/images/landing/restaurant-interior.png',
  '/images/auth/login-food.png',
];

function getRestaurantFallbackCover(restaurant, index = 0) {
  if (!restaurant) return FALLBACK_COVERS[0];
  const id = String(restaurant.id || '').toLowerCase();
  const cuisine = String(restaurant.cuisine || '').toLowerCase();
  if (id.includes('dalisay') || cuisine.includes('filipino')) return '/images/landing/hero-food.png';
  if (id.includes('pizza') || cuisine.includes('pizza') || cuisine.includes('italian')) return '/images/landing/food-gathering.png';
  if (cuisine.includes('grill') || cuisine.includes('bbq')) return '/images/auth/login-food.png';
  if (cuisine.includes('caf') || cuisine.includes('bakery')) return '/images/landing/restaurant-interior.png';
  return FALLBACK_COVERS[index % FALLBACK_COVERS.length];
}

function getInitials(name = '') {
  return String(name)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join('') || 'S';
}

export default function CustomerDashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const listingsRef = useRef(null);

  const [restaurants, setRestaurants] = useState([]);
  const [favoriteIds, setFavoriteIds] = useState([]);
  const [activeCategory, setActiveCategory] = useState('All');
  const [search, setSearch] = useState('');
  const [activeOrders, setActiveOrders] = useState([]);
  const [upcomingReservations, setUpcomingReservations] = useState([]);

  useEffect(() => {
    async function loadData() {
      const rests = await customerService.getRestaurants();
      setRestaurants(rests);
      setFavoriteIds(customerService.getFavoriteRestaurants());

      const ords = customerService.getOrders();
      setActiveOrders(ords.filter((o) => !['Completed', 'Cancelled', 'Rejected'].includes(o.overallStatus)));

      const resvs = customerService.getReservations();
      setUpcomingReservations(resvs.filter((r) => r.status === 'Confirmed'));
    }
    loadData();
    window.addEventListener('salo:demoStoreUpdated', loadData);
    return () => window.removeEventListener('salo:demoStoreUpdated', loadData);
  }, []);

  useEffect(() => {
    const syncFavorites = () => setFavoriteIds(customerService.getFavoriteRestaurants());
    window.addEventListener('salo:favoritesUpdated', syncFavorites);
    return () => window.removeEventListener('salo:favoritesUpdated', syncFavorites);
  }, []);

  useEffect(() => {
    const nextQuery = new URLSearchParams(location.search).get('q') || '';
    setSearch(nextQuery);
  }, [location.search]);

  const filteredRestaurants = restaurants.filter((r) => {
    const matchesSearch =
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.cuisine.toLowerCase().includes(search.toLowerCase());
    const matchesCat = activeCategory === 'All' || r.cuisine.includes(activeCategory.split(' ')[0]);
    return matchesSearch && matchesCat;
  });

  const handleToggleFavorite = (restaurantId, event) => {
    if (event) event.stopPropagation();
    const next = customerService.toggleFavoriteRestaurant(restaurantId);
    setFavoriteIds(next);
  };

  const spotlightRestaurant =
    activeCategory === 'All' && !search.trim() && filteredRestaurants.length > 0
      ? filteredRestaurants[0]
      : null;

  const scrollToListings = () => {
    listingsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <CustomerLayout>
      {/* ── Active Order & Upcoming Reservation — compact strip ── */}
      <ActiveStatusStrip
        activeOrder={activeOrders[0] ?? null}
        activeOrders={activeOrders}
        reservation={upcomingReservations[0] ?? null}
      />

      {/* ── Customer Promotional Section (Uses public/promo/promo.png) ── */}
      <section className="customer-promo-section" aria-label="Featured promotions">
        <div className="customer-promo-card">
          <div className="customer-promo-card__media">
            <img
              src="/promo/promo.png"
              alt="SALO promotional feature — order neighborhood favorites and reserve tables"
              className="customer-promo-card__image"
            />
          </div>
          <div className="customer-promo-card__content">
            <div className="customer-promo-card__badges">
              <span className="customer-promo-pill customer-promo-pill--mustard">
                ★ Salo-Salo Featured Offer
              </span>
              <span className="customer-promo-pill customer-promo-pill--green">
                Multi-Kitchen Delivery & Dine-In
              </span>
            </div>
            <h1 className="customer-promo-card__title">
              Bring the neighborhood&apos;s finest tables & kitchens to your gathering.
            </h1>
            <p className="customer-promo-card__description">
              Mix dishes from multiple local restaurants in a single checkout or reserve a table ahead of time for effortless group dining.
            </p>
            <div className="customer-promo-card__actions">
              <Button variant="primary" size="md" onClick={scrollToListings}>
                Explore Kitchens
              </Button>
              {restaurants[0] && (
                <Button
                  variant="outline"
                  size="md"
                  onClick={() => navigate(`/customer/restaurants/${restaurants[0].id}?tab=reserve`)}
                >
                  Reserve a Table
                </Button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── Platform Experience Highlights (Visual Variety) ── */}
      <section className="customer-highlights-strip" aria-label="SALO platform highlights">
        <div className="customer-highlight-tile">
          <span className="customer-highlight-tile__icon" aria-hidden="true">🧺</span>
          <div>
            <h3>Multi-Kitchen Basket</h3>
            <p>Combine dishes from up to 3 partner kitchens in one seamless order.</p>
          </div>
        </div>
        <div className="customer-highlight-tile">
          <span className="customer-highlight-tile__icon" aria-hidden="true">🕯️</span>
          <div>
            <h3>Instant Table Booking</h3>
            <p>Lock in dining room seats for family feasts and special occasions.</p>
          </div>
        </div>
        <div className="customer-highlight-tile">
          <span className="customer-highlight-tile__icon" aria-hidden="true">🌿</span>
          <div>
            <h3>Crafted Local Flavors</h3>
            <p>Authentic heritage recipes and artisan kitchens across the metro.</p>
          </div>
        </div>
      </section>

      {/* ── Categories Strip ─────────────────────────────── */}
      <section className="customer-categories-section" aria-label="Filter by food category" ref={listingsRef}>
        <div className="customer-categories-bar">
          {CATEGORIES.map(({ label, icon }) => {
            const isActive = activeCategory === label;
            return (
              <button
                key={label}
                type="button"
                className={`category-chip${isActive ? ' active' : ''}`}
                onClick={() => setActiveCategory(label)}
                aria-pressed={isActive}
              >
                <span className="category-chip__icon" aria-hidden="true">{icon}</span>
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* ── Spotlight Kitchen Card (Visual Variety) ──────── */}
      {spotlightRestaurant && (
        <section className="customer-spotlight-section" aria-label="Kitchen spotlight">
          <article
            className="customer-spotlight-card"
            onClick={() => navigate(`/customer/restaurants/${spotlightRestaurant.id}`)}
          >
            <div className="customer-spotlight-card__media">
              <RestaurantImage
                image={spotlightRestaurant.coverPhoto}
                alt={`${spotlightRestaurant.name} featured cover`}
                fallback={spotlightRestaurant.coverImage || getInitials(spotlightRestaurant.name)}
                fallbackSrc={getRestaurantFallbackCover(spotlightRestaurant, 0)}
                className="customer-spotlight-card__image"
              />
              <span className="customer-spotlight-card__ribbon">Chef&apos;s Spotlight</span>
              <span className="customer-spotlight-card__rating">
                ★ {spotlightRestaurant.rating} ({spotlightRestaurant.reviewCount} reviews)
              </span>
            </div>
            <div className="customer-spotlight-card__body">
              <div className="customer-spotlight-card__top">
                <span className="customer-spotlight-card__eyebrow">Featured Heritage Kitchen</span>
                <Badge variant={spotlightRestaurant.isOpen ? 'success' : 'default'} size="sm" dot>
                  {spotlightRestaurant.isOpen ? 'Open for Orders & Reservations' : 'Currently Closed'}
                </Badge>
              </div>
              <h2 className="customer-spotlight-card__title">{spotlightRestaurant.name}</h2>
              <p className="customer-spotlight-card__cuisine">{spotlightRestaurant.cuisine}</p>
              <p className="customer-spotlight-card__bio">
                {spotlightRestaurant.description || spotlightRestaurant.bio || 'Celebrated neighborhood kitchen serving handcrafted dishes made fresh daily.'}
              </p>
              <div className="customer-spotlight-card__meta">
                {spotlightRestaurant.deliveryTime && <span>⏱ {spotlightRestaurant.deliveryTime}</span>}
                {spotlightRestaurant.deliveryFee != null && <span>🛵 ₱{spotlightRestaurant.deliveryFee} delivery</span>}
                {spotlightRestaurant.minOrder != null && <span>🛍 Min. ₱{spotlightRestaurant.minOrder}</span>}
                {spotlightRestaurant.address && <span>📍 {spotlightRestaurant.address}</span>}
              </div>
              <div className="customer-spotlight-card__actions">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/customer/restaurants/${spotlightRestaurant.id}`);
                  }}
                >
                  View Menu & Order
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/customer/restaurants/${spotlightRestaurant.id}?tab=reserve`);
                  }}
                >
                  Book a Table
                </Button>
              </div>
            </div>
          </article>
        </section>
      )}

      {/* ── Restaurant Listings Grid ───────────────────────── */}
      <section className="customer-listings-section">
        <div className="customer-listings-header">
          <div>
            <span className="customer-listings-eyebrow">Gutom ka na ba?</span>
            <h2 className="section-title" style={{ margin: 0 }}>
              Explore Restaurants ({filteredRestaurants.length})
            </h2>
          </div>
          <span className="customer-listings-subtitle">
            Order delivery or book a table in advance
          </span>
        </div>

        {filteredRestaurants.length === 0 ? (
          <div className="customer-empty-filter">
            <div className="customer-empty-filter__icon" aria-hidden="true">🍽️</div>
            <h3>No kitchens match your current filter</h3>
            <p>
              We couldn&apos;t find any restaurants matching{' '}
              {search ? `"${search}"` : activeCategory}. Try clearing your filters to explore all kitchens.
            </p>
            <Button variant="primary" size="sm" onClick={() => { setSearch(''); setActiveCategory('All'); }}>
              Clear Search Filters
            </Button>
          </div>
        ) : (
          <div className="customer-restaurant-grid">
            {filteredRestaurants.map((rest, index) => {
              const isFav = favoriteIds.includes(rest.id);
              const activePromo = Array.isArray(rest.promotions)
                ? rest.promotions.find((p) => p.status === 'active')
                : null;

              return (
                <article
                  key={rest.id}
                  onClick={() => navigate(`/customer/restaurants/${rest.id}`)}
                  className="customer-restaurant-card"
                >
                  {/* Visual Cover */}
                  <div className="customer-restaurant-card__cover">
                    <RestaurantImage
                      image={rest.coverPhoto}
                      alt={`${rest.name} cover photo`}
                      fallback={rest.coverImage || getInitials(rest.name)}
                      fallbackSrc={getRestaurantFallbackCover(rest, index)}
                      className="customer-restaurant-card__image"
                    />
                    <div className="customer-restaurant-card__scrim" aria-hidden="true" />
                    <button
                      type="button"
                      onClick={(event) => handleToggleFavorite(rest.id, event)}
                      aria-label={isFav ? 'Remove from favorites' : 'Add to favorites'}
                      className={`customer-restaurant-card__favorite${isFav ? ' is-favorite' : ''}`}
                    >
                      {isFav ? '♥' : '♡'}
                    </button>
                    <span className="customer-restaurant-card__rating">
                      <span className="customer-restaurant-card__star" aria-hidden="true">★</span>
                      {rest.rating} <span className="customer-restaurant-card__reviews">({rest.reviewCount})</span>
                    </span>
                    {activePromo && (
                      <span className="customer-restaurant-card__promo">
                        {activePromo.code || 'Promo Available'}
                      </span>
                    )}
                    <div className="customer-restaurant-card__logo">
                      {rest.logoImage ? (
                        <RestaurantImage
                          image={rest.logoImage}
                          alt={`${rest.name} logo`}
                          fallback={getInitials(rest.name)}
                        />
                      ) : (
                        <span>{getInitials(rest.name)}</span>
                      )}
                    </div>
                  </div>

                  {/* Details */}
                  <div className="customer-restaurant-card__details">
                    <div className="customer-restaurant-card__title-row">
                      <h3>{rest.name}</h3>
                      <Badge variant={rest.isOpen ? 'success' : 'default'} size="sm" dot>
                        {rest.isOpen ? 'Open Now' : 'Closed'}
                      </Badge>
                    </div>

                    <p className="customer-restaurant-card__cuisine">
                      {rest.cuisine}
                    </p>

                    {(rest.description || rest.bio) && (
                      <p className="customer-restaurant-card__desc">
                        {rest.description || rest.bio}
                      </p>
                    )}

                    <div className="customer-restaurant-card__metadata">
                      {rest.deliveryTime && <span>⏱ {rest.deliveryTime}</span>}
                      {rest.deliveryFee != null && <span>🛵 ₱{rest.deliveryFee}</span>}
                      {rest.minOrder != null && <span>Min ₱{rest.minOrder}</span>}
                    </div>

                    {/* Dual Action Strip */}
                    <div className="customer-restaurant-card__actions">
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/customer/restaurants/${rest.id}`);
                        }}
                      >
                        Order Food
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/customer/restaurants/${rest.id}?tab=reserve`);
                        }}
                      >
                        Book a Table
                      </Button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </CustomerLayout>
  );
}
