import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import CustomerLayout from '../../../layouts/CustomerLayout';
import customerService from '../../../services/customerService';
import Button from '../../../components/common/Button';
import Badge from '../../../components/common/Badge';
import ItemModal from '../components/ItemModal';
import ReservationModal from '../components/ReservationModal';
import RestaurantImage from '../components/RestaurantImage';
import MenuItemCard from '../components/MenuItemCard';
import OrderPanel from '../components/OrderPanel';
import MobileOrderBar from '../components/MobileOrderBar';
import { useMenuSearch } from '../hooks/useMenuSearch';
import { useScrollSpy } from '../hooks/useScrollSpy';
import { normalizeMenuCategories, normalizeMenuItem } from '../../restaurant/menu/menuData';
import { getLocalDateKey } from '../../../services/demo/operatingHours';
import './RestaurantDetailPage.css';

/**
 * Builds a stable section element id for a category name.
 */
function categoryToId(cat) {
  return `rdp-cat-${cat.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
}

export default function RestaurantDetailPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();

  const [restaurant, setRestaurant] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [reservationOpen, setReservationOpen] = useState(searchParams.get('tab') === 'reserve');
  const [isFavorite, setIsFavorite] = useState(false);
  const [menuSearch, setMenuSearch] = useState('');
  // Which tab the user clicked most recently (overrides scroll-spy for a beat)
  const [manualActiveTab, setManualActiveTab] = useState(null);

  // ── Data fetching ──────────────────────────────────────────
  useEffect(() => {
    let active = true;
    async function fetchRest() {
      const data = await customerService.getRestaurantById(id);
      if (active && data) {
        const categories = normalizeMenuCategories(data).filter((category) => category.visible);
        const visibleCategoryNames = new Set(categories.map((category) => category.name));
        const menu = (data.menu || [])
          .map(normalizeMenuItem)
          .filter((item) => item.availability !== 'hidden' && visibleCategoryNames.has(item.category));
        setRestaurant({ ...data, categories: categories.map((category) => category.name), menu });
        setIsFavorite(customerService.getFavoriteRestaurants().includes(data.id));
      }
    }
    fetchRest();
    window.addEventListener('salo:demoStoreUpdated', fetchRest);
    return () => {
      active = false;
      window.removeEventListener('salo:demoStoreUpdated', fetchRest);
    };
  }, [id]);

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
  const upcomingClosures = (restaurant?.operatingSchedule?.temporaryClosures || [])
    .filter((closure) => closure.endDate >= getLocalDateKey());
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
  // Memoize so the array reference is stable across renders.
  const categories = useMemo(() => restaurant?.categories || [], [restaurant]);
  const allTabs = useMemo(() => ['All', ...categories], [categories]);

  /**
   * Sorted category groups: available items first, sold-out last.
   * Shape: [{ name, items: [...] }]
   */
  const categoryGroups = useMemo(() => {
    if (!restaurant?.menu) return [];
    return categories.map((cat) => {
      const all = restaurant.menu.filter((item) => item.category === cat);
      const available = all.filter((item) => item.availability === 'available');
      const unavailable = all.filter((item) => item.availability !== 'available');
      return { name: cat, items: [...available, ...unavailable] };
    });
  }, [restaurant, categories]);

  // Apply search filter using the shared hook, then re-group by category
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

  // Section ids for scroll-spy (All tabs excluded — scroll-spy tracks individual categories)
  const sectionIds = useMemo(() => categories.map(categoryToId), [categories]);
  const scrollSpyActiveId = useScrollSpy(sectionIds, { rootMargin: '-10% 0px -80% 0px' });

  // Active tab: manual click wins temporarily, scroll-spy otherwise
  const activeTabId = manualActiveTab
    ? manualActiveTab
    : scrollSpyActiveId
      ? categories.find((c) => categoryToId(c) === scrollSpyActiveId) ?? 'All'
      : 'All';

  // Clear manual override after 1.2s so scroll-spy takes over again
  useEffect(() => {
    if (!manualActiveTab) return;
    const t = setTimeout(() => setManualActiveTab(null), 1200);
    return () => clearTimeout(t);
  }, [manualActiveTab]);

  // Tab click handler
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

  // ── Loading state ──────────────────────────────────────────
  if (!restaurant) {
    return (
      <CustomerLayout>
        <div style={{ padding: 'var(--space-16) 0', textAlign: 'center' }}>
          <p style={{ color: 'var(--text-muted)' }}>Loading restaurant details...</p>
        </div>
      </CustomerLayout>
    );
  }

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
      <div style={{
        background: 'var(--surface-primary)',
        border: '1px solid var(--border-primary)',
        borderRadius: 'var(--radius-2xl)',
        overflow: 'hidden',
        marginBottom: 'var(--space-8)',
        boxShadow: 'var(--shadow-sm)',
      }}>
        {/* Cover visual banner */}
        <div style={{
          height: 180,
          background: 'var(--bg-tertiary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 64,
          borderBottom: '1px solid var(--border-secondary)',
          position: 'relative',
        }}>
          <RestaurantImage
            image={restaurant.coverPhoto}
            alt={`${restaurant.name} cover photo`}
            fallback={restaurant.coverImage || restaurant.name?.[0] || 'R'}
            style={{ position: 'absolute', inset: 0 }}
          />
          <button
            onClick={() => {
              if (!restaurant) return;
              const next = customerService.toggleFavoriteRestaurant(restaurant.id);
              setIsFavorite(next.includes(restaurant.id));
            }}
            style={{
              position: 'absolute',
              top: 16,
              right: 16,
              background: 'var(--surface-primary)',
              border: '1px solid var(--border-primary)',
              borderRadius: 'var(--radius-full)',
              width: 36,
              height: 36,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: isFavorite ? 'var(--salo-error)' : 'var(--text-muted)',
              fontSize: 16,
              boxShadow: 'var(--shadow-xs)',
            }}
            aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
          >
            {isFavorite ? '♥' : '♡'}
          </button>
        </div>

        {/* Info row */}
        <div style={{ padding: 'var(--space-6)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
              {restaurant.logoImage && (
                <RestaurantImage
                  image={restaurant.logoImage}
                  alt={`${restaurant.name} logo`}
                  style={{ width: 52, height: 52, borderRadius: 'var(--radius-lg)', flex: '0 0 52px' }}
                />
              )}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-1)', flexWrap: 'wrap' }}>
                  <h1 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {restaurant.name}
                  </h1>
                  <Badge variant={restaurant.isOpen ? 'success' : 'default'} dot size="sm">
                    {restaurant.isOpen ? 'Open Now' : 'Closed'}
                  </Badge>
                </div>

                <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', marginBottom: 'var(--space-2)' }}>
                  {restaurant.cuisine}
                </p>
                <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', marginBottom: 'var(--space-2)' }}>
                  {restaurant.description || restaurant.bio || restaurant.tagline}
                </p>

                <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>
                  📍 {restaurant.address} · 🕒 {restaurant.operatingHours}
                </p>
                {(restaurant.contactEmail || restaurant.phone) && (
                  <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>
                    {[restaurant.phone, restaurant.contactEmail].filter(Boolean).join(' · ')}
                  </p>
                )}
              </div>
            </div>

            {/* Quick Actions */}
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
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
                variant="secondary"
                size="md"
                disabled={!acceptingReservations}
                onClick={() => setReservationOpen(true)}
              >
                {acceptingReservations ? 'Reserve a Table' : 'Reservations unavailable'}
              </Button>
            </div>
            {!canStartOrder && (
              <p role="status" style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-xs)', margin: 'var(--space-2) 0 0' }}>
                This restaurant is not accepting orders right now.
              </p>
            )}
            {!restaurant.isOpen && acceptingOrders && (
              <p role="status" style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-xs)', margin: 'var(--space-2) 0 0' }}>
                Currently outside regular hours · Orders will be prepared upon opening.
              </p>
            )}
            {!acceptingReservations && (
              <p role="status" style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-xs)', margin: 'var(--space-2) 0 0' }}>
                This restaurant is not accepting reservation requests right now.
              </p>
            )}
          </div>

          <div style={{
            display: 'flex',
            gap: 'var(--space-6)',
            marginTop: 'var(--space-5)',
            paddingTop: 'var(--space-4)',
            borderTop: '1px solid var(--border-secondary)',
            fontSize: 'var(--font-size-xs)',
            color: 'var(--text-secondary)',
            flexWrap: 'wrap',
          }}>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Rating: </span>
              <strong>★ {restaurant.rating} ({restaurant.reviewCount} reviews)</strong>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Delivery Time: </span>
              <strong>{restaurant.deliveryTime}</strong>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Delivery Fee: </span>
              <strong>₱{restaurant.deliveryFee}</strong>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Min. Order: </span>
              <strong>₱{restaurant.minOrder}</strong>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Services: </span>
              <strong>{[
                offersDelivery && 'Delivery',
                offersPickup && 'Pickup',
              ].filter(Boolean).join(' · ') || 'Unavailable'}</strong>
            </div>
            {coverageText && (
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Delivery area: </span>
                <strong>{coverageText}</strong>
              </div>
            )}
          </div>
          {restaurant.foodCategories?.length > 0 && (
            <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', marginTop: 'var(--space-4)' }} aria-label="Food categories">
              {restaurant.foodCategories.map((category) => (
                <Badge key={category} variant="default" size="sm">{category}</Badge>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Hours & availability section ──────────────────────── */}
      <section
        aria-labelledby="restaurant-hours-title"
        style={{
          margin: '0 0 var(--space-8)',
          padding: 'var(--space-5)',
          border: '1px solid var(--border-primary)',
          borderRadius: 'var(--radius-xl)',
          background: 'var(--surface-primary)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
          <h2 id="restaurant-hours-title" className="section-title" style={{ margin: 0 }}>Hours and availability</h2>
          <Badge variant={restaurant.isOpen ? 'success' : 'default'} dot>{restaurant.isOpen ? 'Open now' : 'Closed now'}</Badge>
        </div>
        <ul style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 'var(--space-2) var(--space-4)', padding: 0, margin: 'var(--space-4) 0 0', listStyle: 'none' }}>
          {['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((day) => {
            const schedule = restaurant.operatingSchedule?.weeklySchedule?.[day];
            const label = `${day[0].toUpperCase()}${day.slice(1)}`;
            const periods = schedule?.periods || [];
            return (
              <li key={day} style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-2)', color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                <strong style={{ color: 'var(--text-primary)' }}>{label}</strong>
                <span>{schedule?.closed ? 'Closed' : periods.map((period) => `${period.open}–${period.close}`).join(', ') || 'Hours not set'}</span>
              </li>
            );
          })}
        </ul>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-4)', marginTop: 'var(--space-4)', color: 'var(--text-secondary)', fontSize: 'var(--font-size-xs)' }}>
          <span>Orders: <strong>{acceptingOrders ? 'Accepting' : 'Paused'}</strong></span>
          <span>Reservations: <strong>{acceptingReservations ? 'Accepting' : 'Paused'}</strong></span>
        </div>
        {upcomingClosures.length > 0 && (
          <div role="status" style={{ marginTop: 'var(--space-4)', padding: 'var(--space-3)', borderRadius: 'var(--radius-lg)', background: 'var(--status-warning-bg)', color: 'var(--status-warning-text)' }}>
            <strong>Temporary closure notice</strong>
            {upcomingClosures.map((closure) => (
              <p key={closure.id} style={{ margin: 'var(--space-1) 0 0', fontSize: 'var(--font-size-sm)' }}>
                {closure.type}: {closure.startDate}{closure.endDate !== closure.startDate ? ` – ${closure.endDate}` : ''} · {closure.reason}
              </p>
            ))}
          </div>
        )}
      </section>

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
          REDESIGNED MENU SECTION
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
                No items match "{menuSearch}". Try a different search.
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

      {/* ── Mobile floating bar + bottom sheet ───────────── */}
      <MobileOrderBar
        restaurantId={restaurant.id}
        restaurantName={restaurant.name}
      />

    </CustomerLayout>
  );
}
