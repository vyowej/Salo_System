import AdminLayout from '../../../layouts/AdminLayout';
import { PageHeader, StateView } from '../components';
import { useAdminPageSearch } from '../contexts/useAdminSearch';
import './AdminPages.css';

export default function AdminReportsPage() {
  useAdminPageSearch({ disabled: true });
  return (
    <AdminLayout>
      <section className="admin-shell-page">
        <PageHeader title="Reports and analytics" description="Platform performance, revenue, and operational reports." />
        <StateView
          state="empty"
          title="Admin reports are not available yet"
          description="Exportable operational and financial reports will appear here once the admin reports API is connected."
        />
      </section>
    </AdminLayout>
  );
}
