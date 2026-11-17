import { Link } from 'react-router-dom';
import AdminLayout from '../../../layouts/AdminLayout';
import Button from '../../../components/common/Button';
import { PageHeader, StateView } from '../components';
import { useAdminPageSearch } from '../contexts/useAdminSearch';
import './AdminPages.css';

export default function AdminDashboard() {
  useAdminPageSearch({ disabled: true });

  return (
    <AdminLayout>
      <section className="admin-shell-page">
        <PageHeader
          title="Platform overview"
          description="Monitor applications, accounts, partners, service areas, and audit logs."
        />
        <StateView
          state="empty"
          title="Platform metrics are not available yet"
          description="Live GMV, order volume, and revenue analytics will appear here once the admin metrics API is connected. Use the navigation to manage Applications, Users, Restaurants, Riders, Service Areas, and Activity Logs."
          action={
            <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', justifyContent: 'center' }}>
              <Link to="/admin/applications"><Button variant="primary" size="sm">Review Applications</Button></Link>
              <Link to="/admin/accounts"><Button variant="outline" size="sm">Manage Users</Button></Link>
            </div>
          }
        />
      </section>
    </AdminLayout>
  );
}
