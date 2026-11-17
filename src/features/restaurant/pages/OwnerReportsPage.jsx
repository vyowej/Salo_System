import OwnerLayout from '../../../layouts/OwnerLayout';
import { StateView } from '../../../components/feedback';

export default function OwnerReportsPage() {
  return (
    <OwnerLayout>
      <div style={{ padding: 'var(--space-4) 0' }}>
        <StateView
          state="empty"
          title="Reports and statistics are not available yet"
          description="Sales velocity, order analytics, and financial payout reports will appear here once the owner reporting API is connected."
        />
      </div>
    </OwnerLayout>
  );
}
