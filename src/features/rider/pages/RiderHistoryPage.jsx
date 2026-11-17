import { StateView as GlobalStateView } from '../../../components/feedback';
import PageHeader from '../components/PageHeader';

export default function RiderHistoryPage() {
  return (
    <div className="rider-page-shell">
      <PageHeader title="Delivery history" subtitle="Completed and past delivery records." eyebrow="History" />
      <GlobalStateView
        state="empty"
        title="No delivery history yet"
        description="Your completed deliveries and payout summaries will appear here once the rider history API is connected."
      />
    </div>
  );
}
