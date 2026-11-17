import OwnerLayout from '../../../layouts/OwnerLayout';
import { StateView } from '../../../components/feedback';

export default function TeamAndStaffPage() {
  return (
    <OwnerLayout>
      <div style={{ padding: 'var(--space-4) 0' }}>
        <StateView
          state="empty"
          title="Team and staff management is not available yet"
          description="Inviting staff members, managing role permissions, and co-owner memberships will be enabled once the team management API is connected."
        />
      </div>
    </OwnerLayout>
  );
}
