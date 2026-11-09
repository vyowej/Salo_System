import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../../hooks/useAuth';
import { StateView } from '../components';
import AccessDeniedPage from '../pages/AccessDeniedPage';
import useAdminSession from '../contexts/useAdminSession';

export default function AdminRouteGuard() {
  const { isAuthenticated, role, loading } = useAuth();
  const { mfaVerified } = useAdminSession();
  const location = useLocation();

  if (loading) return <StateView state="loading" title="your admin session" />;
  if (!isAuthenticated) return <Navigate to="/login" state={{ from: location }} replace />;
  if (role !== 'admin') return <AccessDeniedPage title="Administrator access required" returnTo="/" />;

  if (!mfaVerified && location.pathname !== '/admin/mfa') {
    return <Navigate to="/admin/mfa" state={{ from: location }} replace />;
  }
  if (mfaVerified && location.pathname === '/admin/mfa') {
    return <Navigate to={location.state?.from?.pathname || '/admin'} replace />;
  }
  if (!mfaVerified && location.pathname === '/admin/mfa') return <Outlet />;
  if (!mfaVerified) return <Navigate to="/admin/mfa" state={{ from: location }} replace />;
  return <Outlet />;
}
