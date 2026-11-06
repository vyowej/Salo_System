import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import CustomerLayout from '../../../layouts/CustomerLayout';
import customerService from '../../../services/customerService';
import Button from '../../../components/common/Button';
import Badge from '../../../components/common/Badge';
import ItemModal from '../components/ItemModal';
import ReservationModal from '../components/ReservationModal';

export default function RestaurantDetailPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();

  const [restaurant, setRestaurant] = useState(null);
  const [activeCategory, setActiveCategory] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [reservationOpen, setReservationOpen] = useState(searchParams.get('tab') === 'reserve');
  const [isFavorite, setIsFavorite] = useState(false);

  useEffect(() => {
    async function fetchRest() {
      const data = await customerService.getRestaurantById(id);
      if (data) {
        setRestaurant(data);
        setActiveCategory(data.categories?.[0] || 'All');
        setIsFavorite(customerService.getFavoriteRestaurants().includes(data.id));
      }
    }
    fetchRest();
  }, [id]);

  useEffect(() => {
    const syncFavoriteState = () => {
      setIsFavorite(Boolean(restaurant && customerService.getFavoriteRestaurants().includes(restaurant.id)));
    };

    window.addEventListener('salo:favoritesUpdated', syncFavoriteState);
    return () => window.removeEventListener('salo:favoritesUpdated', syncFavoriteState);
  }, [restaurant]);

  if (!restaurant) {
    return (
      <CustomerLayout>
        <div style={{ padding: 'var(--space-16) 0', textAlign: 'center' }}>
          <p style={{ color: 'var(--text-muted)' }}>Loading restaurant details...</p>
        </div>
      </CustomerLayout>
    );
  }

  const filteredMenuItems = activeCategory
    ? restaurant.menu?.filter((item) => item.category === activeCategory)
    : restaurant.menu;

  return (
    <CustomerLayout>
      {/* ── Item Customization Modal ──────────────────────── */}
      <ItemModal
        open={!!selectedItem}
        onClose={() => setSelectedItem(null)}
        item={selectedItem}
        restaurant={restaurant}
      />

      {/* ── Table Reservation Modal ───────────────────────── */}
      <ReservationModal
        open={reservationOpen}
        onClose={() => setReservationOpen(false)}
        restaurant={restaurant}
        onSuccess={() => {}}
      />

      {/* ── Restaurant Hero Header ────────────────────────── */}
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
          <span>{restaurant.coverImage}</span>
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
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-1)' }}>
                <h1 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {restaurant.name}
                </h1>
                <Badge variant={restaurant.isOpen ? 'success' : 'default'} dot size="sm">
                  {restaurant.isOpen ? 'Open Now' : 'Closed'}
                </Badge>
              </div>

              <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', marginBottom: 'var(--space-2)' }}>
                {restaurant.tagline}
              </p>

              <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>
                📍 {restaurant.address} · 🕒 {restaurant.operatingHours}
              </p>
            </div>

            {/* Quick Actions */}
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <Button
                variant="primary"
                size="md"
                onClick={() => {
                  const menuEl = document.getElementById('restaurant-menu-section');
                  menuEl?.scrollIntoView({ behavior: 'smooth' });
                }}
              >
                Order Food
              </Button>

              <Button
                variant="secondary"
                size="md"
                onClick={() => setReservationOpen(true)}
              >
                Reserve a Table
              </Button>
            </div>
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
          </div>
        </div>
      </div>

      {/* ── Menu Section ──────────────────────────────────── */}
      <div id="restaurant-menu-section">
        {/* Category Tabs */}
        <div style={{
          display: 'flex',
          gap: 'var(--space-2)',
          overflowX: 'auto',
          paddingBottom: 'var(--space-3)',
          marginBottom: 'var(--space-6)',
          borderBottom: '1px solid var(--border-secondary)',
        }}>
          {restaurant.categories?.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setActiveCategory(cat)}
              style={{
                padding: 'var(--space-2) var(--space-4)',
                borderRadius: 'var(--radius-full)',
                border: activeCategory === cat ? '1px solid var(--accent)' : '1px solid var(--border-primary)',
                background: activeCategory === cat ? 'var(--accent)' : 'var(--surface-primary)',
                color: activeCategory === cat ? '#fff' : 'var(--text-primary)',
                fontSize: 'var(--font-size-xs)',
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Items List (Open food presentation, clean and uncrowded) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {filteredMenuItems?.map((item) => (
            <div
              key={item.id}
              onClick={() => item.isAvailable && setSelectedItem(item)}
              style={{
                background: 'var(--surface-primary)',
                border: '1px solid var(--border-primary)',
                borderRadius: 'var(--radius-lg)',
                padding: 'var(--space-5)',
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-5)',
                cursor: item.isAvailable ? 'pointer' : 'not-allowed',
                opacity: item.isAvailable ? 1 : 0.6,
                transition: 'border-color var(--transition-fast), transform var(--transition-fast)',
              }}
              onMouseEnter={(e) => {
                if (item.isAvailable) {
                  e.currentTarget.style.borderColor = 'var(--accent)';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                }
              }}
              onMouseLeave={(e) => {
                if (item.isAvailable) {
                  e.currentTarget.style.borderColor = 'var(--border-primary)';
                  e.currentTarget.style.transform = 'none';
                }
              }}
            >
              {/* Item Photo / Icon */}
              <div style={{
                width: 76,
                height: 76,
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-tertiary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 36,
                flexShrink: 0,
              }}>
                {item.image}
              </div>

              {/* Item Details */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 2 }}>
                  <h3 style={{ fontSize: 'var(--font-size-base)', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {item.name}
                  </h3>
                  {!item.isAvailable && (
                    <Badge variant="default" size="sm">Sold Out</Badge>
                  )}
                </div>

                <p style={{
                  fontSize: 'var(--font-size-xs)',
                  color: 'var(--text-secondary)',
                  lineHeight: 1.4,
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}>
                  {item.description}
                </p>

                <p style={{ fontSize: 'var(--font-size-sm)', fontWeight: 700, color: 'var(--accent)', marginTop: 4 }}>
                  ₱{item.price.toLocaleString()}
                </p>
              </div>

              {/* Add Button */}
              <div>
                <Button
                  variant={item.isAvailable ? 'outline' : 'secondary'}
                  size="sm"
                  disabled={!item.isAvailable}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (item.isAvailable) setSelectedItem(item);
                  }}
                >
                  {item.isAvailable ? '+ Add' : 'Sold Out'}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </CustomerLayout>
  );
}
