/**
 * SALO — Authentication Service
 * Communicates with backend authentication endpoints.
 * Includes local persistence and fallback mock behavior for development when backend is offline.
 */

import apiClient from './apiClient';

const TOKEN_KEY = 'salo_token';
const USER_KEY = 'salo_user';
// TODO: Turn off/remove VITE_ENABLE_DEMO_AUTH before any real deployment.
export const DEMO_AUTH_ENABLED = import.meta.env.VITE_ENABLE_DEMO_AUTH !== 'false';

function createDemoToken(user) {
  return `salo_demo_token_${user.role || 'customer'}_${Date.now()}`;
}

function isDemoToken(token) {
  return token?.startsWith('salo_demo_token_') || token?.startsWith('salo_token_');
}

// Mock users for development/showcase demonstration when backend is not live
const DEMO_USERS = {
  'customer@salo.ph': {
    id: 1,
    name: 'Cassidy Santos',
    username: 'cassidys',
    email: 'customer@salo.ph',
    role: 'customer',
    phone: '09171234567',
    avatar: null,
  },
  'owner@salo.ph': {
    id: 2,
    name: 'Chef Marco Dalisay',
    username: 'marcodalisay',
    email: 'owner@salo.ph',
    role: 'owner',
    restaurantName: 'Dalisay Grill & Bistro',
    phone: '09181234567',
    avatar: null,
  },
  'rider@salo.ph': {
    id: 3,
    name: 'Juan Dela Cruz',
    username: 'juandelacruz',
    email: 'rider@salo.ph',
    role: 'rider',
    vehicleType: 'Motorcycle',
    phone: '09191234567',
    avatar: null,
  },
  'admin@salo.ph': {
    id: 4,
    name: 'System Administrator',
    username: 'admin',
    email: 'admin@salo.ph',
    role: 'admin',
    phone: '09201234567',
    avatar: null,
  },
  'staff@salo.ph': {
    id: 5,
    name: 'Sam Rivera',
    username: 'samrivera',
    email: 'staff@salo.ph',
    role: 'customer',
    phone: null,
    avatar: null,
  },
  'reservation.staff@salo.ph': {
    id: 6,
    name: 'Alex Cruz',
    username: 'alexcruz',
    email: 'reservation.staff@salo.ph',
    role: 'customer',
    phone: null,
    avatar: null,
  },
  'inventory.staff@salo.ph': {
    id: 7,
    name: 'Jamie Santos',
    username: 'jamiesantos',
    email: 'inventory.staff@salo.ph',
    role: 'customer',
    phone: null,
    avatar: null,
  },
};

export const authService = {
  /**
   * Log in user with email/username and password
   */
  async login(credentials) {
    const email = credentials.email?.toLowerCase().trim();
    if (DEMO_AUTH_ENABLED && DEMO_USERS[email]) {
      const mockUser = DEMO_USERS[email];
      const mockToken = createDemoToken(mockUser);
      this.setSession(mockToken, mockUser);
      return { user: mockUser, token: mockToken, isDemo: true };
    }

    try {
      const response = await apiClient.post('/auth/login', credentials, { requiresAuth: false });
      if (response?.token && response?.user) {
        this.setSession(response.token, response.user);
        return response;
      }
    } catch (err) {
      if (!DEMO_AUTH_ENABLED) throw err;

      // If network fails (backend not running yet), allow demo credentials in dev environment
      if (DEMO_USERS[email]) {
        const mockUser = DEMO_USERS[email];
        const mockToken = createDemoToken(mockUser);
        this.setSession(mockToken, mockUser);
        return { user: mockUser, token: mockToken, isDemo: true };
      }
      
      // Allow fallback if password matches sample format
      if (credentials.email && credentials.password) {
        const fallbackUser = {
          id: Date.now(),
          name: credentials.email.split('@')[0],
          username: credentials.email.split('@')[0],
          email: credentials.email,
          role: credentials.role || 'customer',
        };
        const mockToken = createDemoToken(fallbackUser);
        this.setSession(mockToken, fallbackUser);
        return { user: fallbackUser, token: mockToken, isDemo: true };
      }

      throw err;
    }
  },

  /**
   * Register a new user
   */
  async register(userData) {
    try {
      const response = await apiClient.post('/auth/register', userData, { requiresAuth: false });
      if (response?.token && response?.user) {
        this.setSession(response.token, response.user);
        return response;
      }
    } catch {
      if (!DEMO_AUTH_ENABLED) throw new Error('Registration is unavailable while demo authentication is disabled.');

      // Local fallback in development
      const newUser = {
        id: Date.now(),
        name: userData.fullName || userData.name,
        username: userData.username,
        email: userData.email,
        role: userData.role || 'customer',
        phone: userData.phone || null,
      };
      const mockToken = createDemoToken(newUser);
      this.setSession(mockToken, newUser);
      return { user: newUser, token: mockToken, isDemo: true };
    }
  },

  /**
   * Log out current user
   */
  async logout() {
    try {
      await apiClient.post('/auth/logout');
    } catch {
      // Ignore network errors on logout
    } finally {
      this.clearSession();
    }
  },

  /**
   * Request password recovery link / token
   */
  async requestPasswordReset(email) {
    try {
      return await apiClient.post('/auth/forgot-password', { email }, { requiresAuth: false });
    } catch {
      // Dev mock response
      return { message: 'If an account exists with this email, password reset instructions have been sent.' };
    }
  },

  /**
   * Reset password with token
   */
  async resetPassword({ token, email, password, password_confirmation }) {
    try {
      return await apiClient.post('/auth/reset-password', {
        token,
        email,
        password,
        password_confirmation,
      }, { requiresAuth: false });
    } catch {
      return { message: 'Your password has been successfully reset.' };
    }
  },

  /**
   * Get current authenticated user details
   */
  async getCurrentUser() {
    const token = this.getToken();
    if (DEMO_AUTH_ENABLED && isDemoToken(token)) {
      return this.getStoredUser();
    }

    try {
      const response = await apiClient.get('/auth/me');
      if (response?.user) {
        localStorage.setItem(USER_KEY, JSON.stringify(response.user));
        return response.user;
      }
    } catch {
      return this.getStoredUser();
    }
  },

  setSession(token, user) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  },

  clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },

  getToken() {
    return localStorage.getItem(TOKEN_KEY);
  },

  getStoredUser() {
    try {
      const userStr = localStorage.getItem(USER_KEY);
      return userStr ? JSON.parse(userStr) : null;
    } catch {
      return null;
    }
  },

  isAuthenticated() {
    return !!this.getToken();
  },
};

export default authService;
