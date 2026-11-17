import AdminLayout from '../../../layouts/AdminLayout';
import { PageHeader, StateView } from '../components';
import { useAdminPageSearch } from '../contexts/useAdminSearch';
import './AdminPages.css';

export default function AdminFeesPage() {
  useAdminPageSearch({ disabled: true });
  return (
    <AdminLayout>
      <section className="admin-shell-page">
        <PageHeader title="Fees and commissions" description="Manage platform commission rates and delivery fee rules." />
        <StateView
          state="empty"
          title="Fees and commissions are not available yet"
          description="Commission rate configuration will appear here once the admin fees API is connected."
        />
      </section>
    </AdminLayout>
  );
}
