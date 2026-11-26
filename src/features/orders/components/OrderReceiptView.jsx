import { Link } from 'react-router-dom';
import Button from '../../../components/common/Button';
import { formatPesoAmount } from '../../customer/utils/paymentSummaryUtils';
import './OrderReceiptView.css';

function formatManilaReceiptTime(iso) {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

function formatPaymentMethodLabel(method) {
  switch (String(method || '').toLowerCase()) {
    case 'cod':
    case 'cash':
      return 'Cash on Delivery (COD)';
    case 'e_wallet':
      return 'E-Wallet';
    case 'online_banking':
      return 'Online Banking';
    case 'card':
      return 'Card';
    default:
      return method ? String(method).toUpperCase() : '—';
  }
}

export default function OrderReceiptView({
  receipt,
  backTo,
  backLabel = 'Back',
}) {
  if (!receipt) return null;

  const isDelivery = receipt.order_type === 'delivery';
  const isRider = receipt.role === 'rider';
  const isRestaurant = receipt.role === 'restaurant';
  const isCustomer = receipt.role === 'customer';
  const items = Array.isArray(receipt.items) ? receipt.items : [];
  const siblings = Array.isArray(receipt.sibling_orders) ? receipt.sibling_orders : [];

  return (
    <div className="salo-receipt-page">
      <div className="salo-receipt-toolbar salo-receipt-no-print">
        {backTo && (
          <Link to={backTo} style={{ textDecoration: 'none' }}>
            <Button type="button" variant="secondary" size="sm">
              ← {backLabel}
            </Button>
          </Link>
        )}
        <Button type="button" variant="primary" size="sm" onClick={() => window.print()}>
          Print receipt
        </Button>
      </div>

      <article className="salo-receipt-sheet" aria-label={`Receipt ${receipt.receipt_number}`}>
        <header className="salo-receipt-header">
          <div>
            <span className="salo-receipt-brand">SALO</span>
            <h1 className="salo-receipt-title">
              {isRider ? 'Delivery Receipt' : isRestaurant ? 'Order Receipt' : 'Official Order Summary'}
            </h1>
          </div>
          <div className="salo-receipt-ref-block">
            <div><strong>{receipt.receipt_number}</strong></div>
            <div>Order: {receipt.order_reference}</div>
          </div>
        </header>

        <dl className="salo-receipt-meta">
          <div>
            <dt>Restaurant</dt>
            <dd>{receipt.restaurant_name}</dd>
          </div>
          <div>
            <dt>Order type</dt>
            <dd>{isDelivery ? 'Delivery' : receipt.order_type === 'dine_in' ? 'Dine-in' : 'Pickup'}</dd>
          </div>
          <div>
            <dt>Placed (Manila)</dt>
            <dd>{formatManilaReceiptTime(receipt.placed_at)}</dd>
          </div>
          <div>
            <dt>{isDelivery ? 'Delivered (Manila)' : 'Completed (Manila)'}</dt>
            <dd>{formatManilaReceiptTime(receipt.finalized_at)}</dd>
          </div>

          {isCustomer && isDelivery && receipt.delivery_address_text && (
            <div className="salo-receipt-meta-wide">
              <dt>Delivery address</dt>
              <dd>{receipt.delivery_address_text}</dd>
            </div>
          )}

          {isCustomer && isDelivery && receipt.rider_first_name && (
            <div>
              <dt>Rider</dt>
              <dd>{receipt.rider_first_name}</dd>
            </div>
          )}

          {isRestaurant && receipt.customer_name && (
            <div>
              <dt>Customer</dt>
              <dd>{receipt.customer_name}</dd>
            </div>
          )}

          {isRider && (
            <>
              <div className="salo-receipt-meta-wide">
                <dt>Pickup address</dt>
                <dd>{receipt.pickup_address_text}</dd>
              </div>
              <div className="salo-receipt-meta-wide">
                <dt>Drop-off address</dt>
                <dd>{receipt.dropoff_address_text}</dd>
              </div>
            </>
          )}
        </dl>

        {!isRider && items.length > 0 && (
          <section className="salo-receipt-items-section" aria-label="Items">
            <h2>Items</h2>
            <table className="salo-receipt-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th className="is-right">Qty</th>
                  <th className="is-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.order_item_id}>
                    <td>
                      <div className="salo-receipt-item-name">{item.item_name}</div>
                      {Array.isArray(item.add_ons) && item.add_ons.length > 0 && (
                        <div className="salo-receipt-item-addons">
                          {item.add_ons.map((ao) => ao.option_name).filter(Boolean).join(', ')}
                        </div>
                      )}
                    </td>
                    <td className="is-right">{item.quantity}</td>
                    <td className="is-right">{formatPesoAmount(item.line_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        <section className="salo-receipt-totals" aria-label="Totals and payment">
          {!isRider && (
            <div className="salo-receipt-total-row">
              <span>Food subtotal</span>
              <span>{formatPesoAmount(receipt.subtotal_amount)}</span>
            </div>
          )}
          <div className="salo-receipt-total-row">
            <span>Delivery fee</span>
            <span>{isDelivery ? formatPesoAmount(receipt.delivery_fee) : 'No delivery fee'}</span>
          </div>
          <div className="salo-receipt-total-row is-grand">
            <span>{isRider ? 'Order total' : 'Grand total'}</span>
            <span>{formatPesoAmount(receipt.total_amount)}</span>
          </div>

          <div className="salo-receipt-payment-box">
            <div className="salo-receipt-total-row">
              <span>Payment method</span>
              <span>{formatPaymentMethodLabel(receipt.payment_method)}</span>
            </div>
            <div className="salo-receipt-total-row">
              <span>Payment status</span>
              <span>{receipt.payment_status_label || receipt.payment_status}</span>
            </div>
            {isRider && receipt.payment_method === 'cod' && receipt.cod_amount_collected != null && (
              <div className="salo-receipt-total-row">
                <span>COD collected</span>
                <span>{formatPesoAmount(receipt.cod_amount_collected)}</span>
              </div>
            )}
            {(isRider || isRestaurant) && receipt.cod_remittance_status && (
              <div className="salo-receipt-total-row">
                <span>COD remittance</span>
                <span>{receipt.cod_remittance_status}</span>
              </div>
            )}
          </div>
        </section>

        {isCustomer && siblings.length > 0 && (
          <section className="salo-receipt-siblings salo-receipt-no-print" aria-label="Other orders in this checkout">
            <h2>Other orders from this checkout</h2>
            <ul>
              {siblings.map((sib) => (
                <li key={sib.order_id}>
                  <span>{sib.restaurant_name} ({sib.order_reference})</span>
                  {sib.has_receipt ? (
                    <Link to={`/customer/orders/${sib.order_id}/receipt`}>View receipt</Link>
                  ) : (
                    <Link to={`/customer/orders/${sib.order_id}`}>Status: {sib.order_status}</Link>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
      </article>
    </div>
  );
}
