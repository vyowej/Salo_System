import { useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../../../hooks/useCart';
import RestaurantImage from './RestaurantImage';
import './OrderPanel.css';

/**
 * OrderPanel
 *
 * "Your Order" sticky side panel.  Reads from the shared CartContext — no new
 * state, no duplicate cart.  Groups items under their restaurant heading.
 * The restaurant currently being browsed is shown first and labelled "Ordering now".
 *
 * Props
 * ─────
 * @param {string} restaurantId    - The restaurant the customer is currently viewing
 * @param {string} restaurantName  - Display name of the current restaurant
 */
export default function OrderPanel({ restaurantId }) {
  const navigate = useNavigate();
  const {
    restaurantGroups,
    totalItemCount,
    itemsSubtotal,
    totalDeliveryFees,
    grandTotal,
    updateQuantity,
    removeItem,
    clearCart,
  } = useCart();

  const [confirmClear, setConfirmClear] = useState(false);

  // aria-live announcement text
  const [announcement, setAnnouncement] = useState('');
  const announceTimer = useRef(null);

  const announce = (text) => {
    clearTimeout(announceTimer.current);
    setAnnouncement(text);
    announceTimer.current = setTimeout(() => setAnnouncement(''), 1500);
  };

  // ── Handlers ──────────────────────────────────────────────
  const handleUpdateQty = (cartItemId, newQty, itemName) => {
    updateQuantity(cartItemId, newQty);
    if (newQty > 0) {
      announce(`${itemName} quantity updated to ${newQty}`);
    } else {
      announce(`${itemName} removed from order`);
    }
  };

  const handleRemove = (cartItemId, itemName) => {
    removeItem(cartItemId);
    announce(`${itemName} removed from order`);
  };

  const handleClearConfirm = () => {
    clearCart();
    setConfirmClear(false);
    announce('All items cleared from order');
  };

  // ── Sort groups: current restaurant first ─────────────────
  const sortedGroups = [...restaurantGroups].sort((a, b) => {
    if (String(a.restaurantId) === String(restaurantId)) return -1;
    if (String(b.restaurantId) === String(restaurantId)) return 1;
    return 0;
  });

  // Determine whether delivery fee is known for the current restaurant group
  const currentGroup = restaurantGroups.find((g) => String(g.restaurantId) === String(restaurantId));
  const deliveryFeeKnown =
    currentGroup?.fulfillment === 'pickup' ||
    (currentGroup?.fulfillment === 'delivery' && currentGroup?.deliveryAddress != null);

  const isEmpty = totalItemCount === 0;

  return (
    <aside className="op-panel" aria-label="Your order">
      {/* aria-live region for quantity change announcements */}
      <div className="op-live-region" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>

      {/* ── Header ────────────────────────────────────── */}
      <div className="op-header">
        <div className="op-title-row">
          <h2 className="op-title">Your Order</h2>
          {totalItemCount > 0 && (
            <span className="op-count-badge" aria-label={`${totalItemCount} items in order`}>
              {totalItemCount}
            </span>
          )}
        </div>
        {!isEmpty && !confirmClear && (
          <button
            type="button"
            className="op-clear-btn"
            onClick={() => setConfirmClear(true)}
            aria-label="Clear all items from order"
          >
            Clear all
          </button>
        )}
      </div>

      {/* ── Scrollable body ───────────────────────────── */}
      <div className="op-body">
        {/* Confirm clear inline */}
        {confirmClear && (
          <div className="op-confirm-clear" role="alert">
            <p className="op-confirm-clear-text">Remove all items from your order?</p>
            <div className="op-confirm-clear-actions">
              <button
                type="button"
                className="op-confirm-clear-yes"
                onClick={handleClearConfirm}
                autoFocus
              >
                Yes, clear
              </button>
              <button
                type="button"
                className="op-confirm-clear-no"
                onClick={() => setConfirmClear(false)}
              >
                Keep items
              </button>
            </div>
          </div>
        )}

        {isEmpty ? (
          <div className="op-empty" role="status">
            <span className="op-empty-icon" aria-hidden="true">🛒</span>
            <p className="op-empty-title">Your order is empty</p>
            <p className="op-empty-hint">Tap + on an item to add it to your order.</p>
          </div>
        ) : (
          sortedGroups.map((group) => (
            <div key={group.restaurantId} className="op-restaurant-group">
              {/* Restaurant heading */}
              <div className="op-restaurant-heading">
                <span className="op-restaurant-name" title={group.restaurantName}>
                  {group.restaurantName}
                </span>
                {String(group.restaurantId) === String(restaurantId) && (
                  <span className="op-ordering-now-label" aria-label="Currently ordering from this restaurant">
                    Ordering now
                  </span>
                )}
              </div>

              {/* Line items */}
              {group.items.map((lineItem) => (
                <OrderLineItem
                  key={lineItem.cartItemId}
                  lineItem={lineItem}
                  onUpdateQty={handleUpdateQty}
                  onRemove={handleRemove}
                />
              ))}
            </div>
          ))
        )}
      </div>

      {/* ── Footer: summary + buttons ─────────────────── */}
      <div className="op-footer">
        {!isEmpty && (
          <>
            <div className="op-summary-row">
              <span className="op-summary-label">Subtotal</span>
              <span className="op-summary-value">₱{itemsSubtotal.toLocaleString()}</span>
            </div>

            <div className="op-summary-row">
              <span className="op-summary-label">Delivery fee</span>
              {deliveryFeeKnown ? (
                <span className="op-summary-value">
                  {totalDeliveryFees === 0
                    ? 'Free (Pickup)'
                    : `₱${totalDeliveryFees.toLocaleString()}`}
                </span>
              ) : (
                <span className="op-summary-value op-summary-value--muted">
                  Calculated at checkout
                </span>
              )}
            </div>

            <hr className="op-total-divider" aria-hidden="true" />

            <div className="op-total-row">
              <span className="op-total-label">Total</span>
              <span className="op-total-value">
                {deliveryFeeKnown
                  ? `₱${grandTotal.toLocaleString()}`
                  : `₱${itemsSubtotal.toLocaleString()}+`}
              </span>
            </div>
          </>
        )}

        <button
          type="button"
          className="op-checkout-btn"
          disabled={isEmpty}
          onClick={() => navigate('/customer/cart')}
          aria-disabled={isEmpty}
        >
          {isEmpty ? 'Add items to checkout' : 'Checkout'}
        </button>

        <Link to="/customer/cart" className="op-viewcart-link">
          View full cart
        </Link>
      </div>
    </aside>
  );
}

/* ─────────────────────────────────────────────────────────────
   OrderLineItem — a single cart line inside the panel
   ───────────────────────────────────────────────────────────── */
function OrderLineItem({ lineItem, onUpdateQty, onRemove }) {
  const addOnsText = lineItem.selectedAddOns?.length
    ? lineItem.selectedAddOns.map((a) => a.name).join(', ')
    : null;

  return (
    <div className="op-line">
      {/* Thumbnail */}
      <div className="op-line-thumb">
        {lineItem.image ? (
          <RestaurantImage
            image={lineItem.image}
            alt={`${lineItem.name} thumbnail`}
            fallback={typeof lineItem.image === 'string' ? lineItem.image : '🍽️'}
          />
        ) : (
          <span aria-hidden="true">🍽️</span>
        )}
      </div>

      {/* Info */}
      <div className="op-line-info">
        <span className="op-line-name" title={lineItem.name}>{lineItem.name}</span>
        {addOnsText && (
          <span className="op-line-addons" title={addOnsText}>{addOnsText}</span>
        )}
        <span className="op-line-price">₱{lineItem.itemTotal.toLocaleString()}</span>
      </div>

      {/* Controls */}
      <div className="op-line-controls">
        <div className="op-stepper" role="group" aria-label={`Quantity of ${lineItem.name}`}>
          <button
            type="button"
            className="op-stepper-btn"
            onClick={() => onUpdateQty(lineItem.cartItemId, lineItem.quantity - 1, lineItem.name)}
            aria-label={`Decrease quantity of ${lineItem.name}`}
          >
            −
          </button>
          <span className="op-stepper-qty" aria-live="polite" aria-atomic="true">
            {lineItem.quantity}
          </span>
          <button
            type="button"
            className="op-stepper-btn"
            onClick={() => onUpdateQty(lineItem.cartItemId, lineItem.quantity + 1, lineItem.name)}
            aria-label={`Increase quantity of ${lineItem.name}`}
          >
            +
          </button>
        </div>

        <button
          type="button"
          className="op-remove-btn"
          onClick={() => onRemove(lineItem.cartItemId, lineItem.name)}
          aria-label={`Remove ${lineItem.name} from order`}
          title={`Remove ${lineItem.name}`}
        >
          ✕
        </button>
      </div>
    </div>
  );
}
