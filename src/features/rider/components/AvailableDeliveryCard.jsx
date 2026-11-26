import Button from '../../../components/common/Button';
import {
  formatDeliveryAddress,
  formatPeso,
  formatPlacedAgo,
} from '../utils/deliveryFormatters';

export default function AvailableDeliveryCard({
  delivery,
  onAccept,
  accepting = false,
  disabled = false,
}) {
  const pickupText = formatDeliveryAddress(
    delivery.pickup_address || delivery.pickup_address_text,
    'Restaurant pickup',
  );
  const dropoffText = formatDeliveryAddress(
    delivery.dropoff_address || delivery.dropoff_address_text,
    'Customer address',
  );
  const itemCount = Number(delivery.item_count || 0);
  const isCod = delivery.payment_method === 'cod' && delivery.cod_amount != null;
  const hasDistance = delivery.distance_km != null && Number.isFinite(Number(delivery.distance_km));

  return (
    <article className="rider-available-card" data-order-id={delivery.order_id}>
      <div className="rider-available-card-head">
        <div>
          <h3 className="rider-available-restaurant">{delivery.restaurant_name || 'Restaurant'}</h3>
          <span className="rider-available-meta-line">
            {delivery.order_reference} · Placed {formatPlacedAgo(delivery.placed_at)}
          </span>
        </div>
        <div className="rider-available-fee-badge">
          <span>Delivery fee</span>
          <strong>{formatPeso(delivery.delivery_fee)}</strong>
        </div>
      </div>

      <dl className="rider-available-addresses">
        <div>
          <dt>Pickup</dt>
          <dd>{pickupText}</dd>
        </div>
        <div>
          <dt>Dropoff</dt>
          <dd>{dropoffText}</dd>
        </div>
      </dl>

      <div className="rider-available-stats">
        <span>{itemCount} {itemCount === 1 ? 'item' : 'items'}</span>
        <span>Order total: {formatPeso(delivery.order_total)}</span>
        {hasDistance && <span>{Number(delivery.distance_km).toFixed(1)} km</span>}
        {isCod && (
          <span className="rider-available-cod-pill">
            Collect COD: {formatPeso(delivery.cod_amount)}
          </span>
        )}
      </div>

      <div className="rider-available-actions">
        <Button
          type="button"
          variant="primary"
          size="sm"
          disabled={disabled || accepting}
          onClick={() => onAccept(delivery.order_id)}
        >
          {accepting ? 'Accepting...' : 'Accept delivery'}
        </Button>
      </div>
    </article>
  );
}
