import AdminLayout from '../../../layouts/AdminLayout';
import { PageHeader, StateView } from '../components';
import { useAdminPageSearch } from '../contexts/useAdminSearch';
import './AdminPages.css';

export default function AdminContentPage() {
  useAdminPageSearch({ disabled: true });
  return (
    <AdminLayout>
      <section className="admin-shell-page">
        <PageHeader title="Content management" description="Manage platform announcements, banners, and help articles." />
        <StateView
          state="empty"
          title="Content management is not available yet"
          description="Banners, announcements, and CMS controls will appear here once the admin content API is connected."
        />
      </section>
    </AdminLayout>
  );
}
