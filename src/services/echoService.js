import Echo from 'laravel-echo';
import Pusher from 'pusher-js';
import { ensureCsrf } from './apiClient.js';

const API_BASE_URL = (
  import.meta.env?.VITE_API_URL ||
  import.meta.env?.VITE_API_BASE_URL ||
  'http://localhost:8000/api'
).replace(/\/$/, '');

const REVERB_KEY = import.meta.env?.VITE_REVERB_APP_KEY || 'salo-reverb-key';
const REVERB_HOST = import.meta.env?.VITE_REVERB_HOST || 'localhost';
const REVERB_PORT = Number(import.meta.env?.VITE_REVERB_PORT || 8080);
const REVERB_SCHEME = import.meta.env?.VITE_REVERB_SCHEME || 'http';

let echoInstance = null;
const stateListeners = new Set();
let currentStatus = 'disconnected';

function getCookie(name) {
  if (typeof document === 'undefined' || !document.cookie) return null;
  const prefix = `${name}=`;
  for (const part of document.cookie.split(';')) {
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

function notifyStatus(next) {
  currentStatus = next;
  stateListeners.forEach((cb) => {
    try {
      cb(next);
    } catch {
      // ignore listener errors
    }
  });
}

export function getEchoConnectionStatus() {
  return currentStatus;
}

export function subscribeEchoConnectionStatus(listener) {
  if (typeof listener !== 'function') return () => {};
  stateListeners.add(listener);
  listener(currentStatus);
  return () => stateListeners.delete(listener);
}

export function getEcho() {
  if (typeof window === 'undefined') return null;
  if (echoInstance) return echoInstance;

  window.Pusher = Pusher;

  echoInstance = new Echo({
    broadcaster: 'reverb',
    key: REVERB_KEY,
    wsHost: REVERB_HOST,
    wsPort: REVERB_PORT,
    wssPort: REVERB_PORT,
    forceTLS: REVERB_SCHEME === 'https',
    enabledTransports: ['ws', 'wss'],
    authorizer: (channel) => ({
      authorize: async (socketId, callback) => {
        try {
          const csrfToken = await ensureCsrf();
          const xsrf = getCookie('XSRF-TOKEN');
          const headers = {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
          };
          if (xsrf) headers['X-XSRF-TOKEN'] = xsrf;
          if (csrfToken) headers['X-CSRF-TOKEN'] = csrfToken;

          const res = await fetch(`${API_BASE_URL}/broadcasting/auth`, {
            method: 'POST',
            credentials: 'include',
            headers,
            body: JSON.stringify({
              socket_id: socketId,
              channel_name: channel.name,
            }),
          });

          const payload = await res.json().catch(() => null);
          if (!res.ok) {
            callback(new Error(payload?.message || 'Broadcast auth failed'), null);
            return;
          }
          callback(null, payload);
        } catch (err) {
          callback(err instanceof Error ? err : new Error('Broadcast auth error'), null);
        }
      },
    }),
  });

  const pusher = echoInstance.connector?.pusher;
  if (pusher?.connection) {
    notifyStatus(pusher.connection.state || 'connecting');
    pusher.connection.bind('state_change', (states) => {
      notifyStatus(states?.current || 'disconnected');
    });
  }

  return echoInstance;
}

export function disconnectEcho() {
  if (echoInstance) {
    echoInstance.disconnect();
    echoInstance = null;
    notifyStatus('disconnected');
  }
}
