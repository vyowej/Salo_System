import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import CustomerLayout from '../../../layouts/CustomerLayout';
import customerService from '../../../services/customerService';
import Button from '../../../components/common/Button';
import RestaurantImage from '../components/RestaurantImage';

export default function FavoritesPage() {
  const [restaurants, setRestaurants] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadFavorites() {
      try {
        const allRestaurants = await customerService.getRestaurants();
        const favoriteIds = customerService.getFavoriteRestaurants();
        const savedFavorites = allRestaurants.filter((restaurant) => favoriteIds.includes(restaurant.id));
        setRestaurants(allRestaurants);
        setFavorites(savedFavorites);
      } catch {
        setFavorites([]);
        setRestaurants([]);
      } finally {
        setLoading(false);
      }
    }

    loadFavorites();

    const handleFavoritesUpdated = () => {
      loadFavorites();
    };

    window.addEventListener('salo:favoritesUpdated', handleFavoritesUpdated);
    return () => window.removeEventListener('salo:favoritesUpdated', handleFavoritesUpdated);
  }, []);

  const handleToggleFavorite = (restaurantId) => {
    const next = customerService.toggleFavoriteRestaurant(restaurantId);
    const nextFavorites = restaurants.filter((restaurant) => next.includes(restaurant.id));
    setFavorites(nextFavorites);
  };

  return (
    <CustomerLayout>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-6)', flexWrap: 'wrap' }}>
        <div>
          <p style={{ margin: 0, fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700 }}>
            Saved picks
          </p>
          <h1 style={{ margin: 'var(--space-2) 0 0', fontSize: 'var(--font-size-3xl)' }}>Your favorite restaurants</h1>
        </div>
        <Link to="/customer" style={{ textDecoration: 'none' }}>
          <Button variant="secondary" size="sm">Explore more</Button>
        </Link>
      </div>

      {loading ? (
        <div style={{ padding: 'var(--space-12) 0', textAlign: 'center', color: 'var(--text-muted)' }}>
          Loading favorites...
        </div>
      ) : favorites.length === 0 ? (
        <div style={{
          background: 'var(--surface-primary)',
          border: '1px solid var(--border-primary)',
          borderRadius: 'var(--radius-xl)',
          padding: 'var(--space-8)',
          textAlign: 'center',
          boxShadow: 'var(--shadow-sm)',
        }}>
          <p style={{ margin: 0, fontSize: 'var(--font-size-lg)', fontWeight: 700 }}>No favorites yet</p>
          <p style={{ margin: 'var(--space-2) 0 0', color: 'var(--text-secondary)' }}>
            Save restaurants you like to keep a quick shortlist for your next meal.
          </p>
          <Link to="/customer" style={{ textDecoration: 'none' }}>
            <Button variant="primary" size="md" style={{ marginTop: 'var(--space-4)' }}>
              Browse restaurants
            </Button>
          </Link>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 'var(--space-4)' }}>
          {favorites.map((restaurant) => (
            <div key={restaurant.id} style={{
              background: 'var(--surface-primary)',
              border: '1px solid var(--border-primary)',
              borderRadius: 'var(--radius-xl)',
              overflow: 'hidden',
              boxShadow: 'var(--shadow-sm)',
            }}>
              <div style={{
                height: 120,
                background: 'var(--bg-tertiary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 28,
                fontWeight: 700,
                letterSpacing: '0.08em',
                borderBottom: '1px solid var(--border-secondary)',
                color: 'var(--text-primary)',
              }}>
                <RestaurantImage
                  image={restaurant.coverPhoto}
                  alt={`${restaurant.name} cover photo`}
                  fallback={restaurant.coverImage || restaurant.name?.[0] || 'R'}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              </div>

              <div style={{ padding: 'var(--space-4)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-2)', alignItems: 'flex-start' }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 'var(--font-size-lg)' }}>{restaurant.name}</h3>
                    <p style={{ margin: 'var(--space-1) 0 0', color: 'var(--text-secondary)', fontSize: 'var(--font-size-xs)' }}>
                      {restaurant.cuisine}
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => handleToggleFavorite(restaurant.id)}>
                    Remove
                  </Button>
                </div>

                <div style={{ marginTop: 'var(--space-4)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-2)' }}>
                  <span style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-xs)' }}>
                    ★ {restaurant.rating} · {restaurant.deliveryTime}
                  </span>
                  <Link to={`/customer/restaurants/${restaurant.id}`} style={{ textDecoration: 'none' }}>
                    <Button variant="primary" size="sm">View menu</Button>
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </CustomerLayout>
  );
}
