import OwnerLayout from '../../../layouts/OwnerLayout';
import { StateView } from '../../../components/feedback';

export default function OwnerActivityPage() {
  return (
    <OwnerLayout>
      <div style={{ padding: 'var(--space-4) 0' }}>
        <StateView
          state="empty"
          title="Activity logs are not available yet"
          description="Audit history for menu, order, reservation, and profile changes will appear here once the restaurant activity log API is connected."
        />
      </div>
    </OwnerLayout>
  );
}
