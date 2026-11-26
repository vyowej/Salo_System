/**
 * SALO — Authentication Service
 * Communicates with Laravel cookie-session authentication endpoints (/api/auth/*).
 */

import apiClient, { clearCsrfCache } from './apiClient.js';

let inFlightCurrentUserPromise = null;
let currentUserRequestGeneration = 0;

function invalidateInFlightCurrentUser() {
  currentUserRequestGeneration += 1;
  inFlightCurrentUserPromise = null;
}

export function getDefaultWorkspace(roles = []) {
  if (!Array.isArray(roles) || roles.length === 0) {
    return 'customer';
  }

  if (roles.includes('admin')) {
    return 'admin';
  }

  return 'customer';
}

export function getWorkspaceHomePath(role) {
  switch (role) {
    case 'admin':
      return '/admin';
    case 'owner':
    case 'staff':
    case 'restaurant':
      return '/owner';
    case 'rider':
      return '/rider';
    case 'customer':
    default:
      return '/customer';
  }
}

export function isPathAllowedForUser(pathname, user) {
  if (!pathname || typeof pathname !== 'string') return false;
  if (pathname === '/login' || pathname === '/register') return false;

  const roles = Array.isArray(user?.roles) ? user.roles : [];
  const workspace = user?.role || getDefaultWorkspace(roles);
  const hasRole = (target) => workspace === target || roles.includes(target);

  if (pathname.startsWith('/admin')) {
    return hasRole('admin');
  }
  if (pathname.startsWith('/owner')) {
    return hasRole('owner') || hasRole('staff') || hasRole('restaurant');
  }
  if (pathname.startsWith('/rider')) {
    return hasRole('rider');
  }
  if (workspace === 'admin') {
    return false;
  }
  return true;
}

export function resolvePostLoginDestination(user, fromLocation = null) {
  const workspace = user?.role || getDefaultWorkspace(user?.roles);
  if (fromLocation?.pathname && isPathAllowedForUser(fromLocation.pathname, user)) {
    const { pathname, search = '', hash = '' } = fromLocation;
    return `${pathname}${search}${hash}`;
  }
  return getWorkspaceHomePath(workspace);
}

export function normalizeUser(rawUser, preferredWorkspace = null) {
  if (!rawUser) return null;

  const baseRoles = Array.isArray(rawUser.roles) && rawUser.roles.length > 0
    ? rawUser.roles
    : [rawUser.user_role === 'admin' ? 'admin' : 'customer'];
  const roles = rawUser.user_role === 'admin' && !baseRoles.includes('admin')
    ? [...baseRoles, 'admin']
    : baseRoles;

  const fullName = [
    rawUser.first_name,
    rawUser.middle_initial ? `${rawUser.middle_initial}.` : '',
    rawUser.last_name,
  ]
    .filter(Boolean)
    .join(' ')
    .trim();

  const resolvedWorkspace = preferredWorkspace && roles.includes(preferredWorkspace)
    ? preferredWorkspace
    : getDefaultWorkspace(roles);

  return {
    ...rawUser,
    id: rawUser.user_id ?? rawUser.id,
    name: fullName || rawUser.username || rawUser.email,
    roles,
    role: resolvedWorkspace,
    phone: rawUser.phone_number ?? null,
    avatar: rawUser.avatar ?? rawUser.rider_profile?.profile_photo ?? null,
  };
}

export const authService = {
  async login({ email, password }) {
    invalidateInFlightCurrentUser();
    const response = await apiClient.post(
      '/auth/login',
      { email, password },
      { skipAuthInvalidEvent: true },
    );

    invalidateInFlightCurrentUser();
    const user = normalizeUser(response?.data?.user);
    return { user };
  },

  async register(userData) {
    invalidateInFlightCurrentUser();
    const payload = {
      username: userData.username,
      first_name: userData.first_name ?? userData.firstName,
      middle_initial: userData.middle_initial ?? userData.middleInitial ?? null,
      last_name: userData.last_name ?? userData.lastName,
      email: userData.email,
      password: userData.password,
      password_confirmation: userData.password_confirmation ?? userData.passwordConfirmation,
    };

    const response = await apiClient.post('/auth/register', payload, {
      skipAuthInvalidEvent: true,
    });

    invalidateInFlightCurrentUser();
    const user = normalizeUser(response?.data?.user);
    return { user };
  },

  async logout() {
    invalidateInFlightCurrentUser();
    try {
      await apiClient.post('/auth/logout', null, { skipAuthInvalidEvent: true });
    } finally {
      invalidateInFlightCurrentUser();
      clearCsrfCache();
    }
  },

  async requestPasswordReset(email) {
    return apiClient.post(
      '/auth/password/forgot',
      { email },
      { skipAuthInvalidEvent: true },
    );
  },

  async resetPassword({ token, email, password, password_confirmation }) {
    return apiClient.post(
      '/auth/password/reset',
      {
        token,
        email,
        password,
        password_confirmation,
      },
      { skipAuthInvalidEvent: true },
    );
  },

  async getCurrentUser() {
    if (inFlightCurrentUserPromise) {
      return inFlightCurrentUserPromise;
    }

    const generation = currentUserRequestGeneration;
    let requestPromise = null;
    requestPromise = (async () => {
      try {
        const response = await apiClient.get('/auth/me', {
          skipAuthInvalidEvent: true,
        });
        return normalizeUser(response?.data?.user);
      } catch (error) {
        if (error?.status === 401 || error?.status === 403) {
          return null;
        }
        throw error;
      } finally {
        if (inFlightCurrentUserPromise === requestPromise && currentUserRequestGeneration === generation) {
          inFlightCurrentUserPromise = null;
        }
      }
    })();

    inFlightCurrentUserPromise = requestPromise;
    return requestPromise;
  },

  async getGoogleAuthUrl() {
    const response = await apiClient.get('/auth/google/url', {
      skipAuthInvalidEvent: true,
    });
    return response?.data?.url || '';
  },

  async checkUsernameAvailable(username) {
    const response = await apiClient.get(
      `/auth/username-available?username=${encodeURIComponent(String(username || '').trim())}`,
      { skipAuthInvalidEvent: true },
    );
    return response?.data || { valid: false, available: false, message: '' };
  },

  async getGooglePendingSignup() {
    const response = await apiClient.get('/auth/google/pending', {
      skipAuthInvalidEvent: true,
    });
    return response?.data?.pending || null;
  },

  async completeGoogleSignup(username) {
    invalidateInFlightCurrentUser();
    const response = await apiClient.post(
      '/auth/google/complete',
      { username: String(username || '').trim() },
      { skipAuthInvalidEvent: true },
    );
    invalidateInFlightCurrentUser();
    return { user: normalizeUser(response?.data?.user) };
  },
};

export default authService;
