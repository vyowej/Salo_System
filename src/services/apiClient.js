/**
 * SALO — API Client
 * Centralized fetch wrapper for the Laravel cookie-session + CSRF REST API.
 * Uses credentials: 'include' and never stores auth tokens in localStorage.
 */

import { getActiveRestaurantIdHeader } from '../features/restaurant/access/branchContextStorage.js';

const API_BASE_URL = (
  import.meta.env?.VITE_API_URL ||
  import.meta.env?.VITE_API_BASE_URL ||
  'http://localhost:8000/api'
).replace(/\/$/, '');

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

let csrfTokenCache = null;
let csrfPromise = null;

export class ApiError extends Error {
  constructor(message, status, data = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
    this.errors = data?.errors || null;
  }
}

function getCookie(name) {
  if (typeof document === 'undefined' || !document.cookie) {
    return null;
  }

  const prefix = `${name}=`;
  const parts = document.cookie.split(';');

  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) {
      try {
        return decodeURIComponent(trimmed.slice(prefix.length));
      } catch {
        return trimmed.slice(prefix.length);
      }
    }
  }

  return null;
}

function buildUrl(endpoint) {
  return `${API_BASE_URL}/${endpoint.replace(/^\//, '')}`;
}

export async function ensureCsrf(forceRefresh = false) {
  if (!forceRefresh && (csrfTokenCache || getCookie('XSRF-TOKEN'))) {
    return csrfTokenCache;
  }

  if (csrfPromise) {
    return csrfPromise;
  }

  csrfPromise = (async () => {
    const response = await fetch(buildUrl('/auth/csrf'), {
      method: 'GET',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new ApiError(
        payload?.message || 'Unable to initialize CSRF protection.',
        response.status,
        payload,
      );
    }

    csrfTokenCache = payload?.data?.csrf_token || null;
    return csrfTokenCache;
  })();

  try {
    return await csrfPromise;
  } finally {
    csrfPromise = null;
  }
}

export function clearCsrfCache() {
  csrfTokenCache = null;
}

async function executeFetch(endpoint, options, hasRetriedCsrf = false) {
  const {
    method = 'GET',
    data = null,
    headers = {},
    skipAuthInvalidEvent = false,
    ...customConfig
  } = options;

  const upperMethod = method.toUpperCase();
  const isMutating = MUTATING_METHODS.has(upperMethod);

  if (isMutating) {
    await ensureCsrf();
  }

  const requestHeaders = {
    Accept: 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
    ...headers,
  };

  const normalizedEndpoint = String(endpoint || '').startsWith('/') ? String(endpoint) : `/${String(endpoint || '')}`;
  const isRestaurantWorkspaceEndpoint =
    normalizedEndpoint.startsWith('/restaurant/') &&
    !normalizedEndpoint.startsWith('/restaurant/applications');
  const activeRestaurantId = getActiveRestaurantIdHeader();
  if (isRestaurantWorkspaceEndpoint && activeRestaurantId && !requestHeaders['X-Restaurant-Id']) {
    requestHeaders['X-Restaurant-Id'] = activeRestaurantId;
  }

  const isFormData = typeof FormData !== 'undefined' && data instanceof FormData;

  if (data !== null && data !== undefined && upperMethod !== 'GET' && upperMethod !== 'HEAD') {
    if (!isFormData && !requestHeaders['Content-Type']) {
      requestHeaders['Content-Type'] = 'application/json';
    }
  }

  if (isMutating) {
    const xsrfCookie = getCookie('XSRF-TOKEN');
    if (xsrfCookie) {
      requestHeaders['X-XSRF-TOKEN'] = xsrfCookie;
    }
    if (csrfTokenCache) {
      requestHeaders['X-CSRF-TOKEN'] = csrfTokenCache;
    }
  }

  const config = {
    method: upperMethod,
    credentials: 'include',
    headers: requestHeaders,
    ...customConfig,
  };

  if (data !== null && data !== undefined && upperMethod !== 'GET' && upperMethod !== 'HEAD') {
    config.body = isFormData ? data : (typeof data === 'string' ? data : JSON.stringify(data));
  }

  let response;
  try {
    response = await fetch(buildUrl(endpoint), config);
  } catch (error) {
    throw new ApiError(error?.message || 'Network error occurred', 0, null);
  }

  if (response.status === 419 && isMutating && !hasRetriedCsrf) {
    clearCsrfCache();
    await ensureCsrf(true);
    return executeFetch(endpoint, options, true);
  }

  if (response.status === 204) {
    return null;
  }

  const responseData = await response.json().catch(() => null);

  if (!response.ok) {
    if (
      (response.status === 401 || response.status === 403) &&
      !skipAuthInvalidEvent &&
      typeof window !== 'undefined'
    ) {
      window.dispatchEvent(
        new CustomEvent('salo:authInvalid', {
          detail: { status: response.status, endpoint },
        }),
      );
    }

    const firstFieldError = responseData?.errors
      ? Object.values(responseData.errors).flat().find(Boolean)
      : null;
    const errorMessage =
      firstFieldError ||
      responseData?.message ||
      responseData?.error ||
      `Request failed with status ${response.status}`;

    throw new ApiError(errorMessage, response.status, responseData);
  }

  return responseData;
}

async function request(endpoint, options = {}) {
  return executeFetch(endpoint, options, false);
}

export const apiClient = {
  get: (endpoint, options = {}) => request(endpoint, { ...options, method: 'GET' }),
  post: (endpoint, data, options = {}) => request(endpoint, { ...options, method: 'POST', data }),
  put: (endpoint, data, options = {}) => request(endpoint, { ...options, method: 'PUT', data }),
  patch: (endpoint, data, options = {}) => request(endpoint, { ...options, method: 'PATCH', data }),
  delete: (endpoint, options = {}) => request(endpoint, { ...options, method: 'DELETE' }),

  ensureCsrf,
  clearCsrfCache,
  getBaseUrl: () => API_BASE_URL,

  async checkHealth() {
    try {
      const start = Date.now();
      const res = await fetch(buildUrl('/health'), {
        method: 'GET',
        credentials: 'include',
        headers: {
          Accept: 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
      });
      const latency = Date.now() - start;
      const payload = await res.json().catch(() => null);
      return {
        ok: res.ok,
        status: res.status,
        latency,
        data: payload,
      };
    } catch (error) {
      return {
        ok: false,
        status: 0,
        latency: 0,
        error: error.message,
      };
    }
  },
};

export default apiClient;
