import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../../hooks/useAuth';
import { StateView } from '../components';
import AccessDeniedPage from '../pages/AccessDeniedPage';

export default function AdminRouteGuard() {
  const { isAuthenticated, role, loading } = useAuth();
  const location = useLocation();

  if (loading) return <StateView state="loading" title="your admin session" />;
  if (!isAuthenticated) return <Navigate to="/login" state={{ from: location }} replace />;
  if (role !== 'admin') return <AccessDeniedPage title="Administrator access required" returnTo="/" />;

  return <Outlet />;
}
