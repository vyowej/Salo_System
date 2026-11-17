import AdminLayout from '../../../layouts/AdminLayout';
import { PageHeader, StateView } from '../components';
import { useAdminPageSearch } from '../contexts/useAdminSearch';
import './AdminPages.css';

export default function AdminAdministratorsPage() {
  useAdminPageSearch({ disabled: true });
  return (
    <AdminLayout>
      <section className="admin-shell-page">
        <PageHeader title="Administrators" description="Manage platform administrator accounts and role permissions." />
        <StateView
          state="empty"
          title="Administrator directory is not available yet"
          description="Role-based administrator management will appear here once the admin roles API is connected."
        />
      </section>
    </AdminLayout>
  );
}
