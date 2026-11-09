import { useState } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import { getAdminMock } from '../mocks';
import { ADMIN_PERMISSION_MATRIX, ADMIN_ROLES } from '../constants';
import AdminSessionContext from './adminSessionStore';

const MFA_SESSION_KEY = 'salo_admin_mfa_verified';

export function AdminSessionProvider({ children }) {
  const { user } = useAuth();
  const admins = getAdminMock('administrators').data;
  const initialAdmin = admins.find((admin) => admin.email === user?.email) || {
    id: `session-admin-${user?.id ?? 'unknown'}`,
    name: user?.name || 'Administrator',
    email: user?.email || '',
    role: 'Customer Support',
    status: 'Active',
  };
  const [selectedAdminId, setSelectedAdminId] = useState(initialAdmin.id);
  const currentAdmin = admins.find((admin) => admin.id === selectedAdminId) || initialAdmin;
  const [mfaVerified, setMfaVerifiedState] = useState(() => sessionStorage.getItem(MFA_SESSION_KEY) === 'true');
  const [sessions, setSessions] = useState(() => getAdminMock('sessions').data);
  const isDemoMode = user?.role === 'admin' && user?.email === 'admin@salo.ph';
  const permissions = ADMIN_PERMISSION_MATRIX[currentAdmin.role] || {};

  const verifyMfa = () => {
    sessionStorage.setItem(MFA_SESSION_KEY, 'true');
    setMfaVerifiedState(true);
  };

  const resetMfa = () => {
    sessionStorage.removeItem(MFA_SESSION_KEY);
    setMfaVerifiedState(false);
  };

  const selectDemoAdmin = (id) => {
    if (!isDemoMode) return;
    const next = admins.find((admin) => admin.id === id && admin.status === 'Active');
    if (next) setSelectedAdminId(next.id);
  };

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
    isDemoMode,
    mfaVerified,
    verifyMfa,
    resetMfa,
    selectDemoAdmin,
    sessions,
    revokeSession,
    roleOptions: Object.values(ADMIN_ROLES),
  };

  return <AdminSessionContext.Provider value={value}>{children}</AdminSessionContext.Provider>;
}
