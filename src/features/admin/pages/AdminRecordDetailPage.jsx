import { Link, useParams } from 'react-router-dom';
import Button from '../../../components/common/Button';
import { PageHeader, StateView } from '../components';
import { useAdminPageSearch } from '../contexts/useAdminSearch';
import AdminLayout from '../../../layouts/AdminLayout';

export default function AdminRecordDetailPage({ entity }) {
  useAdminPageSearch({ disabled: true });
  const { id } = useParams();

  return (
    <AdminLayout>
      <section className="admin-shell-page">
        <PageHeader title="Record details" description={`Reference: ${id}`} />
        <StateView
          state="empty"
          title="Record detail view is not available yet"
          description="Detailed record inspection will appear here once the corresponding admin detail API is connected."
          action={<Link to={`/admin/${entity}`}><Button variant="outline">Back to directory</Button></Link>}
        />
      </section>
    </AdminLayout>
  );
}
