import { useAuth } from '../../../hooks/useAuth';
import { ADMIN_PERMISSION_MATRIX, ADMIN_ROLES } from '../constants';
import AdminSessionContext from './adminSessionStore';

export function AdminSessionProvider({ children }) {
  const { user } = useAuth();
  const currentAdmin = {
    id: user?.user_id ?? user?.id ?? 'admin',
    name: user?.name || user?.username || 'Administrator',
    email: user?.email || '',
    role: ADMIN_ROLES.ADMIN,
    status: 'Active',
  };
  const permissions = ADMIN_PERMISSION_MATRIX[currentAdmin.role] || ADMIN_PERMISSION_MATRIX[ADMIN_ROLES.ADMIN] || {};

  const value = {
    currentAdmin,
    role: currentAdmin.role,
    admins: [],
    permissions,
    sessions: [],
    revokeSession: () => {},
    roleOptions: Object.values(ADMIN_ROLES),
  };

  return <AdminSessionContext.Provider value={value}>{children}</AdminSessionContext.Provider>;
}
