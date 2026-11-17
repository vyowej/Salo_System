import OwnerLayout from '../../../layouts/OwnerLayout';
import { StateView } from '../../../components/feedback';

export default function OwnerSettingsPage() {
  return (
    <OwnerLayout>
      <div style={{ padding: 'var(--space-4) 0' }}>
        <StateView
          state="empty"
          title="Restaurant settings are not available yet"
          description="Order, reservation, notification, and payout preferences will be configurable here once the owner settings API is connected."
        />
      </div>
    </OwnerLayout>
  );
}
