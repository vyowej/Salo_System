import AdminLayout from '../../../layouts/AdminLayout';
import { PageHeader, StateView } from '../components';
import { useAdminPageSearch } from '../contexts/useAdminSearch';
import './AdminPages.css';

export default function AdminDiscountsPage() {
  useAdminPageSearch({ disabled: true });
  return (
    <AdminLayout>
      <section className="admin-shell-page">
        <PageHeader title="Discounts and promotions" description="Manage platform-wide promo codes and campaigns." />
        <StateView
          state="empty"
          title="Discounts management is not available yet"
          description="Platform promo codes and campaign controls will appear here once the admin discounts API is connected."
        />
      </section>
    </AdminLayout>
  );
}
