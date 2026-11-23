import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Badge from '../../../components/common/Badge';
import Button from '../../../components/common/Button';
import CustomerLayout from '../../../layouts/CustomerLayout';
import customerService from '../../../services/customerService';
import RestaurantImage from '../components/RestaurantImage';

export default function FavoritesPage() {
  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [removingId, setRemovingId] = useState(null);

  const loadFavorites = useCallback(async () => {
    setError('');
    try {
      const { favorites: list } = await customerService.fetchFavorites();
      setFavorites(list);
    } catch (err) {
      setError(err?.message || 'Unable to load favorite restaurants.');
      setFavorites([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFavorites();

    const handleFavoritesUpdated = () => {
      loadFavorites();
    };

    window.addEventListener('salo:favoritesUpdated', handleFavoritesUpdated);
    return () => window.removeEventListener('salo:favoritesUpdated', handleFavoritesUpdated);
  }, [loadFavorites]);

  const handleRemoveFavorite = async (restaurantId) => {
    if (removingId !== null) return;
    setRemovingId(restaurantId);
    setError('');
    try {
      await customerService.removeFavorite(restaurantId);
      setFavorites((prev) => prev.filter((item) => String(item.restaurantId) !== String(restaurantId)));
      window.dispatchEvent(new Event('salo:favoritesUpdated'));
    } catch (err) {
      setError(err?.message || 'Unable to remove restaurant from favorites.');
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <CustomerLayout>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 'var(--space-4)' }}>
        <Link to="/customer" style={{ textDecoration: 'none' }}>
          <Button variant="secondary" size="sm">Explore more</Button>
        </Link>
      </div>

      {error && (
        <div
          role="alert"
          style={{
            marginBottom: 'var(--space-4)',
            padding: 'var(--space-3) var(--space-4)',
            borderRadius: 'var(--radius-md)',
            background: 'var(--status-error-bg)',
            color: 'var(--status-error-text)',
            fontSize: 'var(--font-size-sm)',
          }}
        >
          {error}
        </div>
      )}

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
          {favorites.map((restaurant) => {
            const isRemoving = String(removingId) === String(restaurant.restaurantId);
            return (
              <div key={restaurant.id} style={{
                background: 'var(--surface-primary)',
                border: '1px solid var(--border-primary)',
                borderRadius: 'var(--radius-xl)',
                overflow: 'hidden',
                boxShadow: 'var(--shadow-sm)',
                opacity: restaurant.isAvailable ? 1 : 0.78,
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
                    fallback={restaurant.name?.[0] || 'R'}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                </div>

                <div style={{ padding: 'var(--space-4)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-2)', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <h3 style={{ margin: 0, fontSize: 'var(--font-size-lg)' }}>{restaurant.name}</h3>
                        {!restaurant.isAvailable && (
                          <Badge variant="neutral" size="sm">Unavailable</Badge>
                        )}
                      </div>
                      <p style={{ margin: 'var(--space-1) 0 0', color: 'var(--text-secondary)', fontSize: 'var(--font-size-xs)' }}>
                        {restaurant.cuisine}
                        {restaurant.cityName ? ` · ${restaurant.cityName}` : ''}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={isRemoving}
                      onClick={() => handleRemoveFavorite(restaurant.restaurantId)}
                    >
                      {isRemoving ? 'Removing...' : 'Remove'}
                    </Button>
                  </div>

                  <div style={{ marginTop: 'var(--space-4)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-2)' }}>
                    <span style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-xs)' }}>
                      {restaurant.rating ? `★ ${restaurant.rating}` : 'No ratings yet'}
                    </span>
                    {restaurant.isAvailable ? (
                      <Link to={`/customer/restaurants/${restaurant.restaurantId}`} style={{ textDecoration: 'none' }}>
                        <Button variant="primary" size="sm">View menu</Button>
                      </Link>
                    ) : (
                      <Button variant="outline" size="sm" disabled>
                        Currently unavailable
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </CustomerLayout>
  );
}
