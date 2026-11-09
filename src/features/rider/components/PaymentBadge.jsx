import { paymentStatuses } from '../constants/statusConfig';
import './PaymentBadge.css';

export default function PaymentBadge({ status = 'paid' }) {
  const resolved = paymentStatuses.find((item) => item.key === status) || paymentStatuses[0];

  return (
    <span className={`rider-payment-badge rider-payment-badge--${status}`} role="status">
      <span aria-hidden="true">{resolved.icon}</span>
      <span>{resolved.label}</span>
    </span>
  );
}
