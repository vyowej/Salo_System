import { StateView as GlobalStateView } from '../../../components/feedback';
import PageHeader from '../components/PageHeader';

export default function RiderMapPage() {
  return (
    <div className="rider-page-shell">
      <PageHeader title="Delivery map" subtitle="Route guidance and drop-off navigation." eyebrow="Navigation" />
      <GlobalStateView
        state="empty"
        title="No active route"
        description="Turn-by-turn route guidance will appear here when you have an active delivery assignment."
      />
    </div>
  );
}
