import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import CustomerLayout from '../../../layouts/CustomerLayout';
import customerService from '../../../services/customerService';
import publicRestaurantService from '../../../services/publicRestaurantService';
import Button from '../../../components/common/Button';
import Badge from '../../../components/common/Badge';
import { StateView } from '../../../components/feedback';
import ItemModal from '../components/ItemModal';
import ReservationModal from '../components/ReservationModal';
import RestaurantImage from '../components/RestaurantImage';
import MenuItemCard from '../components/MenuItemCard';
import OrderPanel from '../components/OrderPanel';
import MobileOrderBar from '../components/MobileOrderBar';
import { RatingSummaryCard, ReviewList } from '../../../components/reviews';
import {
  MOCK_FEATURED_RESTAURANT_WEEKS,
  MOCK_RESTAURANT_REVIEWS,
} from '../../../mocks/reviewsAndFeaturedMock';
import { computeMockRatingSummary } from '../../../utils/reviewDisplayUtils';
import { useMenuSearch } from '../hooks/useMenuSearch';
import { useScrollSpy } from '../hooks/useScrollSpy';
import './RestaurantDetailPage.css';

function categoryToId(cat) {
  return `rdp-cat-${cat.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
}

function getHeroFallbackCover(restaurant) {
  const id = String(restaurant?.id || '').toLowerCase();
  const cuisine = String(restaurant?.cuisine || '').toLowerCase();
  if (id.includes('dalisay') || cuisine.includes('filipino')) return '/images/landing/hero-food.png';
  if (id.includes('pizza') || cuisine.includes('pizza') || cuisine.includes('italian')) return '/images/landing/food-gathering.png';
  return '/images/landing/restaurant-interior.png';
}

function getInitials(name = '') {
  return String(name)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join('') || 'S';
}

export default function RestaurantDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [restaurant, setRestaurant] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [reservationOpen, setReservationOpen] = useState(searchParams.get('tab') === 'reserve');
  const [isFavorite, setIsFavorite] = useState(false);
  const [menuSearch, setMenuSearch] = useState('');
  const [manualActiveTab, setManualActiveTab] = useState(null);
  const [reviewDateRange, setReviewDateRange] = useState({ key: 'all', days: null });
  const [reviewStarFilter, setReviewStarFilter] = useState('all');

  // ── Data fetching ──────────────────────────────────────────
  const fetchRest = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotFound(false);
    try {
      const data = await publicRestaurantService.getRestaurantWithMenu(id);
      if (!data) {
        setNotFound(true);
        setRestaurant(null);
      } else {
        setRestaurant(data);
        setIsFavorite(customerService.getFavoriteRestaurants().includes(data.id));
      }
    } catch (err) {
      if (err?.status === 404) {
        setNotFound(true);
        setRestaurant(null);
      } else {
        setError(err?.message || 'Unable to load restaurant details.');
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchRest();
  }, [fetchRest]);

  useEffect(() => {
    const syncFavoriteState = () => {
      setIsFavorite(Boolean(restaurant && customerService.getFavoriteRestaurants().includes(restaurant.id)));
    };
    window.addEventListener('salo:favoritesUpdated', syncFavoriteState);
    return () => window.removeEventListener('salo:favoritesUpdated', syncFavoriteState);
  }, [restaurant]);

  // ── Derived restaurant state ───────────────────────────────
  const offersDelivery = restaurant?.fulfillment?.delivery !== false;
  const offersPickup = restaurant?.fulfillment?.pickup !== false;
  const acceptingOrders = restaurant?.operatingSchedule?.acceptingOrders !== false;
  const acceptingReservations = restaurant?.operatingSchedule?.acceptingReservations !== false;
  const canStartOrder = acceptingOrders;
  const coverage = restaurant?.deliveryCoverage || {};
  const coverageText = coverage.method === 'cities'
    ? coverage.cities?.join(', ')
    : coverage.method === 'barangays'
      ? coverage.barangays?.join(', ')
      : coverage.method === 'zones' || coverage.method === 'other'
        ? coverage.zones
        : coverage.method === 'radius' && coverage.radiusKm
          ? `${coverage.radiusKm} km`
          : '';

  // ── Category + menu logic ──────────────────────────────────
  const categories = useMemo(() => restaurant?.categories || [], [restaurant]);
  const allTabs = useMemo(() => ['All', ...categories], [categories]);

  const categoryGroups = useMemo(() => {
    if (!restaurant?.menu) return [];
    return categories.map((cat) => {
      const all = restaurant.menu.filter((item) => item.category === cat);
      const available = all.filter((item) => item.availability === 'available');
      const unavailable = all.filter((item) => item.availability !== 'available');
      return { name: cat, items: [...available, ...unavailable] };
    });
  }, [restaurant, categories]);

  const activeFeaturedWeek = useMemo(
    () => MOCK_FEATURED_RESTAURANT_WEEKS.find((w) => w.selection_status === 'active') || null,
    [],
  );

  const isFeaturedThisWeek = Boolean(
    restaurant && activeFeaturedWeek && String(restaurant.id) === String(activeFeaturedWeek.restaurant_id),
  );

  const mockRestaurantReviews = useMemo(() => {
    const matched = MOCK_RESTAURANT_REVIEWS.filter(
      (r) => String(r.restaurant_id) === String(restaurant?.id || ''),
    );
    return matched.length > 0 ? matched : MOCK_RESTAURANT_REVIEWS.filter((r) => r.restaurant_id === 1);
  }, [restaurant]);

  const mockRatingSummary = useMemo(
    () => computeMockRatingSummary(mockRestaurantReviews, reviewDateRange.days),
    [mockRestaurantReviews, reviewDateRange.days],
  );

  const allMenuItems = useMemo(
    () => categoryGroups.flatMap((g) => g.items),
    [categoryGroups]
  );
  const filteredItems = useMenuSearch(allMenuItems, menuSearch);

  const filteredGroups = useMemo(() => {
    const q = menuSearch.trim();
    if (!q) return categoryGroups;
    return categoryGroups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) =>
          filteredItems.some((fi) => fi.id === item.id)
        ),
      }))
      .filter((group) => group.items.length > 0);
  }, [categoryGroups, menuSearch, filteredItems]);

  const sectionIds = useMemo(() => categories.map(categoryToId), [categories]);
  const scrollSpyActiveId = useScrollSpy(sectionIds, { rootMargin: '-10% 0px -80% 0px' });

  const activeTabId = manualActiveTab
    ? manualActiveTab
    : scrollSpyActiveId
      ? categories.find((c) => categoryToId(c) === scrollSpyActiveId) ?? 'All'
      : 'All';

  useEffect(() => {
    if (!manualActiveTab) return;
    const t = setTimeout(() => setManualActiveTab(null), 1200);
    return () => clearTimeout(t);
  }, [manualActiveTab]);

  const handleTabClick = useCallback((tab) => {
    setManualActiveTab(tab);
    if (tab === 'All') {
      const menuEl = document.getElementById('restaurant-menu-section');
      menuEl?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      const el = document.getElementById(categoryToId(tab));
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  if (loading) {
    return (
      <CustomerLayout>
        <StateView state="loading" title="restaurant details" />
      </CustomerLayout>
    );
  }

  if (error) {
    return (
      <CustomerLayout>
        <StateView
          state="error"
          title="restaurant details"
          errorDescription={error}
          onRetry={fetchRest}
        />
      </CustomerLayout>
    );
  }

  if (notFound || !restaurant) {
    return (
      <CustomerLayout>
        <StateView
          state="empty"
          title="Restaurant not found"
          emptyTitle="Restaurant unavailable"
          emptyDescription="This restaurant does not exist or is currently not active."
          action={<Button variant="primary" size="sm" onClick={() => navigate('/customer')}>Back to Restaurants</Button>}
        />
      </CustomerLayout>
    );
  }

  const activePromos = Array.isArray(restaurant.promotions)
    ? restaurant.promotions.filter((p) => p.status === 'active')
    : [];

  return (
    <CustomerLayout>
      {/* ── Item Customization Modal ──────────────────────────── */}
      <ItemModal
        open={!!selectedItem}
        onClose={() => setSelectedItem(null)}
        item={selectedItem}
        restaurant={restaurant}
        orderingDisabled={!canStartOrder}
        orderingDisabledMessage={
          !acceptingOrders
            ? 'This restaurant is not accepting orders right now.'
            : 'Ordering is unavailable while the restaurant is closed.'
        }
      />

      {/* ── Table Reservation Modal ───────────────────────────── */}
      <ReservationModal
        open={reservationOpen}
        onClose={() => setReservationOpen(false)}
        restaurant={restaurant}
        onSuccess={() => {}}
      />

      {/* ── Restaurant Hero Header ────────────────────────────── */}
      <header className="rdp-hero-card">
        <div className="rdp-hero-banner">
          <RestaurantImage
            image={restaurant.coverPhoto}
            alt={`${restaurant.name} cover photo`}
            fallback={restaurant.coverImage || getInitials(restaurant.name)}
            fallbackSrc={getHeroFallbackCover(restaurant)}
            className="rdp-hero-cover-img"
          />
          <div className="rdp-hero-scrim" aria-hidden="true" />
          <button
            type="button"
            onClick={() => {}}
            className={`rdp-hero-favorite${isFavorite ? ' is-favorite' : ''}`}
            aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
            disabled
            title="Favorites are not available yet"
          >
            {isFavorite ? '♥' : '♡'}
          </button>
        </div>

        {/* Info row */}
        <div className="rdp-hero-body">
          <div className="rdp-hero-main">
            <div className="rdp-hero-identity">
              <div className="rdp-hero-logo">
                {restaurant.logoImage ? (
                  <RestaurantImage
                    image={restaurant.logoImage}
                    alt={`${restaurant.name} logo`}
                    fallback={getInitials(restaurant.name)}
                  />
                ) : (
                  <span className="rdp-hero-logo-fallback">{getInitials(restaurant.name)}</span>
                )}
              </div>
              <div className="rdp-hero-text">
                <div className="rdp-hero-title-row">
                  <h1>{restaurant.name}</h1>
                  <Badge variant={restaurant.isOpen ? 'success' : 'default'} dot size="sm">
                    {restaurant.isOpen ? 'Open Now' : 'Closed'}
                  </Badge>
                </div>

                <p className="rdp-hero-cuisine">{restaurant.cuisine}</p>
                <p className="rdp-hero-desc">
                  {restaurant.description || restaurant.bio || restaurant.tagline}
                </p>

                <p className="rdp-hero-meta-line">
                  📍 {restaurant.address} · 🕒 {restaurant.operatingHours}
                </p>
                {(restaurant.contactEmail || restaurant.phone) && (
                  <p className="rdp-hero-meta-line">
                    {[restaurant.phone, restaurant.contactEmail].filter(Boolean).join(' · ')}
                  </p>
                )}
              </div>
            </div>

            {/* Quick Actions */}
            <div className="rdp-hero-actions">
              <Button
                variant="primary"
                size="md"
                disabled={!canStartOrder || (!offersDelivery && !offersPickup)}
                onClick={() => {
                  const menuEl = document.getElementById('restaurant-menu-section');
                  menuEl?.scrollIntoView({ behavior: 'smooth' });
                }}
              >
                {canStartOrder && (offersDelivery || offersPickup) ? 'Order Food' : 'Ordering unavailable'}
              </Button>

              <Button
                variant="outline"
                size="md"
                disabled={!acceptingReservations}
                onClick={() => setReservationOpen(true)}
              >
                {acceptingReservations ? 'Reserve a Table' : 'Reservations unavailable'}
              </Button>
            </div>
          </div>

          {!canStartOrder && (
            <p role="status" className="rdp-hero-notice">
              This restaurant is not accepting orders right now.
            </p>
          )}
          {!restaurant.isOpen && acceptingOrders && (
            <p role="status" className="rdp-hero-notice">
              Currently outside regular hours · Orders will be prepared upon opening.
            </p>
          )}
          {!acceptingReservations && (
            <p role="status" className="rdp-hero-notice">
              This restaurant is not accepting reservation requests right now.
            </p>
          )}

          <div className="rdp-hero-stats">
            {isFeaturedThisWeek && (
              <div className="rdp-hero-stat-pill">
                <span>Recognition</span>
                <strong>★ Featured Restaurant of the Week</strong>
              </div>
            )}
            {restaurant.rating != null && restaurant.reviewCount != null && (
              <div className="rdp-hero-stat-pill">
                <span>Rating</span>
                <strong>★ {restaurant.rating} ({restaurant.reviewCount} reviews)</strong>
              </div>
            )}
            <div className="rdp-hero-stat-pill">
              <span>Fulfillment</span>
              <strong>
                {[
                  restaurant.fulfillment?.delivery && 'Delivery',
                  restaurant.fulfillment?.pickup && 'Pickup',
                  restaurant.fulfillment?.dineIn && 'Dine-in',
                ].filter(Boolean).join(' · ') || 'Unavailable'}
              </strong>
            </div>
            {coverageText && (
              <div className="rdp-hero-stat-pill">
                <span>Delivery Area</span>
                <strong>{coverageText}</strong>
              </div>
            )}
          </div>

          {activePromos.length > 0 && (
            <div className="rdp-promo-strip" aria-label="Active restaurant promotions">
              {activePromos.map((promo) => (
                <div key={promo.id || promo.code} className="rdp-promo-chip">
                  <span className="rdp-promo-chip__badge">★ PROMO</span>
                  <strong>{promo.code || promo.title}</strong>
                  <span>{promo.description}</span>
                </div>
              ))}
            </div>
          )}

          {restaurant.foodCategories?.length > 0 && (
            <div className="rdp-hero-categories" aria-label="Food categories">
              {restaurant.foodCategories.map((category) => (
                <Badge key={category} variant="default" size="sm">{category}</Badge>
              ))}
            </div>
          )}
        </div>
      </header>

      {/* ── Restaurant gallery ───────────────────────────────── */}
      {restaurant.profilePhotos?.length > 0 && (
        <section style={{ marginBottom: 'var(--space-8)' }} aria-labelledby="restaurant-gallery-title">
          <h2 id="restaurant-gallery-title" className="section-title">Restaurant photos</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 'var(--space-3)' }}>
            {restaurant.profilePhotos.map((image, index) => (
              <RestaurantImage
                key={image.id || index}
                image={image}
                alt={image.alt || `${restaurant.name} photo ${index + 1}`}
                style={{ aspectRatio: '1 / 1', borderRadius: 'var(--radius-lg)' }}
              />
            ))}
          </div>
        </section>
      )}

      {/* ══════════════════════════════════════════════════════
          MENU SECTION
          ══════════════════════════════════════════════════════ */}
      <div id="restaurant-menu-section">

        {/* ── Search field ──────────────────────────────── */}
        <div className="rdp-search-wrap">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
          <input
            type="text"
            className="rdp-search-input"
            value={menuSearch}
            onChange={(e) => setMenuSearch(e.target.value)}
            placeholder="Search menu items…"
            aria-label="Search menu items"
          />
          {menuSearch && (
            <button
              type="button"
              className="rdp-search-clear"
              onClick={() => setMenuSearch('')}
              aria-label="Clear menu search"
            >
              ✕
            </button>
          )}
        </div>

        {/* ── Category tabs ─────────────────────────────── */}
        {!menuSearch && (
          <div className="rdp-tabs-bar" role="navigation" aria-label="Menu categories">
            {allTabs.map((tab) => (
              <button
                key={tab}
                type="button"
                className={`rdp-tab${activeTabId === tab ? ' rdp-tab--active' : ''}`}
                onClick={() => handleTabClick(tab)}
                aria-pressed={activeTabId === tab}
              >
                {tab}
              </button>
            ))}
          </div>
        )}

        {/* ── Two-column: menu grid + order panel ───────── */}
        <div className="rdp-two-col">

          {/* ── LEFT: menu card grid ──────────────────── */}
          <div className="rdp-menu-col">
            {filteredGroups.length === 0 ? (
              <p className="rdp-no-results">
                {menuSearch.trim()
                  ? `No items match "${menuSearch}". Try a different search.`
                  : 'No menu items are currently available for this restaurant.'}
              </p>
            ) : (
              filteredGroups.map((group) => (
                <section
                  key={group.name}
                  id={categoryToId(group.name)}
                  className="rdp-cat-section"
                  aria-label={group.name}
                >
                  {/* Category heading */}
                  <div className="rdp-cat-heading">
                    <span className="rdp-cat-label">{group.name}</span>
                    <span className="rdp-cat-count">{group.items.length}</span>
                    <hr className="rdp-cat-divider" aria-hidden="true" />
                  </div>

                  {/* Card grid */}
                  <div className="rdp-card-grid">
                    {group.items.map((item) => (
                      <MenuItemCard
                        key={item.id}
                        item={item}
                        restaurant={restaurant}
                        orderingDisabled={!canStartOrder}
                        onOpenModal={setSelectedItem}
                      />
                    ))}
                  </div>
                </section>
              ))
            )}
          </div>

          {/* ── RIGHT: sticky order panel (desktop only) ─ */}
          <div className="rdp-panel-col" aria-hidden="false">
            <OrderPanel
              restaurantId={restaurant.id}
              restaurantName={restaurant.name}
            />
          </div>

        </div>{/* /rdp-two-col */}

      </div>{/* /restaurant-menu-section */}

      {/* ══════════════════════════════════════════════════════
          REVIEWS & RATINGS SECTION (Mock UI Phase)
          ══════════════════════════════════════════════════════ */}
      <section style={{ marginTop: 'var(--space-8)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }} aria-labelledby="restaurant-reviews-title">
        <h2 id="restaurant-reviews-title" className="section-title" style={{ margin: 0 }}>
          Customer Reviews &amp; Ratings
        </h2>
        <RatingSummaryCard
          title={`${restaurant.name} Ratings`}
          subtitle="Verified customer reviews (mock preview data)"
          averageRating={mockRatingSummary.averageRating}
          totalCount={mockRatingSummary.totalCount}
          distribution={mockRatingSummary.distribution}
          dateRangeKey={reviewDateRange.key}
          onDateRangeChange={(key, days) => setReviewDateRange({ key, days })}
        />
        <ReviewList
          reviews={mockRatingSummary.eligibleReviews}
          starFilter={reviewStarFilter}
          onStarFilterChange={setReviewStarFilter}
          emptyTitle="No reviews match this filter"
          emptyDescription="Try selecting another star rating or date range."
        />
      </section>

      {/* ── Mobile floating bar + bottom sheet ───────────── */}
      <MobileOrderBar
        restaurantId={restaurant.id}
        restaurantName={restaurant.name}
      />

    </CustomerLayout>
  );
}
