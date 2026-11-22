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
import HeroCarousel from '../components/HeroCarousel';
import FeatureStrip from '../components/FeatureStrip';
import CategoryChips from '../components/CategoryChips';
import { FeaturedRestaurantBanner } from '../../../components/reviews';
import reviewService from '../../../services/reviewService';
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
  return (
    String(name)
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0]?.toUpperCase())
      .join('') || 'S'
  );
}

function KitchenOpenBadge({ restaurant, detailedClosedText = false }) {
  const isTempUnavailable = Boolean(restaurant?.availability?.temporarily_unavailable);
  const isOpen = Boolean(restaurant?.isOpen) && !isTempUnavailable;
  const notAcceptingOrders = Boolean(restaurant?.availability?.not_accepting_orders);

  if (isOpen) {
    return (
      <span className="customer-open-badge">
        <span className="customer-open-badge__dot" aria-hidden="true" />
        <span>
          {detailedClosedText && notAcceptingOrders ? 'Open · Not Accepting Orders' : 'Open Now'}
        </span>
      </span>
    );
  }

  return (
    <Badge variant="default" size="sm" dot>
      {isTempUnavailable
        ? detailedClosedText
          ? 'Temporarily Unavailable'
          : 'Unavailable'
        : detailedClosedText
          ? 'Currently Closed'
          : 'Closed'}
    </Badge>
  );
}

function SpotlightSkeleton() {
  return (
    <section
      className="customer-spotlight-section customer-stagger-item"
      style={{ '--stagger-index': 3 }}
      aria-hidden="true"
    >
      <div className="customer-spotlight-card customer-spotlight-card--skeleton">
        <div className="customer-spotlight-card__media customer-shimmer" />
        <div className="customer-spotlight-card__body">
          <div className="customer-skeleton-row">
            <span className="customer-shimmer customer-skeleton-line" style={{ width: '140px', height: '14px' }} />
            <span className="customer-shimmer customer-skeleton-pill" style={{ width: '88px', height: '22px' }} />
          </div>
          <div className="customer-shimmer customer-skeleton-line" style={{ width: '58%', height: '24px' }} />
          <div className="customer-shimmer customer-skeleton-line" style={{ width: '32%', height: '14px' }} />
          <div className="customer-shimmer customer-skeleton-line" style={{ width: '86%', height: '14px' }} />
          <div className="customer-skeleton-row" style={{ marginTop: '8px' }}>
            <span className="customer-shimmer customer-skeleton-btn" />
            <span className="customer-shimmer customer-skeleton-btn" />
          </div>
        </div>
      </div>
    </section>
  );
}

function RestaurantGridSkeleton({ count = 6 }) {
  return (
    <div className="customer-restaurant-grid" aria-label="Loading kitchens" aria-busy="true">
      {Array.from({ length: count }).map((_, idx) => (
        <div
          key={idx}
          className="customer-restaurant-card customer-restaurant-card--skeleton customer-stagger-item"
          style={{ '--stagger-index': idx + 4 }}
          aria-hidden="true"
        >
          <div className="customer-restaurant-card__cover customer-shimmer">
            <div className="customer-skeleton-logo customer-shimmer" />
          </div>
          <div className="customer-restaurant-card__details">
            <div className="customer-skeleton-row">
              <span className="customer-shimmer customer-skeleton-line" style={{ width: '62%', height: '18px' }} />
              <span className="customer-shimmer customer-skeleton-pill" style={{ width: '74px', height: '20px' }} />
            </div>
            <div className="customer-shimmer customer-skeleton-line" style={{ width: '38%', height: '12px' }} />
            <div className="customer-shimmer customer-skeleton-line" style={{ width: '92%', height: '12px' }} />
            <div className="customer-shimmer customer-skeleton-line" style={{ width: '74%', height: '12px' }} />
            <div className="customer-skeleton-row" style={{ marginTop: 'auto', paddingTop: '8px' }}>
              <span className="customer-shimmer customer-skeleton-pill" style={{ width: '64px', height: '20px' }} />
              <span className="customer-shimmer customer-skeleton-pill" style={{ width: '56px', height: '20px' }} />
              <span className="customer-shimmer customer-skeleton-pill" style={{ width: '58px', height: '20px' }} />
            </div>
            <div className="customer-restaurant-card__actions">
              <span className="customer-shimmer customer-skeleton-action" />
              <span className="customer-shimmer customer-skeleton-action" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
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
  const [featuredRestaurant, setFeaturedRestaurant] = useState(null);

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
    reviewService.getFeaturedRestaurant()
      .then((featured) => setFeaturedRestaurant(featured))
      .catch(() => setFeaturedRestaurant(null));
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

  const isDefaultExploreView = activeCategory === 'All' && !search.trim();
  const spotlightRestaurant =
    isDefaultExploreView && filteredRestaurants.length > 0 ? filteredRestaurants[0] : null;

  const scrollToListings = () => {
    listingsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleReserveHeroClick = () => {
    if (restaurants[0]?.id) {
      navigate(`/customer/restaurants/${restaurants[0].id}?tab=reserve`);
    } else {
      scrollToListings();
    }
  };

  return (
    <CustomerLayout>
      <div className="customer-explore-feed">
        {/* ── Active Order & Upcoming Reservation — compact strip ── */}
        <ActiveStatusStrip
          activeOrder={activeOrders[0] ?? null}
          activeOrders={activeOrders}
          reservation={upcomingReservations[0] ?? null}
        />

        {/* ── A. Compact Auto-Rotating Hero Carousel (~240px on desktop) ── */}
        <HeroCarousel
          onExploreClick={scrollToListings}
          onReserveClick={handleReserveHeroClick}
        />

        {/* ── B. Slim Single-Row Feature Strip (~64px tall) ── */}
        <FeatureStrip />

        {/* ── C. Category Chips with Sliding Active Pill & Cuisine Emojis ── */}
        <CategoryChips
          ref={listingsRef}
          categories={categories}
          activeCategory={activeCategory}
          onSelectCategory={(label) => {
            setActiveCategory(label);
            setPage(1);
          }}
        />

        {/* ── Featured Restaurant of the Week ── */}
        {isDefaultExploreView && featuredRestaurant && (
          <FeaturedRestaurantBanner
            featured={featuredRestaurant}
            onViewRestaurant={(featured) => navigate(`/customer/restaurants/${featured.restaurant_id}`)}
            onReserveTable={(featured) => navigate(`/customer/restaurants/${featured.restaurant_id}?tab=reserve`)}
          />
        )}

        {/* ── Spotlight Kitchen Card (Visible above fold at 1920x1080) ── */}
        {loading && isDefaultExploreView ? (
          <SpotlightSkeleton />
        ) : (
          spotlightRestaurant && (
            <section
              className="customer-spotlight-section customer-stagger-item"
              style={{ '--stagger-index': 3 }}
              aria-label="Kitchen spotlight"
            >
              <article
                className="customer-spotlight-card"
                onClick={() => navigate(`/customer/restaurants/${spotlightRestaurant.id}`)}
              >
                <div className="customer-spotlight-card__media">
                  <RestaurantImage
                    image={spotlightRestaurant.coverPhoto}
                    alt={`${spotlightRestaurant.displayName || spotlightRestaurant.name} featured cover`}
                    fallback={spotlightRestaurant.coverImage || getInitials(spotlightRestaurant.displayName || spotlightRestaurant.name)}
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
                    <KitchenOpenBadge restaurant={spotlightRestaurant} detailedClosedText />
                  </div>
                  <div className="customer-spotlight-card__header-row">
                    <h2 className="customer-spotlight-card__title">{spotlightRestaurant.displayName || spotlightRestaurant.name}</h2>
                    <span className="customer-spotlight-card__cuisine">{spotlightRestaurant.cuisine}</span>
                  </div>
                  <p className="customer-spotlight-card__bio">
                    {spotlightRestaurant.description || 'Local partner kitchen on SALO.'}
                  </p>
                  <div className="customer-spotlight-card__bottom">
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
                </div>
              </article>
            </section>
          )
        )}

        {/* ── Restaurant Listings Grid ───────────────────────── */}
        <section
          className="customer-listings-section customer-stagger-item"
          style={{ '--stagger-index': 4 }}
        >
          <div className="customer-listings-header">
            <div>
              <span className="customer-listings-eyebrow">Gutom ka na ba?</span>
              <h2 className="section-title" style={{ margin: 0 }}>
                Explore Restaurants {!loading && `(${pagination.total})`}
              </h2>
            </div>
            <div className="customer-listings-controls">
              {[
                { key: 'delivery', label: '🛵 Delivery' },
                { key: 'pickup', label: '🛍️ Pickup' },
                { key: 'dineIn', label: '🍽️ Dine-in' },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  className={`fulfillment-chip${fulfillmentFilter[key] ? ' active' : ''}`}
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
                className="customer-sort-select"
                value={sort}
                onChange={(e) => {
                  setSort(e.target.value);
                  setPage(1);
                }}
              >
                <option value="name">Sort: Name (A–Z)</option>
                <option value="newest">Sort: Newest</option>
              </select>
            </div>
          </div>

          {loading ? (
            <RestaurantGridSkeleton count={6} />
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
                      className="customer-restaurant-card customer-stagger-item"
                      style={{ '--stagger-index': Math.min(index + 4, 12) }}
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
                          <h3>{rest.displayName || rest.name}</h3>
                          <KitchenOpenBadge restaurant={rest} />
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
                <div className="customer-pagination">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pagination.current_page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </Button>
                  <span className="customer-pagination__info">
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
      </div>
    </CustomerLayout>
  );
}
