import { Link } from 'react-router-dom';
import './ActiveStatusStrip.css';

/**
 * ActiveStatusStrip
 *
 * Displayed right above the promo card on the Customer Dashboard:
 * - Always provides direct access to "Track My Order" even when there are no upcoming orders.
 * - If multiple orders were placed at the same time, routes to /customer/orders so the user
 *   can click "Track Order" on any specific order to open its live map view.
 * - If 1 active order exists, links directly to that order's live tracking map.
 * - If no upcoming orders exist, links directly to /customer/orders/track (Customer Map Tracker).
 */
export default function ActiveStatusStrip({ activeOrder, activeOrders = [], reservation }) {
  const upcomingCount = Array.isArray(activeOrders) ? activeOrders.length : activeOrder ? 1 : 0;
  const hasOrder = upcomingCount > 0 || Boolean(activeOrder);

  if (!hasOrder && !reservation) {
    return null;
  }

  const hasMultipleOrders = upcomingCount > 1;
  const singleCard = !(hasOrder && reservation);

  const trackHref = hasMultipleOrders
    ? '/customer/orders?tab=upcoming'
    : `/customer/orders/${activeOrder?.id}`;

  const orderTitle = hasMultipleOrders
    ? `${upcomingCount} active orders in progress`
    : 'Your order is on the way!';

  const orderSub = hasMultipleOrders
    ? 'Multiple orders placed · Click Track Order to view live map'
    : `Order #${activeOrder?.id} · ${activeOrder?.subOrders?.length ?? 1} ${
        (activeOrder?.subOrders?.length ?? 1) === 1 ? 'restaurant' : 'restaurants'
      }`;

  return (
    <div
      className={`status-strip${singleCard ? ' status-strip--single' : ''}`}
      role="status"
      aria-label="Live activity tracker"
    >
      {/* ── Track My Order card (shown only when user has an active order) ── */}
      {hasOrder && (
        <div className="status-card">
          <span className="status-card__icon status-card__icon--order" aria-hidden="true">
            🛵
          </span>

          <div className="status-card__body">
            <span className="status-card__title">{orderTitle}</span>
            <span className="status-card__sub">{orderSub}</span>
          </div>

          <Link
            to={trackHref}
            className="status-card__link status-card__link--order"
            aria-label="Track your order"
          >
            Track My Order&nbsp;→
          </Link>
        </div>
      )}

      {/* ── Reservation card ── */}
      {reservation && (
        <div className="status-card">
          <span className="status-card__icon status-card__icon--reservation" aria-hidden="true">
            📅
          </span>

          <div className="status-card__body">
            <span className="status-card__title">{reservation.restaurantName}</span>
            <span className="status-card__sub">
              {reservation.date}&nbsp;·&nbsp;{reservation.time}&nbsp;·&nbsp;{reservation.guests} guests
            </span>
          </div>

          <Link
            to="/customer/reservations"
            className="status-card__link status-card__link--reservation"
            aria-label="View your reservation"
          >
            View&nbsp;→
          </Link>
        </div>
      )}
    </div>
  );
}
