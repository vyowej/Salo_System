import { Link } from 'react-router-dom';
import AdminLayout from '../../../layouts/AdminLayout';
import Button from '../../../components/common/Button';
import { PageHeader, StateView } from '../components';
import { useAdminPageSearch } from '../contexts/useAdminSearch';
import './AdminPages.css';

export default function AdminOrderDetailPage() {
  useAdminPageSearch({ disabled: true });
  return (
    <AdminLayout>
      <section className="admin-shell-page">
        <PageHeader title="Order details" description="Inspect order breakdown and delivery timeline." />
        <StateView
          state="empty"
          title="Order details are not available yet"
          description="Order breakdown and dispute resolution will appear here once the admin orders API is connected."
          action={<Link to="/admin/orders"><Button variant="outline" size="sm">Back to orders</Button></Link>}
        />
      </section>
    </AdminLayout>
  );
}
