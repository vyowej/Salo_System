import OwnerLayout from '../../../layouts/OwnerLayout';
import { StateView } from '../../../components/feedback';

export default function OwnerTablesPage() {
  return (
    <OwnerLayout>
      <div style={{ padding: 'var(--space-4) 0' }}>
        <StateView
          state="empty"
          title="Table management is not available yet"
          description="Dining areas, floor tables, and seating capacity configuration will appear here once the owner tables API is connected."
        />
      </div>
    </OwnerLayout>
  );
}
