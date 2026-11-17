import AdminLayout from '../../../layouts/AdminLayout';
import { PageHeader, StateView } from '../components';
import { useAdminPageSearch } from '../contexts/useAdminSearch';
import './AdminPages.css';

export default function AdminSectionPage({ title = 'Admin section', description = '' }) {
  useAdminPageSearch({ disabled: true });
  return (
    <AdminLayout>
      <section className="admin-shell-page">
        <PageHeader title={title} description={description} />
        <StateView
          state="empty"
          title="This section is not available yet"
          description="This admin module will be enabled once its backend API endpoints are connected."
        />
      </section>
    </AdminLayout>
  );
}
