import { DataTable, EmptyState, PageHeader, StatCard } from '../components';
import AdminLayout from '../../../layouts/AdminLayout';
import { getFinancialTransactions, getPlatformTotals } from '../mocks';
import { formatPeso } from '../utils/format';

export default function AdminSectionPage({ title, description, routeName }) {
  const isFinancialView = routeName === 'finance workspace' || routeName === 'reporting';
  if (isFinancialView) {
    const totals = getPlatformTotals();
    const transactions = getFinancialTransactions();
    const columns = [
      { key: 'id', label: 'Reference' },
      { key: 'type', label: 'Record type' },
      { key: 'customerName', label: 'Customer' },
      { key: 'restaurant', label: 'Restaurant' },
      { key: 'paymentMethod', label: 'Payment method' },
      { key: 'paymentStatus', label: 'Payment status' },
      { key: 'amount', label: 'Snapshot amount', render: (transaction) => formatPeso(transaction.amount) },
    ];
    return (
      <AdminLayout>
        <section className="admin-shell-page">
          <PageHeader title={title} description={description} />
          <div className="admin-stat-grid">
            <StatCard label="Order GMV" value={formatPeso(totals.gmv)} hint="Customer totals from stored order snapshots" />
            <StatCard label="Platform revenue" value={formatPeso(totals.platformRevenue)} hint="Commission, fees, discount funding, reservation fees" />
            <StatCard label="Restaurant sales" value={formatPeso(totals.restaurantSales)} hint="Before commission and adjustments" />
            <StatCard label="Refunds / adjustments" value={formatPeso(totals.refunds)} hint="Recorded order refund adjustments" />
          </div>
          <p className="admin-shell-note">This demo report uses the same immutable mock transaction snapshots as order details. GMV is not platform revenue, and later fee changes never recalculate past orders.</p>
          <DataTable columns={columns} rows={transactions} emptyTitle="No financial transactions" emptyDescription="There are no transaction snapshots in this demo data." />
        </section>
      </AdminLayout>
    );
  }
  return (
    <AdminLayout>
      <section className="admin-shell-page">
        <PageHeader title={title} description={description} />
        <EmptyState
          title={`No ${title.toLowerCase()} records`}
          description={`There are no ${title.toLowerCase()} records in the demo data. This section is reserved for the ${routeName} workflow; no live data or actions are available in this batch.`}
        />
      </section>
    </AdminLayout>
  );
}
