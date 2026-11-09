import useAdminSession from '../contexts/useAdminSession';
import { hasAdminPermission } from '../constants';
import AccessDeniedPage from '../pages/AccessDeniedPage';
import AdminScenarioBoundary from './AdminScenarioBoundary';

export default function AdminPermissionRoute({ module, topic, action = 'view', children }) {
  const { currentAdmin } = useAdminSession();
  if (!hasAdminPermission(currentAdmin.role, module, action)) {
    return <AccessDeniedPage title="You do not have permission to view this section" />;
  }
  return <AdminScenarioBoundary topic={topic} module={module}>{children}</AdminScenarioBoundary>;
}
