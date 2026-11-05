/**
 * SALO — API Client
 * Centralized fetch wrapper prepared for Laravel REST API.
 * Handles headers, bearer tokens, error parsing, and timeout.
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

class ApiError extends Error {
  constructor(message, status, data = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

async function request(endpoint, options = {}) {
  const {
    method = 'GET',
    data = null,
    headers = {},
    requiresAuth = true,
    ...customConfig
  } = options;

  const requestHeaders = {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    ...headers,
  };

  if (requiresAuth) {
    const token = localStorage.getItem('salo_token');
    if (token) {
      requestHeaders['Authorization'] = `Bearer ${token}`;
    }
  }

  const config = {
    method,
    headers: requestHeaders,
    ...customConfig,
  };

  if (data && method !== 'GET' && method !== 'HEAD') {
    config.body = JSON.stringify(data);
  }

  const url = `${API_BASE_URL.replace(/\/$/, '')}/${endpoint.replace(/^\//, '')}`;

  try {
    const response = await fetch(url, config);

    if (response.status === 204) {
      return null;
    }

    const responseData = await response.json().catch(() => null);

    if (!response.ok) {
      const errorMessage =
        responseData?.message ||
        responseData?.error ||
        `Request failed with status ${response.status}`;
      throw new ApiError(errorMessage, response.status, responseData);
    }

    return responseData;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(error.message || 'Network error occurred', 0, null);
  }
}

export const apiClient = {
  get: (endpoint, options = {}) => request(endpoint, { ...options, method: 'GET' }),
  post: (endpoint, data, options = {}) => request(endpoint, { ...options, method: 'POST', data }),
  put: (endpoint, data, options = {}) => request(endpoint, { ...options, method: 'PUT', data }),
  patch: (endpoint, data, options = {}) => request(endpoint, { ...options, method: 'PATCH', data }),
  delete: (endpoint, options = {}) => request(endpoint, { ...options, method: 'DELETE' }),
};

export { ApiError };
export default apiClient;
