import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import adminApiService from '../../../services/adminApiService';
import { ADMIN_PERMISSION_MATRIX, ADMIN_ROLES } from '../constants';
import AdminSessionContext from './adminSessionStore';

export function AdminSessionProvider({ children }) {
  const { user, isAuthenticated, role: authRole, roles: authRoles } = useAuth();
  const isAdmin = isAuthenticated && (authRole === 'admin' || (Array.isArray(authRoles) && authRoles.includes('admin')));
  const mustChangePassword = Boolean(user?.must_change_password);
  const [sessions, setSessions] = useState([]);
  const [revokedAfter, setRevokedAfter] = useState(null);

  const loadSessions = useCallback(async () => {
    if (!isAdmin || mustChangePassword) {
      setSessions([]);
      return;
    }
    try {
      const data = await adminApiService.getSecuritySessions();
      setSessions(Array.isArray(data?.sessions) ? data.sessions : []);
      setRevokedAfter(data?.revoked_after ?? null);
    } catch {
      // Leave sessions empty if unreachable
    }
  }, [isAdmin, mustChangePassword]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const revokeOtherSessions = useCallback(async ({ password, reason }) => {
    const res = await adminApiService.revokeOtherSecuritySessions({ password, reason });
    await loadSessions();
    return res;
  }, [loadSessions]);

  const currentAdmin = {
    id: user?.user_id ?? user?.id ?? 'admin',
    name: user?.name || user?.username || 'Administrator',
    email: user?.email || '',
    role: ADMIN_ROLES.ADMIN,
    status: 'Active',
    mustChangePassword,
  };
  const permissions = ADMIN_PERMISSION_MATRIX[currentAdmin.role] || ADMIN_PERMISSION_MATRIX[ADMIN_ROLES.ADMIN] || {};

  const value = {
    currentAdmin,
    role: currentAdmin.role,
    admins: [],
    permissions,
    sessions,
    revokedAfter,
    revokeSession: () => {},
    revokeOtherSessions,
    refreshSessions: loadSessions,
    roleOptions: Object.values(ADMIN_ROLES),
  };

  return <AdminSessionContext.Provider value={value}>{children}</AdminSessionContext.Provider>;
}
