import { StateView as GlobalStateView } from '../../../components/feedback';
import PageHeader from '../components/PageHeader';

export default function RiderNotificationsPage() {
  return (
    <div className="rider-page-shell">
      <PageHeader title="Notifications" subtitle="Dispatch alerts and account updates." eyebrow="Updates" />
      <GlobalStateView
        state="empty"
        title="No notifications yet"
        description="Delivery alerts and rider account updates will appear here once the rider notifications API is connected."
      />
    </div>
  );
}
