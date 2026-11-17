import AdminLayout from '../../../layouts/AdminLayout';
import { PageHeader, StateView } from '../components';
import { useAdminPageSearch } from '../contexts/useAdminSearch';
import './AdminPages.css';

export default function AdminFinancePage() {
  useAdminPageSearch({ disabled: true });
  return (
    <AdminLayout>
      <section className="admin-shell-page">
        <PageHeader title="Finance" description="Platform ledger, payouts, and COD remittances." />
        <StateView
          state="empty"
          title="Finance ledger is not available yet"
          description="Settlements, payouts, and COD remittance verification will appear here once the admin finance API is connected."
        />
      </section>
    </AdminLayout>
  );
}
