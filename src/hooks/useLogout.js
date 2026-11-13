import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './useAuth';

/**
 * Shared logout confirmation hook.
 * Every logout trigger calls `requestLogout()` to open the confirmation dialog,
 * and confirming clears the session and redirects to `/login`.
 */
export function useLogout({ onBeforeLogout, redirectTo = '/login' } = {}) {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const requestLogout = useCallback(() => {
    setConfirmOpen(true);
  }, []);

  const cancelLogout = useCallback(() => {
    setConfirmOpen(false);
  }, []);

  const confirmLogout = useCallback(async () => {
    setConfirmOpen(false);
    await onBeforeLogout?.();
    await logout();
    navigate(redirectTo);
  }, [logout, navigate, onBeforeLogout, redirectTo]);

  return {
    confirmOpen,
    requestLogout,
    cancelLogout,
    confirmLogout,
    logoutDialogProps: {
      open: confirmOpen,
      title: 'Log out?',
      message: 'Are you sure you want to log out of SALO?',
      confirmLabel: 'Log out',
      cancelLabel: 'Cancel',
      onConfirm: confirmLogout,
      onCancel: cancelLogout,
    },
  };
}

export default useLogout;
