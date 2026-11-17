import { StateView as GlobalStateView } from '../../../components/feedback';
import PageHeader from '../components/PageHeader';

export default function RiderSchedulePage() {
  return (
    <div className="rider-page-shell">
      <PageHeader title="Shift schedule" subtitle="Assigned delivery shifts and availability." eyebrow="Schedule" />
      <GlobalStateView
        state="empty"
        title="Shift scheduling is not available yet"
        description="Assigned rider shifts and calendar schedules will appear here once the rider shifts API is connected."
      />
    </div>
  );
}
