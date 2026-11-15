import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../../hooks/useAuth';
import { StateView } from '../components';
import AccessDeniedPage from '../pages/AccessDeniedPage';

export default function AdminRouteGuard() {
  const { isAuthenticated, role, roles, loading } = useAuth();
  const location = useLocation();

  if (loading) return <StateView state="loading" title="your admin session" />;
  if (!isAuthenticated) return <Navigate to="/login" state={{ from: location }} replace />;
  const isAdmin = role === 'admin' || (Array.isArray(roles) && roles.includes('admin'));
  if (!isAdmin) return <AccessDeniedPage title="Administrator access required" returnTo="/" />;

  return <Outlet />;
}
