import { StateView as GlobalStateView } from '../../../components/feedback';
import PageHeader from '../components/PageHeader';

export default function RiderEarningsPage() {
  return (
    <div className="rider-page-shell">
      <PageHeader title="Earnings & COD" subtitle="Delivery payouts and Cash-on-Delivery remittance." eyebrow="Finance" />
      <GlobalStateView
        state="empty"
        title="Earnings and COD remittance are not available yet"
        description="Your delivery earnings, cash-on-hand balance, and remittance history will appear here once the rider finance API is connected."
      />
    </div>
  );
}
