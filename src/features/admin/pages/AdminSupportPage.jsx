import AdminLayout from '../../../layouts/AdminLayout';
import { PageHeader, StateView } from '../components';
import { useAdminPageSearch } from '../contexts/useAdminSearch';
import './AdminPages.css';

export default function AdminSupportPage() {
  useAdminPageSearch({ disabled: true });
  return (
    <AdminLayout>
      <section className="admin-shell-page">
        <PageHeader title="Support and complaints" description="Customer, partner, and rider support tickets." />
        <StateView
          state="empty"
          title="Support ticket queue is not available yet"
          description="Incoming support cases and escalations will appear here once the admin support API is connected."
        />
      </section>
    </AdminLayout>
  );
}
