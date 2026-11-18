import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Badge from '../../../components/common/Badge';
import Button from '../../../components/common/Button';
import { Card, CardBody } from '../../../components/common/Card';
import { StateView as GlobalStateView } from '../../../components/feedback';
import { SharedMap } from '../../../components/location';
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

  useEffect(() => {
    loadDelivery();
    window.addEventListener('salo:riderUpdated', loadDelivery);
    return () => window.removeEventListener('salo:riderUpdated', loadDelivery);
  }, [loadDelivery]);

  const mapState = useMemo(
    () => buildRiderMapState({ delivery, riderLocation }),
    [delivery, riderLocation],
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

  const isPickedUp = delivery.delivery_status === 'picked_up';

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
                  <Badge variant={isPickedUp ? 'info' : 'warning'} size="sm">
                    {isPickedUp ? 'Out for delivery' : 'Heading to pickup'}
                  </Badge>
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

                {(gpsError || syncError) && (
                  <div className="rider-map-error" role="alert">
                    {gpsError || syncError}
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

                <div className="rider-map-actions">
                  <Link to="/rider/deliveries/active">
                    <Button variant="primary" fullWidth>Manage delivery steps</Button>
                  </Link>
                  <Button variant="outline" size="sm" fullWidth onClick={loadDelivery}>
                    Refresh delivery
                  </Button>
                </div>
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
    </div>
  );
}
