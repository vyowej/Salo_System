import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

function haversineKm(a, b) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function buildCumulativeRoute(path) {
  const valid = (Array.isArray(path) ? path : []).filter(
    (pt) => Array.isArray(pt) && pt.length >= 2 && Number.isFinite(Number(pt[0])) && Number.isFinite(Number(pt[1])),
  ).map((pt) => [Number(pt[0]), Number(pt[1])]);

  if (valid.length < 2) {
    return { points: valid, cumulativeKm: [0], totalKm: 0 };
  }

  const cumulativeKm = [0];
  let totalKm = 0;
  for (let i = 1; i < valid.length; i += 1) {
    totalKm += haversineKm(valid[i - 1], valid[i]);
    cumulativeKm.push(totalKm);
  }

  return { points: valid, cumulativeKm, totalKm };
}

export function interpolateAlongRoute(routeData, progress) {
  const { points, cumulativeKm, totalKm } = routeData;
  if (!points.length) return null;
  if (points.length === 1 || totalKm <= 0) {
    return { lat: points[0][0], lng: points[0][1] };
  }

  const clamped = Math.max(0, Math.min(1, progress));
  const targetKm = clamped * totalKm;

  for (let i = 1; i < points.length; i += 1) {
    if (targetKm <= cumulativeKm[i] || i === points.length - 1) {
      const segStart = cumulativeKm[i - 1];
      const segEnd = cumulativeKm[i];
      const segLen = segEnd - segStart;
      const t = segLen > 0 ? Math.max(0, Math.min(1, (targetKm - segStart) / segLen)) : 0;
      return {
        lat: points[i - 1][0] + (points[i][0] - points[i - 1][0]) * t,
        lng: points[i - 1][1] + (points[i][1] - points[i - 1][1]) * t,
      };
    }
  }

  const last = points[points.length - 1];
  return { lat: last[0], lng: last[1] };
}

/**
 * Pure visual simulation of rider vehicle movement along a route path (~1 km/s, clamped 5–10s).
 * Never mutates delivery/order status — photo proof is always required to mark Delivered.
 */
export function useDeliverySimulation({ path = [], distanceMeters = null } = {}) {
  const routeData = useMemo(() => buildCumulativeRoute(path), [path]);
  const effectiveKm = useMemo(() => {
    if (Number.isFinite(Number(distanceMeters)) && Number(distanceMeters) > 0) {
      return Number(distanceMeters) / 1000;
    }
    return routeData.totalKm;
  }, [distanceMeters, routeData.totalKm]);

  // Balanced presentation pace (~1.5s per km, clamped to 8–12 seconds — no dead air)
  const durationSec = useMemo(
    () => Math.min(12, Math.max(8, Math.round((effectiveKm || 5) * 1.5))),
    [effectiveKm],
  );

  const [isSimulating, setIsSimulating] = useState(false);
  const [hasCompletedSimulation, setHasCompletedSimulation] = useState(false);
  const [progress, setProgress] = useState(0);
  const [simulatedPosition, setSimulatedPosition] = useState(null);
  const rafRef = useRef(null);

  const stopSimulation = useCallback(() => {
    if (rafRef.current !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setIsSimulating(false);
  }, []);

  const resetSimulation = useCallback(() => {
    stopSimulation();
    setProgress(0);
    setHasCompletedSimulation(false);
    setSimulatedPosition(null);
  }, [stopSimulation]);

  const startSimulation = useCallback(() => {
    if (routeData.points.length < 2) return;
    stopSimulation();
    setHasCompletedSimulation(false);
    setProgress(0);
    setIsSimulating(true);

    const startTime = performance.now();
    const durationMs = durationSec * 1000;

    const step = (now) => {
      const elapsed = now - startTime;
      const pct = Math.min(1, elapsed / durationMs);
      const pos = interpolateAlongRoute(routeData, pct);
      if (pos) setSimulatedPosition(pos);
      setProgress(pct);

      if (pct < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        rafRef.current = null;
        setIsSimulating(false);
        setHasCompletedSimulation(true);
      }
    };

    rafRef.current = requestAnimationFrame(step);
  }, [routeData, durationSec, stopSimulation]);

  useEffect(() => () => stopSimulation(), [stopSimulation]);

  return {
    canSimulate: routeData.points.length >= 2,
    isSimulating,
    hasCompletedSimulation,
    progress,
    distanceKm: effectiveKm,
    durationSec,
    simulatedPosition,
    startSimulation,
    stopSimulation,
    resetSimulation,
  };
}
