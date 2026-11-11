import { useCallback } from 'react';
import { useCart } from '../../../hooks/useCart';
import { getMenuCustomerPrice } from '../../restaurant/menu/menuData';
import RestaurantImage from './RestaurantImage';
import './MenuItemCard.css';

/**
 * MenuItemCard
 *
 * Displays a single menu item as a photo-top card.
 * - Available item with no addOns → tapping + adds immediately.
 * - Available item with addOns  → tapping + calls onOpenModal.
 * - After item is in cart       → + button becomes −  qty  + stepper.
 * - Sold-out / unavailable      → greyed overlay, pill, button disabled.
 *
 * Props
 * ─────
 * @param {object}   item           - Normalised menu item (from normalizeMenuItem)
 * @param {object}   restaurant     - Restaurant object (id, name, deliveryFee)
 * @param {boolean}  orderingDisabled
 * @param {Function} onOpenModal    - Called with the item when addOns picker is needed
 */
export default function MenuItemCard({ item, restaurant, orderingDisabled, onOpenModal }) {
  const { items: cartItems, addItem, updateQuantity, removeItem } = useCart();

  // Find the cart entries matching this item (safe string comparison)
  const cartEntries = cartItems.filter(
    (ci) => String(ci.id) === String(item.id) && String(ci.restaurantId) === String(restaurant?.id)
  );
  const totalQtyInCart = cartEntries.reduce((acc, ci) => acc + ci.quantity, 0);

  const basePrice = getMenuCustomerPrice(item);
  const isSoldOut = item.availability !== 'available';

  // An item has required options if any available add-on group has minSelection > 0 or required === true
  const hasRequiredOptions = Array.isArray(item.addOns) && item.addOns.some(
    (g) => g.isAvailable !== false && (Boolean(g.required) || Number(g.minSelection || 0) > 0)
  );

  const initials = item.name
    ? item.name
        .split(/\s+/)
        .slice(0, 2)
        .map((w) => w[0])
        .join('')
        .toUpperCase()
    : '?';

  // ── Handlers ──────────────────────────────────────────────
  const handleAdd = useCallback(
    (e) => {
      e?.stopPropagation();
      if (isSoldOut || orderingDisabled) return;
      if (hasRequiredOptions) {
        onOpenModal(item);
      } else {
        addItem({
          id: item.id,
          name: item.name,
          price: basePrice,
          quantity: 1,
          selectedAddOns: [],
          restaurantId: restaurant.id,
          restaurantName: restaurant.name,
          deliveryFee: restaurant.deliveryFee,
          image: item.photo || item.image,
        });
      }
    },
    [isSoldOut, orderingDisabled, hasRequiredOptions, onOpenModal, item, addItem, basePrice, restaurant]
  );

  const handleIncrement = useCallback(
    (e) => {
      e.stopPropagation();
      if (hasRequiredOptions) {
        // For items with required variants, open the picker again to add another configuration
        onOpenModal(item);
      } else if (cartEntries.length > 0) {
        updateQuantity(cartEntries[0].cartItemId, cartEntries[0].quantity + 1);
      }
    },
    [hasRequiredOptions, onOpenModal, item, cartEntries, updateQuantity]
  );

  const handleDecrement = useCallback(
    (e) => {
      e.stopPropagation();
      if (cartEntries.length === 0) return;
      if (hasRequiredOptions && cartEntries.length > 1) {
        // Multiple add-on configurations: remove the last-added entry
        removeItem(cartEntries[cartEntries.length - 1].cartItemId);
      } else {
        // Single entry (with or without addOns): decrease its quantity
        // updateQuantity(id, 0) triggers removeItem internally in CartContext
        updateQuantity(cartEntries[0].cartItemId, cartEntries[0].quantity - 1);
      }
    },
    [hasRequiredOptions, cartEntries, removeItem, updateQuantity]
  );

  return (
    <article
      className={`mic-card${isSoldOut ? ' mic-card--soldout' : ''}`}
      aria-label={item.name}
      onClick={() => {
        if (isSoldOut) return;
        onOpenModal(item);
      }}
    >
      {/* ── Photo ─────────────────────────────────────── */}
      <div className="mic-photo-wrap">
        {item.photo ? (
          <RestaurantImage
            image={item.photo}
            alt={item.photo.alt || item.name}
            className="mic-photo-img"
          />
        ) : (
          <div className="mic-photo-placeholder" aria-hidden="true">
            {item.image || initials}
          </div>
        )}

        {/* Sold-out overlay */}
        {isSoldOut && (
          <div className="mic-soldout-overlay" aria-hidden="true">
            <span className="mic-soldout-pill">
              {item.availability === 'sold_out' ? 'Sold out' : 'Unavailable'}
            </span>
          </div>
        )}

        {/* Add button or Stepper */}
        {totalQtyInCart > 0 && !isSoldOut ? (
          <div className="mic-stepper" role="group" aria-label={`Quantity of ${item.name} in cart`}>
            <button
              type="button"
              className="mic-stepper-btn"
              onClick={handleDecrement}
              aria-label={`Decrease quantity of ${item.name}`}
            >
              −
            </button>
            <span className="mic-stepper-qty" aria-live="polite" aria-atomic="true">
              {totalQtyInCart}
            </span>
            <button
              type="button"
              className="mic-stepper-btn"
              onClick={handleIncrement}
              aria-label={`Increase quantity of ${item.name}`}
            >
              +
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="mic-add-btn"
            onClick={handleAdd}
            disabled={isSoldOut || orderingDisabled}
            aria-label={
              isSoldOut
                ? `${item.name} is unavailable`
                : `Add ${item.name} to order`
            }
          >
            +
          </button>
        )}
      </div>

      {/* ── Body ──────────────────────────────────────── */}
      <div className="mic-body">
        <div className="mic-name-row">
          <span className="mic-name">{item.name}</span>
          <span className="mic-price">
            {item.discountedPrice && (
              <span className="mic-price-original">
                ₱{Number(item.price).toLocaleString()}
              </span>
            )}
            ₱{basePrice.toLocaleString()}
          </span>
        </div>
        {item.description && (
          <p className="mic-desc">{item.description}</p>
        )}
      </div>
    </article>
  );
}
