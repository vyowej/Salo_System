import { StateView as GlobalStateView } from '../../../components/feedback';
import PageHeader from '../components/PageHeader';

export default function RiderSupportPage() {
  return (
    <div className="rider-page-shell">
      <PageHeader title="Support & incidents" subtitle="Report delivery issues or contact rider support." eyebrow="Support" />
      <GlobalStateView
        state="empty"
        title="Rider support tickets are not available yet"
        description="Incident reporting and support ticket history will appear here once the rider support API is connected."
      />
    </div>
  );
}
