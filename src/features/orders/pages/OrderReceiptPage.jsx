import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import CustomerLayout from '../../../layouts/CustomerLayout';
import OwnerLayout from '../../../layouts/OwnerLayout';
import { StateView } from '../../../components/feedback';
import receiptService from '../../../services/receiptService';
import OrderReceiptView from '../components/OrderReceiptView';

export default function OrderReceiptPage({ role = 'customer' }) {
  const params = useParams();
  const orderId = params.orderId || params.id;
  const [receipt, setReceipt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        let data = null;
        if (role === 'restaurant') {
          data = await receiptService.getRestaurantReceipt(orderId);
        } else if (role === 'rider') {
          data = await receiptService.getRiderReceipt(orderId);
        } else {
          data = await receiptService.getCustomerReceipt(orderId);
        }
        if (active) setReceipt(data);
      } catch (err) {
        if (active) setError(err?.message || 'Unable to load receipt.');
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [orderId, role]);

  const backTo = role === 'restaurant'
    ? '/restaurant/orders'
    : role === 'rider'
      ? '/rider/history'
      : `/customer/orders/${orderId}`;
  const backLabel = role === 'restaurant'
    ? 'Back to Orders'
    : role === 'rider'
      ? 'Back to Delivery History'
      : 'Back to Order Details';

  const content = loading ? (
    <StateView variant="loading" title="Loading receipt..." />
  ) : error ? (
    <StateView variant="error" title="Receipt unavailable" description={error} />
  ) : (
    <OrderReceiptView receipt={receipt} backTo={backTo} backLabel={backLabel} />
  );

  if (role === 'restaurant') {
    return <OwnerLayout>{content}</OwnerLayout>;
  }
  if (role === 'rider') {
    return content;
  }
  return <CustomerLayout>{content}</CustomerLayout>;
}
