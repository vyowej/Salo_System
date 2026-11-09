import { PageHeader, StateView } from '../components';
import useScenario from '../hooks/useScenario';
import AdminLayout from '../../../layouts/AdminLayout';
import { ADMIN_NAV_ITEMS } from '../constants';

export default function AdminScenarioBoundary({ topic, module, children }) {
  const scenario = useScenario(topic);
  const title = ADMIN_NAV_ITEMS.find((item) => item.module === module)?.label || 'Admin';
  if (scenario.state !== 'success') {
    return (
      <AdminLayout>
        <PageHeader title={title} description="Demo data state for this administrative section." />
        <StateView state={scenario.state} title={topic} description={scenario.error || undefined} retry={scenario.retry} />
      </AdminLayout>
    );
  }
  return children;
}
