import { StateView as GlobalStateView } from '../../../components/feedback';
import PageHeader from '../components/PageHeader';

export default function RiderDeliveriesPage() {
  return (
    <div className="rider-page-shell">
      <PageHeader title="Delivery offers" subtitle="Incoming delivery requests and active assignments." eyebrow="Dispatch" />
      <GlobalStateView
        state="empty"
        title="Delivery dispatch is not available yet"
        description="Live delivery offers and job acceptance will appear here once the rider dispatch API is connected."
      />
    </div>
  );
}
