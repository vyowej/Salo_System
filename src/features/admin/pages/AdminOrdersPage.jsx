import AdminLayout from '../../../layouts/AdminLayout';
import { PageHeader, StateView } from '../components';
import { useAdminPageSearch } from '../contexts/useAdminSearch';
import './AdminPages.css';

export default function AdminOrdersPage() {
  useAdminPageSearch({ disabled: true });
  return (
    <AdminLayout>
      <section className="admin-shell-page">
        <PageHeader title="Orders" description="Monitor multi-kitchen orders and delivery status." />
        <StateView
          state="empty"
          title="Admin orders view is not available yet"
          description="Platform-wide order monitoring will appear here once the admin orders API is connected."
        />
      </section>
    </AdminLayout>
  );
}
