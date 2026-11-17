import AdminLayout from '../../../layouts/AdminLayout';
import { PageHeader, StateView } from '../components';
import { useAdminPageSearch } from '../contexts/useAdminSearch';
import './AdminPages.css';

export default function AdminReservationsPage() {
  useAdminPageSearch({ disabled: true });
  return (
    <AdminLayout>
      <section className="admin-shell-page">
        <PageHeader title="Reservations" description="Platform-wide table reservation oversight." />
        <StateView
          state="empty"
          title="Admin reservations view is not available yet"
          description="Table reservation monitoring will appear here once the admin reservations API is connected."
        />
      </section>
    </AdminLayout>
  );
}
