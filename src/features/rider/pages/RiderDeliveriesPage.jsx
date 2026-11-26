import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Button from '../../../components/common/Button';
import { Card, CardBody } from '../../../components/common/Card';
import { StateView as GlobalStateView } from '../../../components/feedback';
import PageHeader from '../components/PageHeader';
import riderService from '../../../services/riderService';
import { formatDateTimeManila, formatPeso } from '../../../utils/format';

const AUTO_REFRESH_INTERVAL_MS = 15000;

export default function RiderDeliveriesPage() {
  const navigate = useNavigate();
  const [deliveries, setDeliveries] = useState([]);
  const [pagination, setPagination] = useState({ current_page: 1, last_page: 1, total: 0 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isOnline, setIsOnline] = useState(false);
  const [acceptingId, setAcceptingId] = useState(null);
  const [decliningId, setDecliningId] = useState(null);
  const [error, setError] = useState('');
  const inFlightRef = useRef(false);

  const loadAvailable = useCallback(async ({ silent = false } = {}) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError('');
    try {
      const [dash, data] = await Promise.all([
        riderService.getDashboard().catch(() => null),
        riderService.getAvailableDeliveries({ page, perPage: 15 }),
      ]);
      const online = Boolean(dash?.availability?.is_online || dash?.availability?.status === 'online');
      setIsOnline(online);
      setDeliveries(Array.isArray(data?.deliveries) ? data.deliveries : []);
      if (data?.pagination) {
        setPagination(data.pagination);
      }
    } catch (err) {
      setIsOnline(false);
      setError(err?.message || 'Unable to load available deliveries.');
      setDeliveries([]);
    } finally {
      inFlightRef.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, [page]);

  useEffect(() => {
    loadAvailable();
  }, [loadAvailable]);

  useEffect(() => {
    if (!isOnline) return undefined;

    const tick = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return;
      }
      if (inFlightRef.current) return;
      loadAvailable({ silent: true });
    };

    const intervalId = setInterval(tick, AUTO_REFRESH_INTERVAL_MS);
    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        tick();
      }
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    return () => {
      clearInterval(intervalId);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    };
  }, [isOnline, loadAvailable]);

  const handleAccept = async (orderId) => {
    if (acceptingId !== null || decliningId !== null) return;
    setAcceptingId(orderId);
    setError('');
    try {
      await riderService.acceptDelivery(orderId);
      window.dispatchEvent(new Event('salo:riderUpdated'));
      navigate('/rider/deliveries/active');
    } catch (err) {
      setError(err?.message || 'Unable to accept delivery.');
      await loadAvailable();
    } finally {
      setAcceptingId(null);
    }
  };

  const handleDecline = async (orderId) => {
    if (acceptingId !== null || decliningId !== null) return;
    setDecliningId(orderId);
    setError('');
    try {
      await riderService.declineDelivery(orderId);
      await loadAvailable({ silent: true });
    } catch (err) {
      setError(err?.message || 'Unable to decline delivery offer.');
      await loadAvailable({ silent: true });
    } finally {
      setDecliningId(null);
    }
  };

  return (
    <div className="rider-page-shell">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <PageHeader
          title="Available deliveries"
          subtitle="Ready delivery orders waiting for a rider."
          eyebrow="Dispatch"
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => loadAvailable({ silent: deliveries.length > 0 })}
          disabled={loading || refreshing}
        >
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </Button>
      </div>

      {error && (
        <div
          role="alert"
          style={{
            marginBottom: 'var(--space-4)',
            padding: 'var(--space-3) var(--space-4)',
            borderRadius: 'var(--radius-md)',
            background: 'var(--status-error-bg)',
            color: 'var(--status-error-text)',
            fontSize: 'var(--font-size-sm)',
          }}
        >
          {error}{' '}
          <Link to="/rider/go-online" style={{ color: 'inherit', fontWeight: 600 }}>
            Check availability
          </Link>
        </div>
      )}

      {loading ? (
        <GlobalStateView state="loading" title="Loading available deliveries..." />
      ) : deliveries.length === 0 ? (
        <GlobalStateView
          state="empty"
          title="No available deliveries right now"
          description={error ? 'Resolve the availability requirement above, then retry.' : 'Ready delivery orders will appear here while you are online.'}
          action={
            <Button variant="outline" size="sm" onClick={() => loadAvailable()} disabled={loading}>
              Refresh
            </Button>
          }
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {deliveries.map((item) => {
            const isAccepting = acceptingId === item.order_id;
            const isDeclining = decliningId === item.order_id;
            const actionBusy = acceptingId !== null || decliningId !== null;
            return (
              <Card key={item.order_id}>
                <CardBody style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
                  <div style={{ flex: '1 1 280px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <strong>{item.restaurant_name}</strong>
                      <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                        {item.order_reference || `#${item.order_id}`}
                      </span>
                    </div>
                    <p style={{ margin: '4px 0', fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
                      Pickup: {item.pickup_address_text}
                    </p>
                    <p style={{ margin: '4px 0', fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
                      Drop-off: {item.dropoff_address_text || 'See order details'}
                    </p>
                    <p style={{ margin: '6px 0 0', fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>
                      {item.item_count} item{item.item_count === 1 ? '' : 's'} · {item.distance_km != null ? `${Number(item.distance_km).toFixed(1)} km · ` : ''}Delivery fee {formatPeso(item.delivery_fee)} · Order total {formatPeso(item.order_total)} · Placed {formatDateTimeManila(item.placed_at)}
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={actionBusy}
                      loading={isDeclining}
                      onClick={() => handleDecline(item.order_id)}
                    >
                      {isDeclining ? 'Skipping...' : 'Decline'}
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={actionBusy}
                      loading={isAccepting}
                      onClick={() => handleAccept(item.order_id)}
                    >
                      {isAccepting ? 'Accepting...' : 'Accept'}
                    </Button>
                  </div>
                </CardBody>
              </Card>
            );
          })}

          {pagination.last_page > 1 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>
                Page {pagination.current_page} of {pagination.last_page}
              </span>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                  Previous
                </Button>
                <Button variant="outline" size="sm" disabled={page >= pagination.last_page || loading} onClick={() => setPage((p) => p + 1)}>
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
