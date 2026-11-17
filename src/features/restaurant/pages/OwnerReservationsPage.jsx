import OwnerLayout from '../../../layouts/OwnerLayout';
import { StateView } from '../../../components/feedback';

export default function OwnerReservationsPage() {
  return (
    <OwnerLayout>
      <div style={{ padding: 'var(--space-4) 0' }}>
        <StateView
          state="empty"
          title="Reservations management is not available yet"
          description="Incoming table bookings, availability calendars, and table assignments will appear here once the owner reservations API is connected."
        />
      </div>
    </OwnerLayout>
  );
}
