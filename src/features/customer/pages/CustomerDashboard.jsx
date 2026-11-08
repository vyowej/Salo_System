import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import CustomerLayout from '../../../layouts/CustomerLayout';
import { useAuth } from '../../../hooks/useAuth';
import customerService from '../../../services/customerService';
import Button from '../../../components/common/Button';
import Badge from '../../../components/common/Badge';
import RestaurantImage from '../components/RestaurantImage';

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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 'var(--space-4)', marginBottom: 'var(--space-8)' }}>
          {activeOrders[0] && (
            <div style={{
              background: 'var(--surface-primary)',
              border: '1.5px solid var(--accent)',
              borderRadius: 'var(--radius-xl)',
              padding: 'var(--space-5)',
              boxShadow: 'var(--shadow-sm)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-2)' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Active Order in Progress
                </span>
                <Badge variant="primary" dot size="sm">
                  {activeOrders[0].overallStatus}
                </Badge>
              </div>

              <p style={{ fontWeight: 700, fontSize: 'var(--font-size-md)', marginBottom: 'var(--space-1)' }}>
                Order #{activeOrders[0].id} ({activeOrders[0].subOrders?.length || 1} Restaurants)
              </p>
              <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', marginBottom: 'var(--space-4)' }}>
                {activeOrders[0].subOrders?.map(so => so.restaurantName).join(' + ')}
              </p>

              <Link to={`/customer/orders`} style={{ textDecoration: 'none' }}>
                <Button variant="outline" size="sm" fullWidth>
                  Track Live Delivery Status →
                </Button>
              </Link>
            </div>
          )}

          {upcomingReservations[0] && (
            <div style={{
              background: 'var(--surface-primary)',
              border: '1px solid var(--border-primary)',
              borderRadius: 'var(--radius-xl)',
              padding: 'var(--space-5)',
              boxShadow: 'var(--shadow-sm)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-2)' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--status-success-text)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Confirmed Table Reservation
                </span>
                <Badge variant="success" dot size="sm">
                  {upcomingReservations[0].status}
                </Badge>
              </div>

              <p style={{ fontWeight: 700, fontSize: 'var(--font-size-md)', marginBottom: 'var(--space-1)' }}>
                {upcomingReservations[0].restaurantName}
              </p>
              <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', marginBottom: 'var(--space-4)' }}>
                📅 {upcomingReservations[0].date} at {upcomingReservations[0].time} · Table for {upcomingReservations[0].guests} guests
              </p>

              <Link to="/customer/reservations" style={{ textDecoration: 'none' }}>
                <Button variant="secondary" size="sm" fullWidth>
                  View Reservation Details →
                </Button>
              </Link>
            </div>
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 'var(--space-6)' }}>
            {filteredRestaurants.map((rest) => (
              <div
                key={rest.id}
                onClick={() => navigate(`/customer/restaurants/${rest.id}`)}
                style={{
                  background: 'var(--surface-primary)',
                  border: '1px solid var(--border-primary)',
                  borderRadius: 'var(--radius-xl)',
                  overflow: 'hidden',
                  cursor: 'pointer',
                  transition: 'transform var(--transition-fast), box-shadow var(--transition-fast), border-color var(--transition-fast)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = 'var(--shadow-md)';
                  e.currentTarget.style.borderColor = 'var(--accent)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'none';
                  e.currentTarget.style.boxShadow = 'none';
                  e.currentTarget.style.borderColor = 'var(--border-primary)';
                }}
              >
                {/* Visual Cover */}
                <div style={{
                  height: 140,
                  background: 'var(--bg-tertiary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 48,
                  position: 'relative',
                  borderBottom: '1px solid var(--border-secondary)',
                }}>
                  <RestaurantImage
                    image={rest.coverPhoto}
                    alt={`${rest.name} cover photo`}
                    fallback={rest.coverImage || rest.name?.[0] || 'R'}
                    style={{ position: 'absolute', inset: 0 }}
                  />
                  <button
                    type="button"
                    onClick={(event) => handleToggleFavorite(rest.id, event)}
                    aria-label={favoriteIds.includes(rest.id) ? 'Remove from favorites' : 'Add to favorites'}
                    style={{
                      position: 'absolute',
                      top: 10,
                      right: 10,
                      width: 32,
                      height: 32,
                      borderRadius: '50%',
                      border: '1px solid var(--border-primary)',
                      background: 'var(--surface-primary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      color: favoriteIds.includes(rest.id) ? 'var(--salo-error)' : 'var(--text-muted)',
                      fontSize: 16,
                      boxShadow: 'var(--shadow-xs)',
                      zIndex: 1,
                    }}
                  >
                    {favoriteIds.includes(rest.id) ? '♥' : '♡'}
                  </button>
                  <span style={{
                    position: 'absolute',
                    top: 10,
                    left: 10,
                    background: 'var(--surface-primary)',
                    padding: '2px 8px',
                    borderRadius: 'var(--radius-full)',
                    fontSize: 11,
                    fontWeight: 700,
                    boxShadow: 'var(--shadow-xs)'
                  }}>
                    ★ {rest.rating} ({rest.reviewCount})
                  </span>
                </div>

                {/* Details */}
                <div style={{ padding: 'var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <h3 style={{ fontSize: 'var(--font-size-md)', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {rest.name}
                    </h3>
                    <Badge variant={rest.isOpen ? 'success' : 'default'} size="sm" dot>
                      {rest.isOpen ? 'Open Now' : 'Closed'}
                    </Badge>
                  </div>

                  <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
                    {rest.cuisine}
                  </p>

                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-3)',
                    fontSize: '11px',
                    color: 'var(--text-muted)',
                    marginTop: 'var(--space-1)',
                  }}>
                    <span>🕒 {rest.deliveryTime}</span>
                    <span>•</span>
                    <span>🛵 ₱{rest.deliveryFee} Fee</span>
                    <span>•</span>
                    <span>Min ₱{rest.minOrder}</span>
                  </div>

                  {/* Dual Action Strip */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 'var(--space-2)',
                    marginTop: 'var(--space-3)',
                    paddingTop: 'var(--space-3)',
                    borderTop: '1px solid var(--border-secondary)',
                  }}>
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
              </div>
            ))}
          </div>
        )}
      </div>
    </CustomerLayout>
  );
}
