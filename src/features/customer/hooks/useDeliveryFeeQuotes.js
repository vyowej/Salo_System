import { useCallback, useEffect, useMemo, useState } from 'react';
import customerService from '../../../services/customerService';
import { getCheckoutAddressId } from '../utils/checkoutAddressValidation';

const sessionQuoteCache = new Map();
const inFlightQuoteRequests = new Map();

export function clearDeliveryFeeQuoteCache() {
  sessionQuoteCache.clear();
  inFlightQuoteRequests.clear();
}

export function buildQuoteCacheKey(subOrder) {
  if (!subOrder || subOrder.fulfillment !== 'delivery') return null;
  const restaurantId = Number(subOrder.restaurantId || 0);
  const addressId = getCheckoutAddressId(subOrder.deliveryAddress);
  const lat = subOrder.deliveryAddress?.latitude ?? '';
  const lng = subOrder.deliveryAddress?.longitude ?? '';
  if (restaurantId > 0 && addressId) {
    return `${restaurantId}:addr:${addressId}:${lat},${lng}`;
  }
  if (restaurantId > 0 && lat !== '' && lng !== '') {
    return `${restaurantId}:coords:${lat},${lng}`;
  }
  return null;
}

export default function useDeliveryFeeQuotes(subOrders = [], { enabled = true } = {}) {
  const [version, setVersion] = useState(0);
  const [errorByCacheKey, setErrorByCacheKey] = useState({});

  const pendingSpecs = useMemo(() => {
    if (!enabled) return [];
    const specs = [];
    const seen = new Set();
    for (const sub of subOrders || []) {
      if (sub?.fulfillment !== 'delivery') continue;
      const cacheKey = buildQuoteCacheKey(sub);
      if (!cacheKey || seen.has(cacheKey)) continue;
      seen.add(cacheKey);
      if (!sessionQuoteCache.has(cacheKey) && !errorByCacheKey[cacheKey]) {
        specs.push({
          cacheKey,
          restaurantId: Number(sub.restaurantId),
          addressId: getCheckoutAddressId(sub.deliveryAddress),
          latitude: sub.deliveryAddress?.latitude ?? null,
          longitude: sub.deliveryAddress?.longitude ?? null,
        });
      }
    }
    return specs;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, subOrders, errorByCacheKey, version]);

  useEffect(() => {
    const handleInvalidate = () => {
      clearDeliveryFeeQuoteCache();
      setErrorByCacheKey({});
      setVersion((v) => v + 1);
    };
    window.addEventListener('salo:deliveryFeeUpdated', handleInvalidate);
    window.addEventListener('salo:authInvalid', handleInvalidate);
    return () => {
      window.removeEventListener('salo:deliveryFeeUpdated', handleInvalidate);
      window.removeEventListener('salo:authInvalid', handleInvalidate);
    };
  }, []);

  useEffect(() => {
    if (!enabled || pendingSpecs.length === 0) return undefined;
    let active = true;

    for (const spec of pendingSpecs) {
      let req = inFlightQuoteRequests.get(spec.cacheKey);
      if (!req) {
        req = customerService.getDeliveryFeeQuote({
          restaurantId: spec.restaurantId,
          fulfillment: 'delivery',
          addressId: spec.addressId,
          latitude: spec.latitude,
          longitude: spec.longitude,
        }).finally(() => {
          inFlightQuoteRequests.delete(spec.cacheKey);
        });
        inFlightQuoteRequests.set(spec.cacheKey, req);
      }

      req.then((res) => {
        if (!res) return;
        sessionQuoteCache.set(spec.cacheKey, {
          deliveryFee: Number(res.delivery_fee ?? 0),
          distanceKm: res.distance_km !== null && res.distance_km !== undefined ? Number(res.distance_km) : null,
          usedFallback: Boolean(res.used_fallback),
        });
        if (active) {
          setVersion((v) => v + 1);
        }
      }).catch((err) => {
        if (active) {
          setErrorByCacheKey((prev) => ({
            ...prev,
            [spec.cacheKey]: err?.message || 'Unable to calculate delivery fee.',
          }));
        }
      });
    }

    return () => {
      active = false;
    };
  }, [enabled, pendingSpecs]);

  const retry = useCallback(() => {
    setErrorByCacheKey({});
    setVersion((v) => v + 1);
  }, []);

  const quotesByKey = useMemo(() => {
    const map = {};
    for (const sub of subOrders || []) {
      if (sub?.fulfillment !== 'delivery') {
        map[sub.subOrderKey] = { deliveryFee: 0, distanceKm: null, usedFallback: false };
        continue;
      }
      const cacheKey = buildQuoteCacheKey(sub);
      if (cacheKey && sessionQuoteCache.has(cacheKey)) {
        map[sub.subOrderKey] = sessionQuoteCache.get(cacheKey);
      }
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subOrders, version]);

  const enrichedSubOrders = useMemo(() => {
    return (subOrders || []).map((sub) => {
      if (sub?.fulfillment !== 'delivery') {
        return { ...sub, deliveryFee: 0, distanceKm: null };
      }
      const cacheKey = buildQuoteCacheKey(sub);
      if (!cacheKey) {
        return { ...sub, deliveryFee: null, distanceKm: null };
      }
      const q = sessionQuoteCache.get(cacheKey);
      if (!q) {
        return { ...sub, deliveryFee: null, distanceKm: null };
      }
      return {
        ...sub,
        deliveryFee: q.deliveryFee,
        distanceKm: q.distanceKm,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subOrders, version]);

  const activeErrors = useMemo(() => {
    const msgs = [];
    for (const sub of subOrders || []) {
      if (sub?.fulfillment !== 'delivery') continue;
      const cacheKey = buildQuoteCacheKey(sub);
      if (cacheKey && errorByCacheKey[cacheKey]) {
        msgs.push(errorByCacheKey[cacheKey]);
      }
    }
    return msgs;
  }, [subOrders, errorByCacheKey]);

  const allDeliveryQuotesReady = useMemo(() => {
    for (const sub of subOrders || []) {
      if (sub?.fulfillment !== 'delivery') continue;
      const cacheKey = buildQuoteCacheKey(sub);
      if (!cacheKey || !sessionQuoteCache.has(cacheKey)) {
        return false;
      }
    }
    return true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subOrders, version]);

  const loading = enabled && pendingSpecs.length > 0 && activeErrors.length === 0;
  const error = activeErrors[0] || '';

  return {
    quotesByKey,
    enrichedSubOrders,
    allDeliveryQuotesReady,
    loading,
    error,
    retry,
  };
}
