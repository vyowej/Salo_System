import { Navigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useRestaurantAccess } from '../features/restaurant/access/useRestaurantAccess';
import { OWNER_NAV_ITEMS } from '../features/restaurant/access/permissionMap';
import { LoadingSpinner } from '../components/feedback';
import { resolveAccessDecision } from './accessDecision';

export function RequireRole({ children, allowedRoles = [] }) {
  const { isAuthenticated, role, loading } = useAuth();
  const location = useLocation();

  if (loading) return <LoadingSpinner size="lg" label="Checking your session..." />;
  if (!isAuthenticated) return <Navigate to="/login" state={{ from: location }} replace />;
  if (allowedRoles.length && !allowedRoles.includes(role)) return <NoAccessPage />;
  return children;
}

export default function RequireAccess({ children, itemId }) {
  const { isAuthenticated, loading } = useAuth();
  const access = useRestaurantAccess();
  const location = useLocation();
  const item = OWNER_NAV_ITEMS.find((entry) => entry.id === itemId);
  const canAccess = !itemId || (item && (item.allOf
    ? access.canAccess(item.allOf, 'all')
    : access.canAccess(item.anyOf, 'any')));
  // Frontend route checks improve UX; backend authorization is the real protection.
  const decision = resolveAccessDecision({
    loading,
    authenticated: isAuthenticated,
    hasRestaurantAccess: access.hasRestaurantAccess,
    canAccess,
  });

  if (decision === 'loading') return <LoadingSpinner size="lg" label="Checking restaurant access..." />;
  if (decision === 'unauthenticated') return <Navigate to="/login" state={{ from: location }} replace />;
  if (decision === 'forbidden') return <NoAccessPage />;
  return <RequireRole>{children}</RequireRole>;
}

export function NoAccessPage() {
  return (
    <main className="owner-access-page">
      <section className="owner-access-card" role="alert">
        <span className="owner-access-icon" aria-hidden="true">!</span>
        <h1>No access</h1>
        <p>Your SALO account is not an active owner or staff member for this restaurant workspace, or you do not have permission for this section.</p>
        <Link to="/customer">Return to customer side</Link>
      </section>
    </main>
  );
}
