import OwnerLayout from '../../../layouts/OwnerLayout';
import { StateView } from '../../../components/feedback';

export default function OwnerPromotionsPage() {
  return (
    <OwnerLayout>
      <div style={{ padding: 'var(--space-4) 0' }}>
        <StateView
          state="empty"
          title="Promotions are not available yet"
          description="Creating and managing restaurant discounts and promotional campaigns will be enabled once the promotions backend API is connected."
        />
      </div>
    </OwnerLayout>
  );
}
