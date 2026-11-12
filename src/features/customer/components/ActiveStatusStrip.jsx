import { Link } from 'react-router-dom';
import './ActiveStatusStrip.css';

/**
 * ActiveStatusStrip
 *
 * Two side-by-side cards: active delivery order + confirmed reservation.
 * Hides a card when that prop is null. Renders nothing when both are null.
 *
 * @param {{ id: string, overallStatus: string, subOrders: Array }} activeOrder
 * @param {{ restaurantName: string, date: string, time: string, guests: number }} reservation
 */
export default function ActiveStatusStrip({ activeOrder, reservation }) {
  if (!activeOrder && !reservation) return null;

  const single = !activeOrder || !reservation;

  return (
    <div
      className={`status-strip${single ? ' status-strip--single' : ''}`}
      role="status"
      aria-label="Live activity tracker"
    >
      {/* ── Active Order card ── */}
      {activeOrder && (
        <div className="status-card">
          {/* Delivery bike icon */}
          <span className="status-card__icon status-card__icon--order" aria-hidden="true">
            🛵
          </span>

          <div className="status-card__body">
            <span className="status-card__title">Your order is on the way!</span>
            <span className="status-card__sub">
              Order #{activeOrder.id}&nbsp;·&nbsp;
              {activeOrder.subOrders?.length ?? 1}&nbsp;
              {(activeOrder.subOrders?.length ?? 1) === 1 ? 'restaurant' : 'restaurants'}
            </span>
          </div>

          <Link
            to="/customer/orders"
            className="status-card__link status-card__link--order"
            aria-label="Track your active order"
          >
            Track&nbsp;→
          </Link>
        </div>
      )}

      {/* ── Reservation card ── */}
      {reservation && (
        <div className="status-card">
          {/* Calendar icon */}
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
