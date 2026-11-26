import { createContext, useState, useEffect, useCallback } from 'react';
import authService, { getDefaultWorkspace, normalizeUser } from '../services/authService';
import contactNumberService from '../services/contactNumberService';
import { clearDraftFiles } from '../services/draftFileStore';

const AuthContext = createContext(null);
const ACTIVE_WORKSPACE_STORAGE_KEY = 'salo_active_workspace';

function readStoredWorkspaceForUser(userId) {
  if (!userId || typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(ACTIVE_WORKSPACE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (String(parsed?.userId) !== String(userId)) {
      return null;
    }
    return typeof parsed?.workspace === 'string' ? parsed.workspace : null;
  } catch {
    return null;
  }
}

function writeStoredWorkspaceForUser(userId, workspace) {
  if (typeof sessionStorage === 'undefined') return;
  try {
    if (!userId || !workspace) {
      sessionStorage.removeItem(ACTIVE_WORKSPACE_STORAGE_KEY);
      return;
    }
    sessionStorage.setItem(
      ACTIVE_WORKSPACE_STORAGE_KEY,
      JSON.stringify({ userId: String(userId), workspace }),
    );
  } catch {
    // Ignore storage errors
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [activeWorkspace, setActiveWorkspaceState] = useState(null);
  const [loading, setLoading] = useState(true);

  const applyAuthenticatedUser = useCallback((nextUser, preferredWorkspace = null) => {
    if (!nextUser) {
      setUser(null);
      setActiveWorkspaceState(null);
      writeStoredWorkspaceForUser(null, null);
      contactNumberService.clearCache();
      return null;
    }

    const userId = nextUser.user_id ?? nextUser.id ?? null;
    const candidateWorkspace = preferredWorkspace || readStoredWorkspaceForUser(userId);
    const normalized = normalizeUser(nextUser, candidateWorkspace);
    const workspace = candidateWorkspace && normalized.roles.includes(candidateWorkspace)
      ? candidateWorkspace
      : getDefaultWorkspace(normalized.roles);

    if (workspace !== 'customer' || !contactNumberService.isLoadedFor(userId)) {
      contactNumberService.clearCache();
    }

    setUser({ ...normalized, role: workspace });
    setActiveWorkspaceState(workspace);
    writeStoredWorkspaceForUser(userId, workspace);
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
      writeStoredWorkspaceForUser(null, null);
      const result = await authService.login(credentials);
      const defaultWorkspace = getDefaultWorkspace(result.user?.roles);
      const activeUser = applyAuthenticatedUser(result.user, defaultWorkspace);
      return { user: activeUser };
    } finally {
      setLoading(false);
    }
  }, [applyAuthenticatedUser]);

  const register = useCallback(async (userData) => {
    setLoading(true);
    try {
      writeStoredWorkspaceForUser(null, null);
      const result = await authService.register(userData);
      const defaultWorkspace = getDefaultWorkspace(result.user?.roles);
      const activeUser = applyAuthenticatedUser(result.user, defaultWorkspace);
      return { user: activeUser };
    } finally {
      setLoading(false);
    }
  }, [applyAuthenticatedUser]);

  const logout = useCallback(async () => {
    setLoading(true);
    const currentUserId = user?.user_id ?? user?.id ?? null;
    try {
      await authService.logout();
    } finally {
      writeStoredWorkspaceForUser(currentUserId, null);
      if (typeof localStorage !== 'undefined') {
        try {
          localStorage.removeItem('salo_partner_app_draft_v1');
          localStorage.removeItem('salo_rider_app_draft_v1');
        } catch {
          // ignore storage errors
        }
      }
      if (typeof sessionStorage !== 'undefined') {
        try {
          sessionStorage.removeItem('salo_partner_app_draft');
        } catch {
          // ignore storage errors
        }
      }
      const scopes = currentUserId
        ? [`partner_${currentUserId}`, `rider_${currentUserId}`, 'partner_anon', 'rider_anon']
        : ['partner_anon', 'rider_anon'];
      Promise.all(scopes.map((s) => clearDraftFiles(s))).catch(() => {});
      applyAuthenticatedUser(null);
      setLoading(false);
    }
  }, [applyAuthenticatedUser, user]);

  const setActiveWorkspace = useCallback((workspaceRole) => {
    setUser((prev) => {
      if (!prev) return prev;
      const roles = prev.roles || [];
      if (!roles.includes(workspaceRole)) {
        return prev;
      }
      setActiveWorkspaceState(workspaceRole);
      writeStoredWorkspaceForUser(prev.user_id ?? prev.id, workspaceRole);
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
