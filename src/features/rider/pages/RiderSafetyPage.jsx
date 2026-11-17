import { StateView as GlobalStateView } from '../../../components/feedback';
import PageHeader from '../components/PageHeader';

export default function RiderSafetyPage() {
  return (
    <div className="rider-page-shell">
      <PageHeader title="Safety & welfare" subtitle="Road safety guidelines and emergency contacts." eyebrow="Safety" />
      <GlobalStateView
        state="empty"
        title="Safety incident reporting is not available yet"
        description="Emergency SOS and welfare check-in tools will be enabled once the rider safety API is connected."
      />
    </div>
  );
}
