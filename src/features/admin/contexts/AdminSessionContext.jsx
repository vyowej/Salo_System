import { useState } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import { getAdminMock } from '../mocks';
import { ADMIN_PERMISSION_MATRIX, ADMIN_ROLES } from '../constants';
import AdminSessionContext from './adminSessionStore';

export function AdminSessionProvider({ children }) {
  const { user } = useAuth();
  const admins = getAdminMock('administrators').data;
  const currentAdmin = admins.find(
    (admin) => admin.email?.toLowerCase() === user?.email?.toLowerCase(),
  ) || {
    id: `session-admin-${user?.id ?? 'unknown'}`,
    name: user?.name || 'Administrator',
    email: user?.email || '',
    role: ADMIN_ROLES.ADMIN,
    status: 'Active',
  };
  const [sessions, setSessions] = useState(() => getAdminMock('sessions').data);
  const permissions = ADMIN_PERMISSION_MATRIX[currentAdmin.role] || ADMIN_PERMISSION_MATRIX[ADMIN_ROLES.ADMIN] || {};

  const revokeSession = (id) => {
    setSessions((previous) => previous.map((session) => (
      session.id === id && !session.current ? { ...session, revoked: true } : session
    )));
  };

  const value = {
    currentAdmin,
    role: currentAdmin.role,
    admins,
    permissions,
    sessions,
    revokeSession,
    roleOptions: Object.values(ADMIN_ROLES),
  };

  return <AdminSessionContext.Provider value={value}>{children}</AdminSessionContext.Provider>;
}
