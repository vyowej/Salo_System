import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import CustomerLayout from '../../../layouts/CustomerLayout';
import OwnerLayout from '../../../layouts/OwnerLayout';
import customerService from '../../../services/customerService';
import publicRestaurantService from '../../../services/publicRestaurantService';
import ownerService from '../../../services/ownerService';
import { useCart } from '../../../hooks/useCart';
import { BRANCH_BROWSE_COPY } from '../content/branchBrowseContent';
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
import reviewService from '../../../services/reviewService';
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

export default function RestaurantDetailPage({ previewMode = false }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const cart = useCart();
  const PageLayout = previewMode ? OwnerLayout : CustomerLayout;

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
  const [reviewsData, setReviewsData] = useState({
    rating_summary: { average_rating: null, total_count: 0, distribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 } },
    reviews: [],
    is_featured_this_week: false,
  });
  const [reviewsLoading, setReviewsLoading] = useState(false);

  // ── Data fetching ──────────────────────────────────────────
  const fetchRest = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotFound(false);
    try {
      const data = previewMode
        ? await ownerService.getRestaurantPreview(id)
        : await publicRestaurantService.getRestaurantWithMenu(id);
      if (!data) {
        setNotFound(true);
        setRestaurant(null);
      } else {
        setRestaurant(data);
        if (!previewMode) {
          customerService.fetchFavorites()
            .then((res) => setIsFavorite(res.favoriteIds.includes(String(data.id))))
            .catch(() => setIsFavorite(false));
        }
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
  }, [id, previewMode]);

  useEffect(() => {
    fetchRest();
  }, [fetchRest]);

  useEffect(() => {
    const syncFavoriteState = () => {
      if (!restaurant) return;
      customerService.fetchFavorites()
        .then((res) => setIsFavorite(res.favoriteIds.includes(String(restaurant.id))))
        .catch(() => {});
    };
    window.addEventListener('salo:favoritesUpdated', syncFavoriteState);
    return () => window.removeEventListener('salo:favoritesUpdated', syncFavoriteState);
  }, [restaurant]);

  const handleToggleFavorite = async () => {
    if (!restaurant) return;
    const next = !isFavorite;
    setIsFavorite(next);
    try {
      if (next) {
        await customerService.addFavorite(restaurant.id);
      } else {
        await customerService.removeFavorite(restaurant.id);
      }
      window.dispatchEvent(new Event('salo:favoritesUpdated'));
    } catch {
      setIsFavorite(!next);
    }
  };

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

  useEffect(() => {
    if (!restaurant?.id) return;
    let active = true;
    setReviewsLoading(true);
    reviewService.getRestaurantReviews(restaurant.id, {
      days: reviewDateRange.days,
      rating: reviewStarFilter,
      per_page: 20,
    })
      .then((data) => {
        if (active && data) {
          setReviewsData(data);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setReviewsLoading(false);
      });
    return () => { active = false; };
  }, [restaurant?.id, reviewDateRange.days, reviewStarFilter]);

  const isFeaturedThisWeek = Boolean(reviewsData?.is_featured_this_week);
  const ratingSummary = reviewsData?.rating_summary || {
    average_rating: null,
    total_count: 0,
    distribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
  };

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
      <PageLayout>
        <StateView state="loading" title="restaurant details" />
      </PageLayout>
    );
  }

  if (error) {
    return (
      <PageLayout>
        <StateView
          state="error"
          title="restaurant details"
          errorDescription={error}
          onRetry={fetchRest}
        />
      </PageLayout>
    );
  }

  if (notFound || !restaurant) {
    return (
      <PageLayout>
        <StateView
          state="empty"
          title="Restaurant not found"
          emptyTitle="Restaurant unavailable"
          emptyDescription="This restaurant does not exist or is currently not active."
          action={<Button variant="primary" size="sm" onClick={() => navigate(previewMode ? '/owner' : '/customer')}>Back</Button>}
        />
      </PageLayout>
    );
  }

  const activePromos = Array.isArray(restaurant.promotions)
    ? restaurant.promotions.filter((p) => p.status === 'active')
    : [];

  return (
    <PageLayout>
      {previewMode && (
        <div
          role="status"
          style={{
            marginBottom: 16,
            padding: '12px 16px',
            borderRadius: 10,
            border: '1px solid #f59e0b',
            background: '#fffbeb',
            color: '#92400e',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <strong style={{ display: 'block', fontSize: 14 }}>
              {restaurant.isPublished
                ? 'Preview – live customer view.'
                : 'Preview – not published yet. Customers cannot see this restaurant.'}
            </strong>
            <span style={{ fontSize: 12 }}>
              Ordering and table reservations are disabled in preview mode.
            </span>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate('/owner/menu')}>
            Back to Menu
          </Button>
        </div>
      )}

      {/* ── Item Customization Modal ──────────────────────────── */}
      <ItemModal
        open={!!selectedItem}
        onClose={() => setSelectedItem(null)}
        item={selectedItem}
        restaurant={restaurant}
        orderingDisabled={previewMode || !canStartOrder}
        orderingDisabledMessage={
          previewMode
            ? 'Ordering is disabled in preview mode.'
            : !acceptingOrders
            ? 'This restaurant is not accepting orders right now.'
            : 'Ordering is unavailable while the restaurant is closed.'
        }
      />

      {/* ── Table Reservation Modal ───────────────────────────── */}
      {!previewMode && (
        <ReservationModal
          open={reservationOpen}
          onClose={() => setReservationOpen(false)}
          restaurant={restaurant}
          onSuccess={() => {}}
        />
      )}

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
          {!previewMode && (
            <button
              type="button"
              onClick={handleToggleFavorite}
              className={`rdp-hero-favorite${isFavorite ? ' is-favorite' : ''}`}
              aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
              title={isFavorite ? 'Remove from favorites' : 'Save to favorites'}
            >
              {isFavorite ? '♥' : '♡'}
            </button>
          )}
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
                  <h1>{restaurant.displayName || restaurant.name}</h1>
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
                disabled={previewMode || !canStartOrder || (!offersDelivery && !offersPickup)}
                onClick={() => {
                  const menuEl = document.getElementById('restaurant-menu-section');
                  menuEl?.scrollIntoView({ behavior: 'smooth' });
                }}
              >
                {previewMode
                  ? 'Ordering disabled in preview'
                  : canStartOrder && (offersDelivery || offersPickup)
                  ? 'Order Food'
                  : 'Ordering unavailable'}
              </Button>

              <Button
                variant="outline"
                size="md"
                disabled={previewMode || !acceptingReservations}
                onClick={() => !previewMode && setReservationOpen(true)}
              >
                {previewMode
                  ? 'Reservations disabled in preview'
                  : acceptingReservations
                  ? 'Reserve a Table'
                  : 'Reservations unavailable'}
              </Button>
            </div>
          </div>

          {!canStartOrder && (
            <p role="status" className="rdp-hero-notice">
              This restaurant is not accepting orders right now.
            </p>
          )}

          {Array.isArray(restaurant.siblings) && restaurant.siblings.length > 0 && (
            <nav aria-label={BRANCH_BROWSE_COPY.switcherAriaLabel} className="rdp-branch-switcher">
              <div className="rdp-branch-switcher__current">
                <strong>{BRANCH_BROWSE_COPY.youAreViewingPrefix}</strong>{' '}
                {restaurant.branchName || restaurant.displayName || restaurant.name}
                {restaurant.shortAddress ? ` — ${restaurant.shortAddress}` : ''}
              </div>
              <div className="rdp-branch-switcher__links">
                <span className="rdp-branch-switcher__label">{BRANCH_BROWSE_COPY.otherBranchesLabel}</span>
                {restaurant.siblings.map((sib) => {
                  const sibOpen = Boolean(sib.availability?.is_open);
                  return (
                    <Link key={sib.id} to={`/customer/restaurants/${sib.id}`} className="rdp-branch-pill">
                      <strong>{sib.branchName || sib.displayName}</strong>
                      {sib.shortAddress && <span className="rdp-branch-pill__addr">· {sib.shortAddress}</span>}
                      <span className={`rdp-branch-pill__status ${sibOpen ? 'is-open' : 'is-closed'}`}>
                        {sibOpen ? BRANCH_BROWSE_COPY.openLabel : BRANCH_BROWSE_COPY.closedLabel}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </nav>
          )}

          {Array.isArray(restaurant.siblings)
            && restaurant.siblings.length > 0
            && (cart?.items || []).some((item) => restaurant.siblings.some((sib) => String(sib.id) === String(item.restaurantId))) && (
              <p role="status" className="rdp-sibling-cart-hint">
                {BRANCH_BROWSE_COPY.siblingCartHint}
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
            {previewMode ? (
              <div style={{ padding: 16, borderRadius: 12, border: '1px solid var(--border-primary)', background: 'var(--surface-primary)' }}>
                <strong style={{ display: 'block', marginBottom: 6 }}>Preview Mode</strong>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>
                  Customers will see the live order and reservation panel here once published.
                </p>
              </div>
            ) : (
              <OrderPanel
                restaurantId={restaurant.id}
                restaurantName={restaurant.displayName || restaurant.name}
              />
            )}
          </div>

        </div>{/* /rdp-two-col */}

      </div>{/* /restaurant-menu-section */}

      {/* ══════════════════════════════════════════════════════
          REVIEWS & RATINGS SECTION
          ══════════════════════════════════════════════════════ */}
      <section style={{ marginTop: 'var(--space-8)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }} aria-labelledby="restaurant-reviews-title">
        <h2 id="restaurant-reviews-title" className="section-title" style={{ margin: 0 }}>
          Customer Reviews &amp; Ratings
        </h2>
        <RatingSummaryCard
          title={`${restaurant.displayName || restaurant.name} Ratings`}
          subtitle={reviewsLoading ? 'Loading verified reviews…' : 'Based on verified, published customer reviews'}
          averageRating={ratingSummary.average_rating}
          totalCount={ratingSummary.total_count}
          distribution={ratingSummary.distribution}
          dateRangeKey={reviewDateRange.key}
          onDateRangeChange={(key, days) => setReviewDateRange({ key, days })}
        />
        <ReviewList
          reviews={reviewsData.reviews || []}
          starFilter={reviewStarFilter}
          onStarFilterChange={setReviewStarFilter}
          emptyTitle="No reviews match this filter"
          emptyDescription="Try selecting another star rating or date range."
        />
      </section>

      {/* ── Mobile floating bar + bottom sheet ───────────── */}
      {!previewMode && (
        <MobileOrderBar
          restaurantId={restaurant.id}
          restaurantName={restaurant.displayName || restaurant.name}
        />
      )}

    </PageLayout>
  );
}
