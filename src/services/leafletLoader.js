/**
 * SALO — Leaflet + OpenStreetMap Loader
 * Singleton loader that injects Leaflet 1.9.4 CSS & JS without requiring any API keys or billing.
 */

let loadPromise = null;

export function getOsmTileUrl() {
  return (import.meta.env?.VITE_OSM_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png').trim();
}

export function loadLeaflet() {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Leaflet requires a browser environment.'));
  }

  if (window.L) {
    return Promise.resolve(window.L);
  }

  if (loadPromise) {
    return loadPromise;
  }

  loadPromise = new Promise((resolve, reject) => {
    if (!document.querySelector('link[data-salo-leaflet-css="true"]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      link.dataset.saloLeafletCss = 'true';
      document.head.appendChild(link);
    }

    const existingScript = document.querySelector('script[data-salo-leaflet-js="true"]');
    if (existingScript) {
      existingScript.addEventListener('load', () => {
        if (window.L) resolve(window.L);
        else reject(new Error('Leaflet failed to initialize.'));
      });
      existingScript.addEventListener('error', () => {
        loadPromise = null;
        reject(new Error('Failed to load Leaflet mapping library. Check your internet connection.'));
      });
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.async = true;
    script.defer = true;
    script.dataset.saloLeafletJs = 'true';

    script.onload = () => {
      if (window.L) {
        resolve(window.L);
      } else {
        loadPromise = null;
        reject(new Error('Leaflet loaded without window.L namespace.'));
      }
    };

    script.onerror = () => {
      loadPromise = null;
      reject(new Error('Failed to load Leaflet mapping library. Check your internet connection.'));
    };

    document.head.appendChild(script);
  });

  return loadPromise;
}
