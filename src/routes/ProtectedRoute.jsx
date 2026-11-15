import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { LoadingSpinner } from '../components/feedback';
import { getDefaultWorkspace, getWorkspaceHomePath } from '../services/authService';

/**
 * ProtectedRoute
 * Guards routes requiring authentication and optional role restrictions.
 * Redirects unauthenticated users to /login with state.from.
 */
export default function ProtectedRoute({ children, allowedRoles = [] }) {
  const { isAuthenticated, role, roles, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <LoadingSpinner size="lg" label="Authenticating..." />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  const userRoles = Array.isArray(roles) && roles.length > 0 ? roles : [role].filter(Boolean);
  if (allowedRoles.length > 0 && !allowedRoles.some((allowed) => userRoles.includes(allowed))) {
    return <Navigate to={getWorkspaceHomePath(getDefaultWorkspace(userRoles))} replace />;
  }

  return children;
}
