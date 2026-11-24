import { useEffect, useRef, useState } from 'react';
import { getOsmTileUrl, loadLeaflet } from '../../services/leafletLoader';
import { fetchOsmRoute } from '../../services/geocodingService';
import './SharedMap.css';

const DEFAULT_PHILIPPINES_CENTER = { lat: 12.8797, lng: 121.774 };

const MARKER_COLORS = {
  pin: '#d94e28',
  pickup: '#d94e28',
  dropoff: '#15803d',
  rider: '#2563eb',
  activeArea: '#16a34a',
  inactiveArea: '#6b7280',
  restaurant: '#b45309',
};

export default function SharedMap({
  center = DEFAULT_PHILIPPINES_CENTER,
  zoom = 15,
  height = 300,
  pin = null, // { lat, lng, draggable?, title? }
  onPinChange = null,
  markers = [], // [{ id, lat, lng, title, subtitle?, type?, onClick? }]
  circles = [], // [{ id, lat, lng, radiusMeters, active?, onClick? }]
  polygons = [], // [{ id, paths, active?, onClick? }]
  route = null, // { origin: { lat, lng }, destination: { lat, lng }, waypoints?: [{ lat, lng }] }
  onRouteCalculated = null,
  interactive = true,
  scrollWheelZoom = false,
  showCoordsChip = true,
  floatingNotice = '',
  className = '',
  ariaLabel = 'Interactive OpenStreetMap',
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const pinMarkerRef = useRef(null);
  const layersRef = useRef({
    markers: [],
    markersById: new Map(),
    circles: [],
    polygons: [],
    routeLine: null,
  });

  const [mapsReady, setMapsReady] = useState(false);
  const [mapError, setMapError] = useState('');

  const initialCenterLat = Number.isFinite(Number(center?.lat)) ? Number(center.lat) : DEFAULT_PHILIPPINES_CENTER.lat;
  const initialCenterLng = Number.isFinite(Number(center?.lng)) ? Number(center.lng) : DEFAULT_PHILIPPINES_CENTER.lng;
  const initialZoom = Number.isFinite(Number(zoom)) ? Number(zoom) : 15;

  // Initialize Leaflet Map with OpenStreetMap tiles
  useEffect(() => {
    let cancelled = false;

    loadLeaflet()
      .then((L) => {
        if (cancelled || !containerRef.current) return;

        if (!mapRef.current) {
          const map = L.map(containerRef.current, {
            center: [initialCenterLat, initialCenterLng],
            zoom: initialZoom,
            zoomControl: true,
            dragging: interactive,
            scrollWheelZoom: Boolean(interactive && scrollWheelZoom),
            doubleClickZoom: interactive,
          });

          L.tileLayer(getOsmTileUrl(), {
            attribution: '&copy; OpenStreetMap contributors',
            maxZoom: 19,
          }).addTo(map);

          mapRef.current = map;
        }

        setMapsReady(true);
        setMapError('');
      })
      .catch((err) => {
        if (!cancelled) {
          setMapError(err?.message || 'Unable to load OpenStreetMap.');
        }
      });

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        pinMarkerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update center & zoom
  const centerLat = Number(center?.lat);
  const centerLng = Number(center?.lng);
  useEffect(() => {
    if (!mapsReady || !mapRef.current) return;
    if (Number.isFinite(centerLat) && Number.isFinite(centerLng)) {
      mapRef.current.setView([centerLat, centerLng], Number.isFinite(Number(zoom)) ? Number(zoom) : mapRef.current.getZoom());
    }
  }, [mapsReady, centerLat, centerLng, zoom]);

  // Click on map to move pin
  useEffect(() => {
    if (!mapsReady || !mapRef.current || !interactive || typeof onPinChange !== 'function') {
      return undefined;
    }

    const handleClick = (event) => {
      if (!event?.latlng) return;
      onPinChange({
        lat: Number(event.latlng.lat.toFixed(6)),
        lng: Number(event.latlng.lng.toFixed(6)),
        source: 'map_click',
      });
    };

    mapRef.current.on('click', handleClick);
    return () => {
      mapRef.current?.off('click', handleClick);
    };
  }, [mapsReady, interactive, onPinChange]);

  // Render primary draggable pin
  const pinLat = Number(pin?.lat);
  const pinLng = Number(pin?.lng);
  const pinDraggable = Boolean(pin?.draggable ?? interactive);
  const pinTitle = pin?.title || 'Selected Location';

  useEffect(() => {
    if (!mapsReady || !mapRef.current || !window.L) return;
    const L = window.L;

    if (pin && Number.isFinite(pinLat) && Number.isFinite(pinLng)) {
      if (!pinMarkerRef.current) {
        const marker = L.marker([pinLat, pinLng], {
          draggable: pinDraggable,
          title: pinTitle,
        }).addTo(mapRef.current);

        marker.on('dragend', () => {
          const pos = marker.getLatLng();
          onPinChange?.({
            lat: Number(pos.lat.toFixed(6)),
            lng: Number(pos.lng.toFixed(6)),
            source: 'pin_drag',
          });
        });

        pinMarkerRef.current = marker;
      } else {
        pinMarkerRef.current.setLatLng([pinLat, pinLng]);
        if (pinDraggable) {
          pinMarkerRef.current.dragging?.enable();
        } else {
          pinMarkerRef.current.dragging?.disable();
        }
      }
    } else if (pinMarkerRef.current) {
      pinMarkerRef.current.remove();
      pinMarkerRef.current = null;
    }
  }, [mapsReady, pin, pinLat, pinLng, pinDraggable, pinTitle, onPinChange]);

  // Render additional markers
  useEffect(() => {
    if (!mapsReady || !mapRef.current || !window.L) return;
    const L = window.L;

    const layersMap = layersRef.current.markersById;
    const validMarkers = (markers || []).filter(
      (m) => m && Number.isFinite(Number(m.lat)) && Number.isFinite(Number(m.lng)),
    );
    const nextIds = new Set(validMarkers.map((m, idx) => String(m.id ?? idx)));

    // Remove markers that are no longer present
    for (const [id, entry] of layersMap.entries()) {
      if (!nextIds.has(id)) {
        entry.layer.remove();
        layersMap.delete(id);
      }
    }

    const buildMarkerIcon = (type) => {
      if (type === 'rider') {
        return L.divIcon({
          className: 'salo-map-div-icon',
          iconSize: [38, 38],
          iconAnchor: [19, 19],
          html: `<div class="salo-rider-vehicle-marker" title="Rider"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><path d="M15 6h3l2 5h-4l-2-5z"/><path d="M5.5 17.5L9 11h5l2.5 6.5"/><path d="M9 11l-1.5-3H5"/></svg></div>`,
        });
      }
      if (type === 'dropoff') {
        return L.divIcon({
          className: 'salo-map-div-icon',
          iconSize: [28, 28],
          iconAnchor: [14, 14],
          html: '<div class="salo-customer-glow-marker" title="Customer Location"><span class="salo-customer-glow-ring"></span><span class="salo-customer-glow-core"></span></div>',
        });
      }
      if (type === 'pickup') {
        return L.divIcon({
          className: 'salo-map-div-icon',
          iconSize: [30, 30],
          iconAnchor: [15, 15],
          html: '<div class="salo-pickup-pin-marker" title="Restaurant Pickup"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-6 9 6v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg></div>',
        });
      }
      return null;
    };

    validMarkers.forEach((item, idx) => {
      const id = String(item.id ?? idx);
      const latLng = [Number(item.lat), Number(item.lng)];
      const existing = layersMap.get(id);

      if (existing && existing.type === item.type) {
        existing.layer.setLatLng(latLng);
        return;
      }

      if (existing) {
        existing.layer.remove();
        layersMap.delete(id);
      }

      const customIcon = buildMarkerIcon(item.type);
      const marker = customIcon
        ? L.marker(latLng, { icon: customIcon, zIndexOffset: item.type === 'rider' ? 1000 : 200 }).addTo(mapRef.current)
        : L.circleMarker(latLng, {
            radius: 8,
            fillColor: MARKER_COLORS[item.type] || MARKER_COLORS.pin,
            color: '#ffffff',
            weight: 2,
            opacity: 1,
            fillOpacity: 0.95,
          }).addTo(mapRef.current);

      if (item.title || item.subtitle) {
        const safeTitle = String(item.title || '').replace(/[<>]/g, '');
        const safeSub = String(item.subtitle || '').replace(/[<>]/g, '');
        marker.bindPopup(`<strong>${safeTitle}</strong>${safeSub ? `<br/><span>${safeSub}</span>` : ''}`);
      }

      if (typeof item.onClick === 'function') {
        marker.on('click', () => item.onClick(item));
      }

      layersMap.set(id, { layer: marker, type: item.type });
    });

    layersRef.current.markers = Array.from(layersMap.values()).map((entry) => entry.layer);

    if (!route && validMarkers.length > 1 && !pin) {
      const bounds = L.latLngBounds(validMarkers.map((m) => [Number(m.lat), Number(m.lng)]));
      mapRef.current.fitBounds(bounds, { padding: [36, 36] });
    }
  }, [mapsReady, markers, route, pin]);

  // Render circles (service areas)
  useEffect(() => {
    if (!mapsReady || !mapRef.current || !window.L) return;
    const L = window.L;

    layersRef.current.circles.forEach((c) => c.remove());
    layersRef.current.circles = [];

    (circles || []).forEach((item) => {
      if (!Number.isFinite(Number(item.lat)) || !Number.isFinite(Number(item.lng))) return;
      const color = item.active ? MARKER_COLORS.activeArea : MARKER_COLORS.inactiveArea;
      const circle = L.circle([Number(item.lat), Number(item.lng)], {
        radius: Number(item.radiusMeters || 1200),
        color,
        weight: 2,
        opacity: 0.85,
        fillColor: color,
        fillOpacity: item.active ? 0.2 : 0.1,
      }).addTo(mapRef.current);

      if (typeof item.onClick === 'function') {
        circle.on('click', () => item.onClick(item));
      }
      layersRef.current.circles.push(circle);
    });
  }, [mapsReady, circles]);

  // Render polygons
  useEffect(() => {
    if (!mapsReady || !mapRef.current || !window.L) return;
    const L = window.L;

    layersRef.current.polygons.forEach((p) => p.remove());
    layersRef.current.polygons = [];

    (polygons || []).forEach((item) => {
      if (!Array.isArray(item.paths) || item.paths.length < 3) return;
      const color = item.active ? MARKER_COLORS.activeArea : MARKER_COLORS.inactiveArea;
      const polygon = L.polygon(item.paths, {
        color,
        weight: 2,
        opacity: 0.9,
        fillColor: color,
        fillOpacity: item.active ? 0.22 : 0.1,
      }).addTo(mapRef.current);

      if (typeof item.onClick === 'function') {
        polygon.on('click', () => item.onClick(item));
      }
      layersRef.current.polygons.push(polygon);
    });
  }, [mapsReady, polygons]);

  // Render delivery route using OSRM (with straight-line fallback)
  const originLat = Number(route?.origin?.lat);
  const originLng = Number(route?.origin?.lng);
  const destLat = Number(route?.destination?.lat);
  const destLng = Number(route?.destination?.lng);

  useEffect(() => {
    if (!mapsReady || !mapRef.current || !window.L) return;
    const L = window.L;

    if (layersRef.current.routeLine) {
      layersRef.current.routeLine.remove();
      layersRef.current.routeLine = null;
    }

    if (!Number.isFinite(originLat) || !Number.isFinite(originLng) || !Number.isFinite(destLat) || !Number.isFinite(destLng)) {
      return undefined;
    }

    let cancelled = false;
    const origin = { lat: originLat, lng: originLng };
    const destination = { lat: destLat, lng: destLng };
    const waypoints = Array.isArray(route?.waypoints) ? route.waypoints : [];

    fetchOsmRoute(origin, destination, waypoints)
      .then((osrm) => {
        if (cancelled || !mapRef.current) return;
        const path = osrm?.latLngs?.length
          ? osrm.latLngs
          : [
              [origin.lat, origin.lng],
              ...waypoints.filter((w) => Number.isFinite(Number(w.lat)) && Number.isFinite(Number(w.lng))).map((w) => [Number(w.lat), Number(w.lng)]),
              [destination.lat, destination.lng],
            ];

        const line = L.polyline(path, {
          color: '#d94e28',
          weight: 5,
          opacity: 0.85,
        }).addTo(mapRef.current);

        layersRef.current.routeLine = line;
        mapRef.current.fitBounds(line.getBounds(), { padding: [40, 40] });

        if (typeof onRouteCalculated === 'function') {
          onRouteCalculated({
            distanceText: osrm?.distanceText || '',
            durationText: osrm?.durationText || '',
            distanceMeters: osrm?.distanceMeters ?? null,
            durationSeconds: osrm?.durationSeconds ?? null,
            path,
          });
        }
      })
      .catch(() => {
        if (cancelled || !mapRef.current) return;
        const fallbackPath = [
          [origin.lat, origin.lng],
          ...waypoints.filter((w) => Number.isFinite(Number(w.lat)) && Number.isFinite(Number(w.lng))).map((w) => [Number(w.lat), Number(w.lng)]),
          [destination.lat, destination.lng],
        ];
        const line = L.polyline(
          fallbackPath,
          { color: '#d94e28', weight: 4, opacity: 0.75, dashArray: '6, 6' },
        ).addTo(mapRef.current);
        layersRef.current.routeLine = line;
        mapRef.current.fitBounds(line.getBounds(), { padding: [40, 40] });
        if (typeof onRouteCalculated === 'function') {
          onRouteCalculated({
            distanceText: '',
            durationText: '',
            distanceMeters: null,
            durationSeconds: null,
            path: fallbackPath,
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [mapsReady, originLat, originLng, destLat, destLng, route?.waypoints, onRouteCalculated]);

  return (
    <div
      className={`salo-shared-map-wrap ${className}`.trim()}
      style={{ height: typeof height === 'number' ? `${height}px` : height }}
      aria-label={ariaLabel}
    >
      {mapError ? (
        <div className="salo-shared-map-fallback" role="status">
          <strong>Interactive Map Unavailable</strong>
          <span>{mapError}</span>
          {pin && Number.isFinite(pinLat) && Number.isFinite(pinLng) && (
            <span>
              Selected coordinates: {pinLat.toFixed(6)}, {pinLng.toFixed(6)}
            </span>
          )}
        </div>
      ) : (
        <>
          <div ref={containerRef} className="salo-shared-map-canvas" />
          {!mapsReady && <div className="salo-shared-map-loading">Loading OpenStreetMap…</div>}
          {floatingNotice && (
            <div key={floatingNotice} className="salo-shared-map-toast" role="status">
              {floatingNotice}
            </div>
          )}
          {showCoordsChip && pin && Number.isFinite(pinLat) && Number.isFinite(pinLng) && (
            <div className="salo-shared-map-coords-chip">
              📍 {pinLat.toFixed(6)}, {pinLng.toFixed(6)}
            </div>
          )}
        </>
      )}
    </div>
  );
}
