import { computePaymentSummaryModel, formatPesoAmount } from '../utils/paymentSummaryUtils';
import './ItemizedPaymentSummary.css';

export default function ItemizedPaymentSummary({
  subOrders = [],
  serverGroupTotals = {},
  appliedPromo = null,
  title = 'Payment Summary',
  grandTotalLabel = 'Grand Total',
  promoSlot = null,
  note = null,
  footerSlot = null,
}) {
  const model = computePaymentSummaryModel(subOrders, { serverGroupTotals, appliedPromo });

  return (
    <div className="salo-payment-summary">
      {title && <h2 className="salo-payment-summary-title">{title}</h2>}

      <div className="salo-payment-summary-groups">
        {model.groups.map((group) => (
          <section key={group.key} className="salo-payment-summary-group">
            <div className="salo-payment-summary-group-head">
              <strong>{group.restaurantName}</strong>
              <span className="salo-payment-summary-fulfillment">
                {group.isDelivery ? 'Delivery' : group.fulfillment === 'dine_in' ? 'Dine-in' : 'Pickup'}
              </span>
            </div>

            {group.isDelivery && group.deliveryAddressText && (
              <p className="salo-payment-summary-address">{group.deliveryAddressText}</p>
            )}

            <ul className="salo-payment-summary-items">
              {group.items.map((item) => (
                <li key={item.key} className="salo-payment-summary-item">
                  <span className="salo-payment-summary-item-label">
                    {item.name} × {item.quantity}
                    {item.addOnsLabel && (
                      <small className="salo-payment-summary-item-addons"> ({item.addOnsLabel})</small>
                    )}
                  </span>
                  <span className="salo-payment-summary-item-price">{formatPesoAmount(item.lineTotal)}</span>
                </li>
              ))}
            </ul>

            <div className="salo-payment-summary-group-totals">
              <div className="salo-payment-summary-row">
                <span>Food subtotal</span>
                <span>{formatPesoAmount(group.subtotal)}</span>
              </div>
              <div className="salo-payment-summary-row">
                <span>Delivery fee</span>
                <span>{group.isDelivery ? formatPesoAmount(group.deliveryFee) : 'No delivery fee'}</span>
              </div>
            </div>
          </section>
        ))}
      </div>

      {promoSlot}

      <div className="salo-payment-summary-totals">
        <div className="salo-payment-summary-row">
          <span>Food total</span>
          <span>{formatPesoAmount(model.foodTotal)}</span>
        </div>

        <div className="salo-payment-summary-row">
          <span>
            {model.deliveryGroupCount === 0
              ? 'Delivery fee'
              : model.deliveryGroupCount === 1
                ? 'Delivery fee'
                : 'Combined delivery fees'}
          </span>
          <span>
            {model.deliveryGroupCount === 0
              ? 'No delivery fee'
              : formatPesoAmount(model.combinedDeliveryFees)}
          </span>
        </div>

        {appliedPromo && model.promoDiscount > 0 && (
          <div className="salo-payment-summary-row is-discount">
            <span>Promo ({appliedPromo.promo_code})</span>
            <span>-{formatPesoAmount(model.promoDiscount)}</span>
          </div>
        )}

        <div className="salo-payment-summary-grand-total">
          <span>{grandTotalLabel}</span>
          <span className="salo-payment-summary-grand-amount">{formatPesoAmount(model.grandTotal)}</span>
        </div>
      </div>

      {note && <p className="salo-payment-summary-note">{note}</p>}
      {footerSlot}
    </div>
  );
}
