import { createContext, useState, useEffect, useCallback } from 'react';
import authService, { getDefaultWorkspace, normalizeUser } from '../services/authService';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [activeWorkspace, setActiveWorkspaceState] = useState(null);
  const [loading, setLoading] = useState(true);

  const applyAuthenticatedUser = useCallback((nextUser, preferredWorkspace = null) => {
    if (!nextUser) {
      setUser(null);
      setActiveWorkspaceState(null);
      return null;
    }

    const normalized = normalizeUser(nextUser, preferredWorkspace);
    const workspace = preferredWorkspace && normalized.roles.includes(preferredWorkspace)
      ? preferredWorkspace
      : getDefaultWorkspace(normalized.roles);

    setUser({ ...normalized, role: workspace });
    setActiveWorkspaceState(workspace);
    return { ...normalized, role: workspace };
  }, []);

  const refreshUser = useCallback(async () => {
    const currentUser = await authService.getCurrentUser();
    return applyAuthenticatedUser(currentUser, activeWorkspace);
  }, [activeWorkspace, applyAuthenticatedUser]);

  // Restore session from backend cookie on mount
  useEffect(() => {
    let cancelled = false;

    async function verifyAuth() {
      try {
        const currentUser = await authService.getCurrentUser();
        if (!cancelled) {
          applyAuthenticatedUser(currentUser);
        }
      } catch {
        if (!cancelled) {
          applyAuthenticatedUser(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    verifyAuth();

    return () => {
      cancelled = true;
    };
  }, [applyAuthenticatedUser]);

  // Clear session state when an authenticated API call returns 401/403
  useEffect(() => {
    const handleAuthInvalid = (event) => {
      const status = event?.detail?.status;
      if (status === 401) {
        applyAuthenticatedUser(null);
      }
    };

    window.addEventListener('salo:authInvalid', handleAuthInvalid);
    return () => window.removeEventListener('salo:authInvalid', handleAuthInvalid);
  }, [applyAuthenticatedUser]);

  const login = useCallback(async (credentials) => {
    setLoading(true);
    try {
      const result = await authService.login(credentials);
      const activeUser = applyAuthenticatedUser(result.user);
      return { user: activeUser };
    } finally {
      setLoading(false);
    }
  }, [applyAuthenticatedUser]);

  const register = useCallback(async (userData) => {
    setLoading(true);
    try {
      const result = await authService.register(userData);
      const activeUser = applyAuthenticatedUser(result.user);
      return { user: activeUser };
    } finally {
      setLoading(false);
    }
  }, [applyAuthenticatedUser]);

  const logout = useCallback(async () => {
    setLoading(true);
    try {
      await authService.logout();
      applyAuthenticatedUser(null);
    } finally {
      setLoading(false);
    }
  }, [applyAuthenticatedUser]);

  const setActiveWorkspace = useCallback((workspaceRole) => {
    setUser((prev) => {
      if (!prev) return prev;
      const roles = prev.roles || [];
      if (!roles.includes(workspaceRole)) {
        return prev;
      }
      setActiveWorkspaceState(workspaceRole);
      return { ...prev, role: workspaceRole };
    });
  }, []);

  const updateUser = useCallback((updatedData) => {
    setUser((prev) => {
      if (!prev) return prev;
      const merged = normalizeUser({ ...prev, ...updatedData }, activeWorkspace || prev.role);
      return merged;
    });
  }, [activeWorkspace]);

  const value = {
    user,
    role: activeWorkspace || user?.role || null,
    roles: user?.roles || [],
    activeWorkspace: activeWorkspace || user?.role || null,
    setActiveWorkspace,
    isAuthenticated: !!user,
    loading,
    login,
    register,
    logout,
    refreshUser,
    updateUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export default AuthContext;
