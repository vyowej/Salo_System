import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import customerService from '../../../services/customerService';
import { getEcho, subscribeEchoConnectionStatus } from '../../../services/echoService';
import {
  isCallSoundEnabled,
  playRingToneBurst,
  showIncomingCallBrowserNotification,
  unlockCallAudio,
} from '../../../utils/ringtone';
import IncomingCallModal from './IncomingCallModal';

const ACTIVE_DELIVERY_STATUSES = new Set(['ready', 'out_for_delivery', 'arrived', 'customer_reached']);

export default function CustomerGlobalCallListener() {
  const location = useLocation();
  const [activeOrderIds, setActiveOrderIds] = useState([]);
  const [incomingCall, setIncomingCall] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const lastNotifiedCallIdRef = useRef(null);
  const prevConnRef = useRef('disconnected');
  const orderMetaRef = useRef(new Map());

  const syncActiveOrders = useCallback(async () => {
    try {
      const res = await customerService.fetchOrders({ per_page: 10 });
      const orders = Array.isArray(res?.orders) ? res.orders : [];
      const activeDeliveries = orders.filter(
        (o) =>
          String(o.fulfillment || '').toLowerCase() === 'delivery' &&
          ACTIVE_DELIVERY_STATUSES.has(String(o.order_status || '').toLowerCase()),
      );

      const ids = activeDeliveries.map((o) => Number(o.order_id));
      activeDeliveries.forEach((o) => {
        orderMetaRef.current.set(Number(o.order_id), {
          orderReference: o.order_reference,
          riderName: o.rider?.first_name ?? null,
        });
      });

      setActiveOrderIds((prev) => {
        if (prev.length === ids.length && prev.every((v, i) => v === ids[i])) {
          return prev;
        }
        return ids;
      });

      // Check arrived orders immediately for any already-pending call
      const arrived = activeDeliveries.filter(
        (o) => String(o.order_status || '').toLowerCase() === 'arrived',
      );
      let foundPending = null;
      for (const ord of arrived) {
        const detail = await customerService.fetchOrderDetail(ord.order_id).catch(() => null);
        if (detail?.pending_call) {
          foundPending = {
            orderId: Number(ord.order_id),
            orderReference: detail.order_reference || ord.order_reference,
            riderName: detail.rider?.first_name ?? ord.rider?.first_name ?? null,
            pendingCall: detail.pending_call,
            serverNow: detail.server_now,
          };
          break;
        }
      }

      setIncomingCall(foundPending);
    } catch {
      // ignore transient poll failures
    }
  }, []);

  useEffect(() => {
    syncActiveOrders();
  }, [syncActiveOrders, location.pathname]);

  // Unlock Web Audio on first user interaction whenever call sounds are permanently enabled
  useEffect(() => {
    const unlockIfEnabled = () => {
      if (isCallSoundEnabled()) {
        unlockCallAudio();
      }
    };
    window.addEventListener('pointerdown', unlockIfEnabled, { passive: true });
    window.addEventListener('keydown', unlockIfEnabled, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', unlockIfEnabled);
      window.removeEventListener('keydown', unlockIfEnabled);
    };
  }, []);

  useEffect(() => {
    return subscribeEchoConnectionStatus((status) => {
      const prev = prevConnRef.current;
      prevConnRef.current = status;
      if (status === 'connected' && prev !== 'connected') {
        syncActiveOrders();
      }
    });
  }, [syncActiveOrders]);

  const activeIdsKey = activeOrderIds.join(',');

  useEffect(() => {
    if (!activeOrderIds.length) return undefined;
    const echo = getEcho();
    if (!echo) return undefined;

    const channels = activeOrderIds.map((orderId) => {
      const ch = echo.join(`order.${orderId}`);

      ch.listen('.IncomingCallRequested', (payload) => {
        if (!payload?.call) return;
        const meta = orderMetaRef.current.get(orderId) || {};
        setError('');
        setIncomingCall({
          orderId,
          orderReference: meta.orderReference || `Order #${orderId}`,
          riderName: meta.riderName || null,
          pendingCall: payload.call,
          serverNow: payload.server_now,
        });
      });

      const clearIfMatchingOrder = () => {
        setIncomingCall((prev) => (prev && prev.orderId === orderId ? null : prev));
      };

      ch.listen('.CallAccepted', clearIfMatchingOrder);
      ch.listen('.CallDeclined', clearIfMatchingOrder);
      ch.listen('.CallTimedOut', clearIfMatchingOrder);
      ch.listen('.OrderCancelled', clearIfMatchingOrder);

      return { orderId, ch };
    });

    return () => {
      channels.forEach(({ ch }) => {
        ch.stopListening('.IncomingCallRequested');
        ch.stopListening('.CallAccepted');
        ch.stopListening('.CallDeclined');
        ch.stopListening('.CallTimedOut');
        ch.stopListening('.OrderCancelled');
      });
    };
  }, [activeIdsKey]);

  // Ringing sound, title flash, and Browser Notification while call modal is open
  useEffect(() => {
    const pendingCall = incomingCall?.pendingCall;
    if (!pendingCall) return undefined;

    if (lastNotifiedCallIdRef.current !== pendingCall.id) {
      lastNotifiedCallIdRef.current = pendingCall.id;
      showIncomingCallBrowserNotification(incomingCall?.orderReference);
    }

    const originalTitle = document.title;
    let flash = false;
    playRingToneBurst();
    const interval = setInterval(() => {
      flash = !flash;
      document.title = flash ? '(1) Incoming call' : originalTitle;
      playRingToneBurst();
    }, 1400);

    return () => {
      clearInterval(interval);
      document.title = originalTitle;
    };
  }, [incomingCall?.pendingCall, incomingCall?.orderReference]);

  const handleRespond = async (action) => {
    if (!incomingCall || busy) return;
    setBusy(true);
    setError('');
    try {
      const state = await customerService.respondToCall(incomingCall.orderId, action);
      window.dispatchEvent(
        new CustomEvent('salo:customerCallUpdated', {
          detail: { orderId: incomingCall.orderId, state },
        }),
      );
      setIncomingCall(null);
    } catch (err) {
      setError(err?.message || 'Unable to respond to call.');
      syncActiveOrders();
    } finally {
      setBusy(false);
    }
  };

  return (
    <IncomingCallModal
      pendingCall={incomingCall?.pendingCall ?? null}
      serverNow={incomingCall?.serverNow ?? null}
      riderName={incomingCall?.riderName ?? null}
      orderReference={incomingCall?.orderReference ?? null}
      busy={busy}
      error={error}
      onAccept={() => handleRespond('accept')}
      onDecline={() => handleRespond('decline')}
      onExpire={syncActiveOrders}
    />
  );
}
