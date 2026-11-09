import { Link, useParams } from 'react-router-dom';
import Button from '../../../components/common/Button';
import { DataTable, PageHeader, StateView, StatusBadge } from '../components';
import { formatDate, formatPeso } from '../utils/format';
import { getAdminMock } from '../mocks';
import AdminLayout from '../../../layouts/AdminLayout';

const TOPICS = {
  accounts: ['accounts', 'customers'],
  administrators: ['administrators', 'administrators'],
  restaurants: ['restaurants', 'restaurants'],
  riders: ['riders', 'riders'],
  orders: ['orders', 'orders'],
  reservations: ['reservations', 'reservations'],
};

export default function AdminRecordDetailPage({ entity }) {
  const { id } = useParams();
  const [topic, label] = TOPICS[entity];
  const record = getAdminMock(topic).data.find((item) => item.id === id);
  if (!record) {
    return (
      <AdminLayout>
        <section className="admin-shell-page">
          <PageHeader title={`${label} details`} description={`Record ${id} could not be found in the demo data.`} />
          <StateView state="empty" title={label} description="Check the record reference or return to its directory." />
          <Link to={`/admin/${entity}`}><Button variant="outline">Back to directory</Button></Link>
        </section>
      </AdminLayout>
    );
  }
  const columns = Object.keys(record).map((key) => ({
    key,
    label: key.replace(/[A-Z]/g, (letter) => ` ${letter}`).replace(/^./, (letter) => letter.toUpperCase()),
    render: (item) => {
      const value = item[key];
      if (key === 'status') return <StatusBadge status={value} />;
      if (typeof value === 'number' && /(amount|fee|revenue|cash)/i.test(key)) return formatPeso(value);
      if (typeof value === 'string' && /Date|At$|joined/i.test(key)) return formatDate(value);
      if (Array.isArray(value)) return value.join(', ');
      if (value === null || value === undefined || value === '') return '—';
      return String(value);
    },
  }));
  return (
    <AdminLayout>
      <section className="admin-shell-page">
        <PageHeader title={`${label} details`} description={`Reference: ${record.id}`} />
        <DataTable columns={columns} rows={[record]} />
        <Link to={`/admin/${entity}`}><Button variant="outline">Back to directory</Button></Link>
      </section>
    </AdminLayout>
  );
}
