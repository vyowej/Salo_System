import AdminLayout from '../../../layouts/AdminLayout';
import { PageHeader, StateView } from '../components';
import { useAdminPageSearch } from '../contexts/useAdminSearch';
import './AdminPages.css';

export default function AdminDisputesPage() {
  useAdminPageSearch({ disabled: true });
  return (
    <AdminLayout>
      <section className="admin-shell-page">
        <PageHeader title="Disputes" description="Review order and reservation dispute cases." />
        <StateView
          state="empty"
          title="Dispute management is not available yet"
          description="Customer refund and dispute workflows will appear here once the admin disputes API is connected."
        />
      </section>
    </AdminLayout>
  );
}
