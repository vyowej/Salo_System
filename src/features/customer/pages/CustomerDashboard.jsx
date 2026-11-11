import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import CustomerLayout from '../../../layouts/CustomerLayout';
import { useAuth } from '../../../hooks/useAuth';
import customerService from '../../../services/customerService';
import Button from '../../../components/common/Button';
import Badge from '../../../components/common/Badge';
import RestaurantImage from '../components/RestaurantImage';
import './CustomerDashboard.css';

const CATEGORIES = [
  'All',
  'Filipino & Silog',
  'Grill & BBQ',
  'Burgers & Wings',
  'Pizza & Pasta',
  'Asian & Noodles',
  'Café & Bakery',
];

export default function CustomerDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

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
      setActiveOrders(ords.filter((o) => o.overallStatus !== 'Completed' && o.overallStatus !== 'Cancelled'));

      const resvs = customerService.getReservations();
      setUpcomingReservations(resvs.filter((r) => r.status === 'Confirmed'));
    }
    loadData();
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

  const getGreeting = () => {
    const hour = new Date().getHours();
    const name = user?.name ? user.name.split(' ')[0] : '';
    const nameSuffix = name ? `, ${name}` : '';
    if (hour < 12) return `Good morning${nameSuffix}! Ready to find something delicious?`;
    if (hour < 18) return `Good afternoon${nameSuffix}! Ready for a hearty meal?`;
    return `Good evening${nameSuffix}! Ready for dinner?`;
  };

  return (
    <CustomerLayout>
      {/* ── Welcome Greeting ── */}
      <div style={{ marginBottom: 'var(--space-8)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-1)' }}>
              <span className="fiesta-pill">Kain tayo!</span>
            </div>
            <h1 className="page-title" style={{ fontSize: 'var(--font-size-3xl)', marginTop: 'var(--space-1)' }}>
              {getGreeting()}
            </h1>
            <p className="page-subtitle">
              Discover restaurants and enjoy good food with the people you love. Order from multiple kitchens or book a table.
            </p>
          </div>

        </div>
      </div>

      {/* ── Active Order & Upcoming Reservation Quick Strips ── */}
      {(activeOrders.length > 0 || upcomingReservations.length > 0) && (
        <div className="customer-live-card-grid">
          {activeOrders[0] && (
            <article className="brand-card brand-card--orange brand-card--status customer-live-card">
              <div className="customer-live-card__heading">
                <span className="brand-card__label">
                  Active Order in Progress
                </span>
                <Badge variant="primary" dot size="sm">
                  {activeOrders[0].overallStatus}
                </Badge>
              </div>

              <p className="customer-live-card__title">
                Order #{activeOrders[0].id} ({activeOrders[0].subOrders?.length || 1} Restaurants)
              </p>
              <p className="customer-live-card__detail">
                {activeOrders[0].subOrders?.map(so => so.restaurantName).join(' + ')}
              </p>

              <Link to={`/customer/orders`} className="customer-live-card__action">
                <Button variant="outline" size="sm" fullWidth>
                  Track Live Delivery Status →
                </Button>
              </Link>
            </article>
          )}

          {upcomingReservations[0] && (
            <article className="brand-card brand-card--green brand-card--status customer-live-card">
              <div className="customer-live-card__heading">
                <span className="brand-card__label">
                  Confirmed Table Reservation
                </span>
                <Badge variant="success" dot size="sm">
                  {upcomingReservations[0].status}
                </Badge>
              </div>

              <p className="customer-live-card__title">
                {upcomingReservations[0].restaurantName}
              </p>
              <p className="customer-live-card__detail">
                📅 {upcomingReservations[0].date} at {upcomingReservations[0].time} · Table for {upcomingReservations[0].guests} guests
              </p>

              <Link to="/customer/reservations" className="customer-live-card__action">
                <Button variant="outline" size="sm" fullWidth>
                  View Reservation Details →
                </Button>
              </Link>
            </article>
          )}
        </div>
      )}

      {/* ── Categories Strip ─────────────────────────────── */}
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <div style={{ display: 'flex', gap: 'var(--space-2)', overflowX: 'auto', paddingBottom: 6 }}>
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              className={`category-chip ${activeCategory === cat ? 'active' : ''}`}
              onClick={() => setActiveCategory(cat)}
              style={{
                padding: '6px 14px',
                borderRadius: 'var(--radius-full)',
                border: activeCategory === cat ? '1px solid var(--accent)' : '1px solid var(--border-primary)',
                background: activeCategory === cat ? 'var(--accent)' : 'var(--surface-primary)',
                color: activeCategory === cat ? '#fff' : 'var(--text-primary)',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* ── Restaurant Listings Grid ───────────────────────── */}
      <div style={{ marginBottom: 'var(--space-12)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
          <div>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 2 }}>
              Gutom ka na ba?
            </span>
            <h2 className="section-title" style={{ margin: 0 }}>
              Explore Restaurants ({filteredRestaurants.length})
            </h2>
          </div>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>
            Order delivery or book a table in advance
          </span>
        </div>

        {filteredRestaurants.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 'var(--space-12) 0', color: 'var(--text-muted)' }}>
            <p>No restaurants match your search or filter.</p>
            <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setActiveCategory('All'); }}>
              Clear Search Filters
            </Button>
          </div>
        ) : (
          <div className="customer-restaurant-grid">
            {filteredRestaurants.map((rest) => (
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
                    fallback={rest.coverImage || rest.name?.[0] || 'R'}
                    className="customer-restaurant-card__image"
                  />
                  <button
                    type="button"
                    onClick={(event) => handleToggleFavorite(rest.id, event)}
                    aria-label={favoriteIds.includes(rest.id) ? 'Remove from favorites' : 'Add to favorites'}
                    className={`customer-restaurant-card__favorite${favoriteIds.includes(rest.id) ? ' is-favorite' : ''}`}
                  >
                    {favoriteIds.includes(rest.id) ? '♥' : '♡'}
                  </button>
                  <span className="customer-restaurant-card__rating">
                    ★ {rest.rating} ({rest.reviewCount})
                  </span>
                </div>

                {/* Details */}
                <div className="customer-restaurant-card__details">
                  <div className="customer-restaurant-card__title-row">
                    <h3>
                      {rest.name}
                    </h3>
                    <Badge variant={rest.isOpen ? 'success' : 'default'} size="sm" dot>
                      {rest.isOpen ? 'Open Now' : 'Closed'}
                    </Badge>
                  </div>

                  <p className="customer-restaurant-card__cuisine">
                    {rest.cuisine}
                  </p>

                  <div className="customer-restaurant-card__metadata">
                    <span>🕒 {rest.deliveryTime}</span>
                    <span>•</span>
                    <span>🛵 ₱{rest.deliveryFee} Fee</span>
                    <span>•</span>
                    <span>Min ₱{rest.minOrder}</span>
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
            ))}
          </div>
        )}
      </div>
    </CustomerLayout>
  );
}
