import { StateView as GlobalStateView } from '../../../components/feedback';
import PageHeader from '../components/PageHeader';

export default function RiderActiveDeliveryPage() {
  return (
    <div className="rider-page-shell">
      <PageHeader title="Active delivery" subtitle="Step-by-step pickup and drop-off workflow." eyebrow="Dispatch" />
      <GlobalStateView
        state="empty"
        title="No active delivery"
        description="Active delivery tracking and proof-of-delivery upload will appear here once the delivery lifecycle API is connected."
      />
    </div>
  );
}
