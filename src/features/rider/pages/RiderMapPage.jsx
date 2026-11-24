import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Badge from '../../../components/common/Badge';
import Button from '../../../components/common/Button';
import { Card, CardBody } from '../../../components/common/Card';
import ReverbStatusBadge from '../../../components/common/ReverbStatusBadge';
import CameraCaptureModal from '../../../components/application/CameraCaptureModal';
import OrderChatPanel from '../../../components/connect/OrderChatPanel';
import { StateView as GlobalStateView } from '../../../components/feedback';
import { SharedMap } from '../../../components/location';
import { useDeliverySimulation } from '../../../hooks/useDeliverySimulation';
import { formatMinutesSeconds, useServerCountdown } from '../../../hooks/useServerCountdown';
import connectService from '../../../services/connectService';
import { getEcho, subscribeEchoConnectionStatus } from '../../../services/echoService';
import riderService from '../../../services/riderService';
import { formatDateTimeManila, formatPeso } from '../../../utils/format';
import { useRiderGps } from '../context/RiderGpsContext';
import { buildRiderMapState } from '../utils/riderMapData';
import './RiderMapPage.css';

export default function RiderMapPage() {
  const { location: riderLocation, gpsError, syncError, lastSyncedAt, permissionState } = useRiderGps();
  const [delivery, setDelivery] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [routeSummary, setRouteSummary] = useState(null);
  const [connectBusy, setConnectBusy] = useState(false);
  const [connectError, setConnectError] = useState('');
  const [connectToast, setConnectToast] = useState('');
  const [codConfirmed, setCodConfirmed] = useState(false);
  const [proofPhoto, setProofPhoto] = useState(null);
  const [proofPreviewUrl, setProofPreviewUrl] = useState('');
  const [proofCapturedAt, setProofCapturedAt] = useState('');
  const [cameraOpen, setCameraOpen] = useState(false);
  const [deliverBusy, setDeliverBusy] = useState(false);
  const [waitBusy, setWaitBusy] = useState(false);

  const arrivedTriggeredRef = useRef(null);
  const prevConnectionStatusRef = useRef('disconnected');

  const simulation = useDeliverySimulation({
    path: routeSummary?.path,
    distanceMeters: routeSummary?.distanceMeters,
  });

  const mergeConnectState = useCallback((state) => {
    if (!state) return;
    setDelivery((prev) => {
      if (!prev || Number(prev.order_id) !== Number(state.order_id)) return prev;
      return {
        ...prev,
        order_status: state.order_status ?? prev.order_status,
        arrived_at: state.arrived_at ?? prev.arrived_at,
        call_attempts: state.call_attempts ?? prev.call_attempts,
        max_strikes: state.max_strikes ?? prev.max_strikes,
        last_call_resolved_at: state.last_call_resolved_at ?? prev.last_call_resolved_at,
        cooldown_ends_at: state.cooldown_ends_at ?? null,
        cancel_available_at: state.cancel_available_at ?? prev.cancel_available_at,
        cancel_reason: state.cancel_reason ?? prev.cancel_reason,
        pending_call: state.pending_call ?? null,
        active_waiting_request: state.active_waiting_request ?? null,
        server_now: state.server_now ?? prev.server_now,
      };
    });
  }, []);

  const loadDelivery = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const current = await riderService.getCurrentDelivery();
      setDelivery(current);
      if (!current) {
        setRouteSummary(null);
      }
    } catch (err) {
      setError(err?.message || 'Unable to load active delivery for map.');
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshOrderState = useCallback(async (orderId) => {
    if (!orderId) return;
    try {
      const fresh = await riderService.getOrder(orderId);
      if (fresh) {
        setDelivery(fresh);
      }
    } catch {
      // fallback to full current delivery reload
      loadDelivery();
    }
  }, [loadDelivery]);

  useEffect(() => {
    loadDelivery();
    window.addEventListener('salo:riderUpdated', loadDelivery);
    return () => window.removeEventListener('salo:riderUpdated', loadDelivery);
  }, [loadDelivery]);

  // Auto-mark arrived when the route simulation reaches the drop-off
  useEffect(() => {
    if (
      !delivery ||
      delivery.order_status !== 'out_for_delivery' ||
      !simulation.hasCompletedSimulation ||
      arrivedTriggeredRef.current === delivery.order_id
    ) {
      return;
    }

    arrivedTriggeredRef.current = delivery.order_id;
    setConnectBusy(true);
    setConnectError('');
    riderService
      .arriveAtDropoff(delivery.order_id)
      .then((state) => {
        mergeConnectState(state);
        setConnectToast('Arrived at drop-off. You can now call the customer.');
      })
      .catch((err) => {
        arrivedTriggeredRef.current = null;
        setConnectError(err?.message || 'Failed to mark arrival.');
      })
      .finally(() => {
        setConnectBusy(false);
      });
  }, [delivery, simulation.hasCompletedSimulation, mergeConnectState]);

  // Subscribe to Reverb private order channel
  const activeOrderId = delivery?.order_id ?? null;
  useEffect(() => {
    if (!activeOrderId) return undefined;
    const echo = getEcho();
    if (!echo) return undefined;

    const channel = echo.join(`order.${activeOrderId}`);

    channel.listen('.CallAccepted', (payload) => {
      setDelivery((prev) => {
        if (!prev || Number(prev.order_id) !== Number(activeOrderId)) return prev;
        return {
          ...prev,
          order_status: payload?.order_status || 'customer_reached',
          pending_call: null,
          cooldown_ends_at: null,
          server_now: payload?.server_now ?? prev.server_now,
        };
      });
      setConnectToast('Customer accepted your call! Proceed with handoff.');
    });

    channel.listen('.CallDeclined', (payload) => {
      const attempts = Number(payload?.call_attempts ?? 0);
      const maxStrikes = Number(payload?.max_strikes ?? 3);
      const remaining = Math.max(0, maxStrikes - attempts);
      setDelivery((prev) => {
        if (!prev || Number(prev.order_id) !== Number(activeOrderId)) return prev;
        return {
          ...prev,
          call_attempts: attempts,
          max_strikes: maxStrikes,
          pending_call: null,
          cooldown_ends_at: payload?.cooldown_ends_at ?? null,
          server_now: payload?.server_now ?? prev.server_now,
        };
      });
      setConnectToast(`Customer declined the call. ${remaining} strike${remaining === 1 ? '' : 's'} remaining.`);
    });

    channel.listen('.CallTimedOut', (payload) => {
      const attempts = Number(payload?.call_attempts ?? 0);
      const maxStrikes = Number(payload?.max_strikes ?? 3);
      const remaining = Math.max(0, maxStrikes - attempts);
      setDelivery((prev) => {
        if (!prev || Number(prev.order_id) !== Number(activeOrderId)) return prev;
        return {
          ...prev,
          call_attempts: attempts,
          max_strikes: maxStrikes,
          pending_call: null,
          cooldown_ends_at: payload?.cooldown_ends_at ?? null,
          server_now: payload?.server_now ?? prev.server_now,
        };
      });
      setConnectToast(`No answer (timed out). ${remaining} strike${remaining === 1 ? '' : 's'} remaining.`);
    });

    channel.listen('.OrderStatusUpdated', (payload) => {
      setDelivery((prev) => {
        if (!prev || Number(prev.order_id) !== Number(activeOrderId)) return prev;
        return {
          ...prev,
          order_status: payload?.order_status ?? prev.order_status,
          arrived_at: payload?.arrived_at ?? prev.arrived_at,
          server_now: payload?.server_now ?? prev.server_now,
        };
      });
    });

    channel.listen('.OrderCancelled', (payload) => {
      setDelivery((prev) => {
        if (!prev || Number(prev.order_id) !== Number(activeOrderId)) return prev;
        return {
          ...prev,
          order_status: 'cancelled',
          cancel_reason: payload?.cancel_reason ?? 'customer_unreachable',
          pending_call: null,
          server_now: payload?.server_now ?? prev.server_now,
        };
      });
      setConnectToast('Order cancelled: customer unreachable. You are now available.');
      window.dispatchEvent(new Event('salo:riderUpdated'));
    });

    channel.listen('.WaitingRequestReceived', (payload) => {
      setDelivery((prev) => {
        if (!prev || Number(prev.order_id) !== Number(activeOrderId)) return prev;
        return {
          ...prev,
          active_waiting_request: payload?.waiting_request ?? prev.active_waiting_request,
          server_now: payload?.server_now ?? prev.server_now,
        };
      });
      setConnectToast('Customer requested a 5-minute waiting window.');
    });

    channel.listen('.WaitingRequestUpdated', (payload) => {
      const wr = payload?.waiting_request;
      setDelivery((prev) => {
        if (!prev || Number(prev.order_id) !== Number(activeOrderId)) return prev;
        const isEnded = Boolean(payload?.wait_ended) || (wr && ['declined', 'expired'].includes(wr.status));
        return {
          ...prev,
          active_waiting_request: isEnded ? null : wr ?? prev.active_waiting_request,
          server_now: payload?.server_now ?? prev.server_now,
        };
      });
      if (payload?.wait_ended) {
        setConnectToast('Waiting period ended. Normal rules resumed.');
      }
    });

    return () => {
      echo.leave(`order.${activeOrderId}`);
    };
  }, [activeOrderId]);

  // Refetch on WebSocket reconnect
  useEffect(() => {
    return subscribeEchoConnectionStatus((status) => {
      const prev = prevConnectionStatusRef.current;
      prevConnectionStatusRef.current = status;
      if (status === 'connected' && prev !== 'connected' && activeOrderId) {
        refreshOrderState(activeOrderId);
      }
    });
  }, [activeOrderId, refreshOrderState]);

  const handlePendingExpire = useCallback(() => {
    if (activeOrderId) {
      refreshOrderState(activeOrderId);
    }
  }, [activeOrderId, refreshOrderState]);

  const handleWaitExpire = useCallback(() => {
    if (activeOrderId) {
      refreshOrderState(activeOrderId);
    }
  }, [activeOrderId, refreshOrderState]);

  const pendingSecondsLeft = useServerCountdown(
    delivery?.pending_call?.expires_at,
    delivery?.server_now,
    handlePendingExpire,
  );
  const cooldownSecondsLeft = useServerCountdown(
    delivery?.cooldown_ends_at,
    delivery?.server_now,
    handlePendingExpire,
  );
  const cancelWaitSecondsLeft = useServerCountdown(
    delivery?.order_status === 'arrived' && Number(delivery?.call_attempts ?? 0) >= Number(delivery?.max_strikes ?? 3)
      ? delivery?.cancel_available_at
      : null,
    delivery?.server_now,
    handleWaitExpire,
  );
  const activeWaitRequest = delivery?.active_waiting_request;
  const waitRequestSecondsLeft = useServerCountdown(
    activeWaitRequest?.status === 'pending'
      ? activeWaitRequest?.expires_at
      : activeWaitRequest?.status === 'accepted'
        ? activeWaitRequest?.wait_ends_at
        : null,
    delivery?.server_now,
    handleWaitExpire,
  );

  const handleRespondWaitingRequest = async (action) => {
    if (!activeWaitRequest?.id || waitBusy) return;
    setWaitBusy(true);
    setConnectError('');
    try {
      const res = await connectService.respondToWaitingRequest(activeWaitRequest.id, action);
      setDelivery((prev) => (prev ? {
        ...prev,
        active_waiting_request: res?.waiting_request?.status === 'accepted' ? res.waiting_request : null,
        server_now: res?.server_now ?? prev.server_now,
      } : prev));
      setConnectToast(action === 'accept' ? 'Accepted 5-minute waiting request.' : 'Declined waiting request.');
    } catch (err) {
      setConnectError(err?.message || 'Unable to respond to waiting request.');
      refreshOrderState(delivery?.order_id);
    } finally {
      setWaitBusy(false);
    }
  };

  const handleStartCall = async () => {
    if (!delivery || connectBusy) return;
    setConnectBusy(true);
    setConnectError('');
    setConnectToast('');
    try {
      const state = await riderService.startCall(delivery.order_id);
      mergeConnectState(state);
    } catch (err) {
      if (err?.status === 429 && err?.data?.data?.cooldown_ends_at) {
        mergeConnectState({
          order_id: delivery.order_id,
          cooldown_ends_at: err.data.data.cooldown_ends_at,
          server_now: err.data.data.server_now,
        });
      }
      setConnectError(err?.message || 'Unable to start call.');
    } finally {
      setConnectBusy(false);
    }
  };

  const handleManualArrive = async () => {
    if (!delivery || connectBusy) return;
    setConnectBusy(true);
    setConnectError('');
    try {
      const state = await riderService.arriveAtDropoff(delivery.order_id);
      mergeConnectState(state);
      setConnectToast('Marked as arrived at drop-off.');
    } catch (err) {
      setConnectError(err?.message || 'Unable to mark arrived.');
    } finally {
      setConnectBusy(false);
    }
  };

  const submitDeliveryWithPhoto = async (photoFile) => {
    if (!delivery || deliverBusy || !photoFile) return;
    if (delivery.requires_cod_collection && !codConfirmed) {
      setConnectError(`Confirm exact cash collection of ${formatPeso(delivery.amount_to_collect)} first.`);
      return;
    }

    setDeliverBusy(true);
    setConnectError('');
    try {
      const collected = delivery.requires_cod_collection ? delivery.amount_to_collect : null;
      const updated = await riderService.markDelivered(delivery.order_id, collected, {
        proofPhoto: photoFile,
        recipientName: delivery.customer_name || undefined,
      });
      setDelivery(updated);
      setProofPhoto(null);
      setProofPreviewUrl('');
      setProofCapturedAt('');
      setConnectToast('Delivery completed with live photo proof!');
      window.dispatchEvent(new Event('salo:riderUpdated'));
    } catch (err) {
      setConnectError(err?.message || 'Unable to mark order delivered.');
    } finally {
      setDeliverBusy(false);
    }
  };

  const handleCameraCapture = async (_docId, payload) => {
    if (!payload?.dataUrl) return;
    try {
      const res = await fetch(payload.dataUrl);
      const blob = await res.blob();
      const file = new File([blob], payload.name || `delivery_proof_${Date.now()}.jpg`, {
        type: payload.type || 'image/jpeg',
      });
      setProofPhoto(file);
      setProofPreviewUrl(payload.previewUrl || payload.dataUrl);
      setProofCapturedAt(payload.uploadedAt || new Date().toISOString());

      // Automatically complete delivery once photo is captured (if COD is already confirmed or not COD)
      if (!delivery?.requires_cod_collection || codConfirmed) {
        await submitDeliveryWithPhoto(file);
      }
    } catch {
      setConnectError('Could not process captured photo. Please try again.');
    }
  };

  const handleMarkDelivered = async () => {
    if (!proofPhoto) {
      setCameraOpen(true);
      return;
    }
    await submitDeliveryWithPhoto(proofPhoto);
  };

  const mapState = useMemo(
    () => buildRiderMapState({
      delivery,
      riderLocation,
      simulatedPosition: simulation.isSimulating || simulation.hasCompletedSimulation ? simulation.simulatedPosition : null,
    }),
    [delivery, riderLocation, simulation.isSimulating, simulation.hasCompletedSimulation, simulation.simulatedPosition],
  );

  if (loading) {
    return (
      <div className="rider-map-page">
        <GlobalStateView state="loading" title="Loading delivery map..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rider-map-page">
        <GlobalStateView
          state="error"
          title="Could not load delivery map"
          description={error}
          onRetry={loadDelivery}
        />
      </div>
    );
  }

  if (!delivery) {
    return (
      <div className="rider-map-page">
        <div className="rider-map-empty-shell">
          <div className="rider-map-viewport">
            <SharedMap
              center={mapState.center}
              zoom={mapState.riderMarker ? 15 : 12}
              height="100%"
              markers={mapState.markers}
              showCoordsChip={Boolean(mapState.riderMarker)}
              ariaLabel="Rider live location map"
            />
          </div>
          <div className="rider-map-empty-copy">
            <h2>No active delivery</h2>
            <p>
              {mapState.riderMarker
                ? 'Showing your live GPS position. Accept a delivery to view pickup and drop-off details here.'
                : 'Accept an available delivery to view pickup and drop-off details here.'}
            </p>
            {(gpsError || syncError) && (
              <p role="alert" style={{ color: 'var(--status-error-text, #c62828)' }}>
                {gpsError || syncError}
              </p>
            )}
            <Link to="/rider/deliveries">
              <Button variant="primary" size="sm">View available deliveries</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const orderStatus = delivery.order_status;
  const isPickedUp = delivery.delivery_status === 'picked_up';
  const isArrived = orderStatus === 'arrived';
  const isCustomerReached = orderStatus === 'customer_reached';
  const isCancelled = orderStatus === 'cancelled';
  const isDelivered = orderStatus === 'delivered';
  const pendingCall = delivery.pending_call;
  const callAttempts = Number(delivery.call_attempts ?? 0);
  const maxStrikes = Number(delivery.max_strikes ?? 3);

  const badgeMeta = isCancelled
    ? { variant: 'error', label: 'Cancelled' }
    : isDelivered
      ? { variant: 'success', label: 'Delivered' }
      : isCustomerReached
        ? { variant: 'success', label: 'Customer reached' }
        : isArrived
          ? { variant: 'info', label: 'Arrived' }
          : isPickedUp
            ? { variant: 'info', label: 'Out for delivery' }
            : { variant: 'warning', label: 'Heading to pickup' };

  const callButtonDisabled =
    !isArrived ||
    connectBusy ||
    Boolean(pendingCall) ||
    cooldownSecondsLeft > 0 ||
    callAttempts >= maxStrikes;

  const callButtonLabel = !isArrived
    ? 'Call customer (Arrive first)'
    : pendingCall
      ? `Calling (${pendingSecondsLeft}s)…`
      : cooldownSecondsLeft > 0
        ? `Retry in ${cooldownSecondsLeft}s`
        : callAttempts >= maxStrikes
          ? 'Max strikes reached'
          : 'Call customer';

  return (
    <div className="rider-map-page">
      <div className="rider-map-workspace">
        <div className="rider-map-layout">
          <aside className="rider-map-sidebar">
            <Card className="rider-map-detail-card">
              <CardBody className="rider-map-detail-body">
                <div className="rider-map-detail-header">
                  <div className="rider-map-header-left">
                    <Link
                      to="/rider/deliveries/active"
                      className="rider-map-back-button"
                      aria-label="Back to active delivery"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <polyline points="15 18 9 12 15 6" />
                      </svg>
                    </Link>
                    <div className="rider-map-header-titles">
                      <p className="rider-map-title-label">Active Delivery</p>
                      <h2>{delivery.order_reference || `Order #${delivery.order_id}`}</h2>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <ReverbStatusBadge />
                    <Badge variant={badgeMeta.variant} size="sm">
                      {badgeMeta.label}
                    </Badge>
                  </div>
                </div>

                <div className="rider-map-status-banner">
                  <span className="rider-map-subtitle">
                    {routeSummary
                      ? `Est. route: ${routeSummary.distanceText} · ${routeSummary.durationText}`
                      : mapState.riderMarker
                        ? `Live GPS (${mapState.riderMarker.subtitle})`
                        : permissionState === 'denied'
                          ? 'GPS permission denied'
                          : 'Waiting for GPS fix'}
                  </span>
                  {lastSyncedAt && (
                    <span className="rider-map-timestamp">
                      Synced {formatDateTimeManila(lastSyncedAt)}
                    </span>
                  )}
                </div>

                {(gpsError || syncError || connectError) && (
                  <div className="rider-map-error" role="alert">
                    {connectError || gpsError || syncError}
                  </div>
                )}

                {connectToast && (
                  <div className="rider-connect-toast" role="status">
                    {connectToast}
                  </div>
                )}

                {isCancelled && (
                  <div className="rider-connect-cancelled-banner" role="alert">
                    <strong>Customer unreachable</strong>
                    <span>This order was cancelled after maximum contact attempts. You are now available for new deliveries.</span>
                    <Link to="/rider/deliveries" style={{ marginTop: 6 }}>
                      <Button variant="primary" size="sm" fullWidth>Back to available deliveries</Button>
                    </Link>
                  </div>
                )}

                <div className="rider-map-route-timeline">
                  <div className={`rider-map-timeline-item is-pickup ${!isPickedUp ? 'is-active' : ''}`}>
                    <div className="rider-map-timeline-marker" aria-hidden="true">1</div>
                    <div className="rider-map-timeline-content">
                      <div className="rider-map-timeline-topline">
                        <span className="rider-map-timeline-label">Pickup</span>
                      </div>
                      <p className="rider-map-timeline-title">{delivery.restaurant_name}</p>
                      <p className="rider-map-timeline-address">{delivery.pickup_address_text}</p>
                    </div>
                  </div>

                  <div className={`rider-map-timeline-item is-dropoff ${isPickedUp ? 'is-active' : ''}`}>
                    <div className="rider-map-timeline-marker" aria-hidden="true">2</div>
                    <div className="rider-map-timeline-content">
                      <div className="rider-map-timeline-topline">
                        <span className="rider-map-timeline-label">Drop-off</span>
                        {delivery.customer_phone && !isCancelled && !isDelivered && (
                          <span className="rider-map-mini-call">{delivery.customer_phone}</span>
                        )}
                      </div>
                      <p className="rider-map-timeline-title">{delivery.customer_name}</p>
                      <p className="rider-map-timeline-address">{delivery.dropoff_address_text}</p>
                      {delivery.delivery_notes && (
                        <p className="rider-map-timeline-note">Note: {delivery.delivery_notes}</p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="rider-map-finance-grid">
                  <div className="rider-map-finance-box is-cod">
                    <span>{delivery.requires_cod_collection ? 'Collect COD' : 'Payment'}</span>
                    <strong>
                      {delivery.requires_cod_collection
                        ? formatPeso(delivery.amount_to_collect)
                        : 'No COD'}
                    </strong>
                  </div>
                  <div className="rider-map-finance-box is-earnings">
                    <span>Order Total</span>
                    <strong>{formatPeso(delivery.order_total)}</strong>
                  </div>
                </div>

                {(isArrived || isCustomerReached) && (
                  <div className="rider-connect-panel">
                    <div className="rider-connect-panel-row">
                      <span>Status</span>
                      <strong>{isCustomerReached ? 'Customer reached' : 'Arrived at drop-off'}</strong>
                    </div>
                    <div className="rider-connect-panel-row">
                      <span>Customer phone</span>
                      <strong>{delivery.customer_phone || 'N/A'}</strong>
                    </div>
                    <div className="rider-connect-panel-row">
                      <span>Strikes</span>
                      <strong>{callAttempts} / {maxStrikes}</strong>
                    </div>

                    {pendingCall && (
                      <div className="rider-connect-pending-box" role="status">
                        <div className="rider-connect-pending-head">
                          <strong>Calling customer</strong>
                          <span className="rider-connect-countdown">{pendingSecondsLeft}s</span>
                        </div>
                        <p>{delivery.customer_phone || 'In-app call request'}</p>
                        <small>Waiting for customer response…</small>
                      </div>
                    )}

                    {isArrived && callAttempts >= maxStrikes && cancelWaitSecondsLeft > 0 && (
                      <div className="rider-connect-wait-box" role="status">
                        Waiting period: cancellation available in {formatMinutesSeconds(cancelWaitSecondsLeft)}
                      </div>
                    )}

                    {activeWaitRequest?.status === 'pending' && waitRequestSecondsLeft > 0 && (
                      <div className="rider-connect-wait-box" role="status">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                          <strong>Customer requested 5 min wait</strong>
                          <span>{formatMinutesSeconds(waitRequestSecondsLeft)}</span>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                          <Button variant="outline" size="sm" disabled={waitBusy} onClick={() => handleRespondWaitingRequest('decline')}>
                            Decline
                          </Button>
                          <Button variant="primary" size="sm" disabled={waitBusy} onClick={() => handleRespondWaitingRequest('accept')}>
                            Accept
                          </Button>
                        </div>
                      </div>
                    )}

                    {activeWaitRequest?.status === 'accepted' && waitRequestSecondsLeft > 0 && (
                      <div className="rider-connect-wait-box" role="status">
                        Waiting for customer: {formatMinutesSeconds(waitRequestSecondsLeft)} remaining
                      </div>
                    )}

                    {isCustomerReached && (
                      <div className="rider-connect-deliver-box">
                        {delivery.requires_cod_collection && (
                          <label className="rider-connect-cod-check">
                            <input
                              type="checkbox"
                              checked={codConfirmed}
                              onChange={(e) => setCodConfirmed(e.target.checked)}
                              disabled={deliverBusy}
                            />
                            <span>Collected exact COD ({formatPeso(delivery.amount_to_collect)})</span>
                          </label>
                        )}
                        {proofPreviewUrl && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <img
                              src={proofPreviewUrl}
                              alt="Captured delivery proof"
                              style={{ width: 52, height: 52, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border-primary)' }}
                            />
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: '0.75rem' }}>
                              <strong style={{ color: 'var(--status-success-text, #15803d)' }}>Live photo captured</strong>
                              {proofCapturedAt && <span>{formatDateTimeManila(proofCapturedAt)}</span>}
                            </div>
                          </div>
                        )}
                        <Button
                          variant="secondary"
                          size="sm"
                          fullWidth
                          disabled={deliverBusy || (delivery.requires_cod_collection && !codConfirmed)}
                          onClick={() => setCameraOpen(true)}
                        >
                          {deliverBusy
                            ? 'Completing delivery…'
                            : proofPhoto
                              ? 'Retake live photo'
                              : 'Take live photo & deliver'}
                        </Button>
                        {proofPhoto && (
                          <Button
                            variant="primary"
                            fullWidth
                            onClick={handleMarkDelivered}
                            disabled={deliverBusy || (delivery.requires_cod_collection && !codConfirmed)}
                          >
                            {deliverBusy ? 'Completing delivery…' : 'Mark delivered'}
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                )}

                <div className="rider-map-actions">
                  {delivery.delivery_status === 'accepted' && (
                    <Button
                      variant="primary"
                      size="sm"
                      fullWidth
                      disabled={connectBusy}
                      onClick={async () => {
                        setConnectBusy(true);
                        setConnectError('');
                        try {
                          const updated = await riderService.markPickedUp(delivery.order_id);
                          setDelivery(updated);
                          setConnectToast('Order marked as picked up (Out for delivery).');
                          window.dispatchEvent(new Event('salo:riderUpdated'));
                        } catch (err) {
                          setConnectError(err?.message || 'Unable to mark picked up.');
                        } finally {
                          setConnectBusy(false);
                        }
                      }}
                    >
                      {connectBusy ? 'Updating…' : 'Mark picked up'}
                    </Button>
                  )}

                  {['ready', 'out_for_delivery'].includes(orderStatus) && simulation.canSimulate && (
                    <Button
                      variant="secondary"
                      size="sm"
                      fullWidth
                      disabled={connectBusy}
                      onClick={simulation.isSimulating ? simulation.stopSimulation : simulation.startSimulation}
                    >
                      {simulation.isSimulating
                        ? `Simulating route (${Math.round(simulation.progress * 100)}%) — Stop`
                        : simulation.hasCompletedSimulation
                          ? `Replay route simulation (~${simulation.durationSec}s)`
                          : `Simulate route (~${simulation.durationSec}s)`}
                    </Button>
                  )}

                  {orderStatus === 'out_for_delivery' && !simulation.canSimulate && (
                    <Button
                      variant="secondary"
                      size="sm"
                      fullWidth
                      disabled={connectBusy}
                      onClick={handleManualArrive}
                    >
                      {connectBusy ? 'Marking arrived…' : 'Mark arrived at drop-off'}
                    </Button>
                  )}

                  {!isCancelled && !isDelivered && !isCustomerReached && (
                    <Button
                      variant="primary"
                      size="sm"
                      fullWidth
                      disabled={callButtonDisabled}
                      onClick={handleStartCall}
                    >
                      {connectBusy ? 'Sending call…' : callButtonLabel}
                    </Button>
                  )}

                  <Link to="/rider/deliveries/active">
                    <Button variant="outline" size="sm" fullWidth>Manage delivery steps</Button>
                  </Link>
                  <Button variant="outline" size="sm" fullWidth onClick={() => refreshOrderState(delivery.order_id)}>
                    Refresh delivery
                  </Button>
                </div>

                <OrderChatPanel
                  orderId={delivery.order_id}
                  viewerRole="rider"
                  initialUnreadCount={delivery.unread_messages_count ?? 0}
                  isOrderEnded={isCancelled || isDelivered}
                />
              </CardBody>
            </Card>
          </aside>

          <section className="rider-map-canvas-column" aria-label="Delivery map">
            <div className="rider-map-viewport">
              <SharedMap
                center={mapState.center}
                zoom={15}
                height="100%"
                markers={mapState.markers}
                route={mapState.route}
                onRouteCalculated={setRouteSummary}
                showCoordsChip={Boolean(mapState.riderMarker)}
                floatingNotice={
                  isArrived
                    ? 'Arrived at drop-off — use Call customer to reach the customer.'
                    : simulation.isSimulating
                      ? 'Visual route simulation active — arrival will trigger automatically at drop-off.'
                      : ''
                }
                ariaLabel="Active delivery map"
              />
            </div>

            {mapState.missingCoordinatesNotice && (
              <p role="note" style={{ margin: '8px 0 0', fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
                {mapState.missingCoordinatesNotice}
              </p>
            )}
          </section>
        </div>
      </div>

      <CameraCaptureModal
        isOpen={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={handleCameraCapture}
        docConfig={{
          id: 'delivery_proof',
          title: 'Live Proof of Delivery',
          description: 'Take a live photo at handoff. Timestamp is recorded automatically for admin review.',
        }}
      />
    </div>
  );
}
