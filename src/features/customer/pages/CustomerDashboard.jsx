import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import CustomerLayout from '../../../layouts/CustomerLayout';
import customerService from '../../../services/customerService';
import publicRestaurantService from '../../../services/publicRestaurantService';
import Button from '../../../components/common/Button';
import Badge from '../../../components/common/Badge';
import { StateView } from '../../../components/feedback';
import RestaurantImage from '../components/RestaurantImage';
import ActiveStatusStrip from '../components/ActiveStatusStrip';
import RoleOnboardingModal from '../../../components/onboarding/RoleOnboardingModal';
import { useRoleOnboarding } from '../../../hooks/useRoleOnboarding';
import './CustomerDashboard.css';

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
  const customerOnboarding = useRoleOnboarding('customer');

  const [restaurants, setRestaurants] = useState([]);
  const [categories, setCategories] = useState([]);
  const [pagination, setPagination] = useState({ current_page: 1, per_page: 12, total: 0, last_page: 1 });
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState('name');
  const [fulfillmentFilter, setFulfillmentFilter] = useState({
    delivery: false,
    pickup: false,
    dineIn: false,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [favoriteIds, setFavoriteIds] = useState([]);
  const [activeCategory, setActiveCategory] = useState('All');
  const [search, setSearch] = useState(() => new URLSearchParams(location.search).get('q') || '');
  const [activeOrders, setActiveOrders] = useState([]);
  const [upcomingReservations, setUpcomingReservations] = useState([]);

  const loadCategories = useCallback(async () => {
    try {
      const cats = await publicRestaurantService.getCategories();
      setCategories(cats);
    } catch {
      // Categories strip gracefully falls back to "All" if categories endpoint fails
    }
  }, []);

  const loadRestaurants = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await publicRestaurantService.getRestaurants({
        page,
        per_page: 12,
        search,
        category: activeCategory,
        offers_delivery: fulfillmentFilter.delivery,
        offers_pickup: fulfillmentFilter.pickup,
        offers_dine_in: fulfillmentFilter.dineIn,
        sort,
      });
      setRestaurants(result.restaurants);
      setPagination(result.pagination);
    } catch (err) {
      setError(err?.message || 'Unable to load restaurants right now.');
    } finally {
      setLoading(false);
    }
  }, [page, search, activeCategory, fulfillmentFilter, sort]);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  useEffect(() => {
    loadRestaurants();
  }, [loadRestaurants]);

  useEffect(() => {
    setFavoriteIds(customerService.getFavoriteRestaurants());
    setActiveOrders(customerService.getOrders());
    setUpcomingReservations(customerService.getReservations());
  }, []);

  useEffect(() => {
    const syncFavorites = () => setFavoriteIds(customerService.getFavoriteRestaurants());
    window.addEventListener('salo:favoritesUpdated', syncFavorites);
    return () => window.removeEventListener('salo:favoritesUpdated', syncFavorites);
  }, []);

  useEffect(() => {
    const nextQuery = new URLSearchParams(location.search).get('q') || '';
    setSearch(nextQuery);
    setPage(1);
  }, [location.search]);

  const filteredRestaurants = restaurants;

  const handleToggleFavorite = (_restaurantId, event) => {
    if (event) event.stopPropagation();
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
          {['All', ...categories.map((cat) => cat.name)].map((label) => {
            const isActive = activeCategory === label;
            return (
              <button
                key={label}
                type="button"
                className={`category-chip${isActive ? ' active' : ''}`}
                onClick={() => {
                  setActiveCategory(label);
                  setPage(1);
                }}
                aria-pressed={isActive}
              >
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
              <span className="customer-spotlight-card__ribbon">Kitchen Spotlight</span>
              {spotlightRestaurant.rating != null && spotlightRestaurant.reviewCount != null && (
                <span className="customer-spotlight-card__rating">
                  ★ {spotlightRestaurant.rating} ({spotlightRestaurant.reviewCount} reviews)
                </span>
              )}
            </div>
            <div className="customer-spotlight-card__body">
              <div className="customer-spotlight-card__top">
                <span className="customer-spotlight-card__eyebrow">Approved Partner Kitchen</span>
                <Badge variant={spotlightRestaurant.isOpen ? 'success' : 'default'} size="sm" dot>
                  {spotlightRestaurant.availability?.temporarily_unavailable
                    ? 'Temporarily Unavailable'
                    : spotlightRestaurant.isOpen
                      ? (spotlightRestaurant.availability?.not_accepting_orders ? 'Open · Not Accepting Orders' : 'Open Now')
                      : 'Currently Closed'}
                </Badge>
              </div>
              <h2 className="customer-spotlight-card__title">{spotlightRestaurant.name}</h2>
              <p className="customer-spotlight-card__cuisine">{spotlightRestaurant.cuisine}</p>
              <p className="customer-spotlight-card__bio">
                {spotlightRestaurant.description || 'Local partner kitchen on SALO.'}
              </p>
              <div className="customer-spotlight-card__meta">
                {spotlightRestaurant.offers?.delivery && <span>Delivery</span>}
                {spotlightRestaurant.offers?.pickup && <span>Pickup</span>}
                {spotlightRestaurant.offers?.dine_in && <span>Dine-in</span>}
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
              Explore Restaurants ({pagination.total})
            </h2>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            {[
              { key: 'delivery', label: 'Delivery' },
              { key: 'pickup', label: 'Pickup' },
              { key: 'dineIn', label: 'Dine-in' },
            ].map(({ key, label }) => (
              <button
                key={key}
                type="button"
                className={`category-chip${fulfillmentFilter[key] ? ' active' : ''}`}
                onClick={() => {
                  setFulfillmentFilter((prev) => ({ ...prev, [key]: !prev[key] }));
                  setPage(1);
                }}
                aria-pressed={fulfillmentFilter[key]}
              >
                {label}
              </button>
            ))}
            <select
              aria-label="Sort restaurants"
              value={sort}
              onChange={(e) => {
                setSort(e.target.value);
                setPage(1);
              }}
              style={{
                padding: '6px 10px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-primary)',
                background: 'var(--surface-primary)',
                color: 'var(--text-primary)',
                fontSize: 'var(--font-size-xs)',
              }}
            >
              <option value="name">Sort: Name (A–Z)</option>
              <option value="newest">Sort: Newest</option>
            </select>
          </div>
        </div>

        {loading ? (
          <StateView state="loading" title="restaurants" />
        ) : error ? (
          <StateView
            state="error"
            title="restaurants"
            errorDescription={error}
            onRetry={loadRestaurants}
          />
        ) : filteredRestaurants.length === 0 ? (
          <div className="customer-empty-filter">
            <div className="customer-empty-filter__icon" aria-hidden="true">🍽️</div>
            <h3>
              {search || activeCategory !== 'All' || fulfillmentFilter.delivery || fulfillmentFilter.pickup || fulfillmentFilter.dineIn
                ? 'No kitchens match your current filter'
                : 'No restaurants available yet'}
            </h3>
            <p>
              {search || activeCategory !== 'All' || fulfillmentFilter.delivery || fulfillmentFilter.pickup || fulfillmentFilter.dineIn
                ? `We couldn't find any restaurants matching ${search ? `"${search}"` : 'your selected filters'}.`
                : 'Approved partner kitchens will appear here once they go live.'}
            </p>
            {(search || activeCategory !== 'All' || fulfillmentFilter.delivery || fulfillmentFilter.pickup || fulfillmentFilter.dineIn) && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  setSearch('');
                  setActiveCategory('All');
                  setFulfillmentFilter({ delivery: false, pickup: false, dineIn: false });
                  setPage(1);
                  if (location.search) navigate('/customer');
                }}
              >
                Clear Search Filters
              </Button>
            )}
          </div>
        ) : (
          <>
            <div className="customer-restaurant-grid">
              {filteredRestaurants.map((rest, index) => {
                const isFav = favoriteIds.includes(rest.id);

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
                        fallback={getInitials(rest.name)}
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
                      {rest.rating != null && rest.reviewCount != null && (
                        <span className="customer-restaurant-card__rating">
                          <span className="customer-restaurant-card__star" aria-hidden="true">★</span>
                          {rest.rating} <span className="customer-restaurant-card__reviews">({rest.reviewCount})</span>
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
                          {rest.availability?.temporarily_unavailable
                            ? 'Unavailable'
                            : rest.isOpen
                              ? 'Open Now'
                              : 'Closed'}
                        </Badge>
                      </div>

                      <p className="customer-restaurant-card__cuisine">
                        {rest.cuisine}
                      </p>

                      {rest.description && (
                        <p className="customer-restaurant-card__desc">
                          {rest.description}
                        </p>
                      )}

                      <div className="customer-restaurant-card__metadata">
                        {rest.address && <span>📍 {rest.address}</span>}
                        {rest.offers?.delivery && <span>Delivery</span>}
                        {rest.offers?.pickup && <span>Pickup</span>}
                        {rest.offers?.dine_in && <span>Dine-in</span>}
                        {rest.availability?.not_accepting_orders && <span>Not accepting orders</span>}
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

            {pagination.last_page > 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px', marginTop: '24px' }}>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pagination.current_page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
                  Page {pagination.current_page} of {pagination.last_page}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pagination.current_page >= pagination.last_page}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            )}
          </>
        )}
      </section>

      <RoleOnboardingModal
        open={customerOnboarding.shouldShow}
        role="customer"
        user={customerOnboarding.user}
        updateUser={customerOnboarding.updateUser}
        customerAddresses={customerOnboarding.customerAddresses}
        onComplete={customerOnboarding.completeOnboarding}
        onSkip={customerOnboarding.skipOnboarding}
      />
    </CustomerLayout>
  );
}
