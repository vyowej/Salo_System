import { useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import Button from '../../../components/common/Button';
import { Card, CardBody } from '../../../components/common/Card';
import MapSlot from '../../../components/common/MapSlot';
import PickupPhotoDialog from '../components/PickupPhotoDialog';
import ScenarioLink from '../components/ScenarioLink';
import StateView from '../components/StateView';
import StatusBadge from '../components/StatusBadge';
import FileUploadField from '../components/FileUploadField';
import { deliveryStatuses } from '../constants/statusConfig';
import { getRiderMock } from '../mocks';
import useScenario from '../hooks/useScenario';
import { advanceDeliveryStep, getDeliveryProgress, uploadPickupPhoto } from '../services/riderDeliveryService';
import { formatPeso } from '../utils/format';
import { buildNavigationUrl } from '../utils/navigation';
import './RiderMapPage.css';

function normalizeDelivery(record) {
  if (!record) return null;
  const status = record.status || 'accepted';
  const paymentType = record.payment?.type || record.paymentType || 'COD';
  const amount = record.payment?.amount || record.amount || record.earnings || '—';

  return {
    ...record,
    status,
    payment: {
      type: paymentType,
      amount,
      ...(record.payment || {}),
    },
  };
}

export default function RiderMapPage() {
  const location = useLocation();
  const scenario = useScenario();
  const query = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const selectedId = query.get('deliveryId');
  const deliveries = useMemo(() => getRiderMock('deliveries', scenario), [scenario]);
  const history = useMemo(() => getRiderMock('history', scenario), [scenario]);
  const activeDelivery = deliveries?.active ? normalizeDelivery(deliveries.active) : null;
  const historyRecords = Array.isArray(history) ? history.map(normalizeDelivery) : [];
  const candidates = [
    ...(Array.isArray(deliveries?.list) ? deliveries.list : []),
    activeDelivery,
    ...historyRecords,
  ].filter(Boolean);
  const resolvedDelivery = selectedId
    ? candidates.find(
        (item) => item.id === selectedId || item.orderReference === selectedId || item.reference === selectedId,
      ) || activeDelivery || historyRecords[0] || null
    : activeDelivery || historyRecords[0] || null;

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [transitionError, setTransitionError] = useState('');
  const [proofPreview, setProofPreview] = useState('');
  const [pickupDialogOpen, setPickupDialogOpen] = useState(false);
  const [, setDeliveryRevision] = useState(0);

  const viewState =
    scenario === 'default' ||
    scenario === 'active' ||
    scenario === 'empty' ||
    scenario === 'denied' ||
    scenario === 'stale'
      ? 'ready'
      : scenario;

  const deliveryProgress = resolvedDelivery ? getDeliveryProgress(resolvedDelivery.id) : null;
  const currentDelivery = resolvedDelivery
    ? { ...resolvedDelivery, ...deliveryProgress, status: deliveryProgress?.status || resolvedDelivery.status }
    : null;
  const currentStop = currentDelivery?.status === 'picked_up' ? 'dropoff' : 'pickup';
  const challengeAction = ['accepted', 'arrived'].includes(currentDelivery?.status)
    ? 'Mark as Picked Up'
    : currentDelivery?.status === 'picked_up'
      ? 'Mark as Delivered'
      : '';
  const canShowActions = Boolean(
    currentDelivery && ['accepted', 'arrived', 'picked_up'].includes(currentDelivery.status),
  );
  const canShowProof =
    currentDelivery?.status === 'picked_up' &&
    (currentDelivery.proof || currentDelivery.customerPhone || currentDelivery.phone);
  const currentDeliveryId = currentDelivery?.id;

  const stops = [
    {
      key: 'pickup',
      stepNum: '1',
      label: 'Pickup · Restaurant',
      title: currentDelivery?.restaurant || 'Restaurant',
      address: currentDelivery?.restaurantAddress || currentDelivery?.pickup || 'Pickup address unavailable',
      note: currentDelivery?.pickup || 'Front counter pickup · Verify order number',
      phone: currentDelivery?.restaurantPhone || '+63 2 8555 0142',
    },
    {
      key: 'dropoff',
      stepNum: '2',
      label: 'Drop-off · Customer',
      title: currentDelivery?.customerName || 'Customer',
      address: currentDelivery?.dropoff || 'Drop-off address unavailable',
      note:
        currentDelivery?.deliveryNotes ||
        currentDelivery?.instructions ||
        'Hand directly to customer or leave at designated lobby desk.',
      phone: currentDelivery?.customerPhone || currentDelivery?.phone || '+63 912 345 6789',
    },
  ];

  const stepOrder = ['accepted', 'arrived', 'picked_up', 'delivered'];
  const stepIndex = Math.max(stepOrder.indexOf(currentDelivery?.status), 0);
  const routeSteps = ['Accepted', 'At restaurant', 'Picked up', 'Delivered'];
  const routeMetrics = currentDelivery
    ? {
        eta: currentDelivery.eta || (currentStop === 'pickup' ? '8 min' : '15 min'),
        distance: currentDelivery.distance || (currentStop === 'pickup' ? '1.8 km' : '3.2 km'),
      }
    : null;

  const itemsList = Array.isArray(currentDelivery?.items) ? currentDelivery.items : [];
  const totalUnitCount = itemsList.reduce((acc, item) => acc + Number(item.quantity || item.qty || 1), 0);
  const isCod = currentDelivery?.payment?.type === 'COD' || currentDelivery?.paymentType === 'cod';

  function handleProofUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (typeof URL.createObjectURL === 'function') {
      setProofPreview(URL.createObjectURL(file));
    }
  }

  function handlePrimaryAction() {
    if (!canShowActions) return;
    setTransitionError('');
    if (['accepted', 'arrived'].includes(currentDelivery.status)) {
      setPickupDialogOpen(true);
      return;
    }
    setIsSubmitting(true);

    window.setTimeout(() => {
      setIsSubmitting(false);
      setTransitionError('Unable to update this delivery right now. Please try again.');
    }, 700);
  }

  function closePickupDialog() {
    setPickupDialogOpen(false);
  }

  async function confirmPickup(blob, capturedAt) {
    const pickupPhoto = await uploadPickupPhoto(currentDeliveryId, blob, capturedAt);
    advanceDeliveryStep(currentDeliveryId, 'picked_up', pickupPhoto);
    setDeliveryRevision((revision) => revision + 1);
  }

  function handleNavigationOpen() {
    const targetAddress =
      currentStop === 'pickup'
        ? resolvedDelivery?.restaurantAddress || resolvedDelivery?.pickup
        : resolvedDelivery?.dropoff;

    if (!targetAddress) return;
    window.open(buildNavigationUrl(targetAddress), '_blank', 'noopener,noreferrer');
  }

  return (
    <div className="rider-page-shell rider-map-page">
      <div className="rider-map-workspace">
        <StateView
          state={viewState}
          emptyTitle="No active delivery"
          emptyMessage="No active delivery. Accept an offer to see it here."
          onRetry={() => window.location.reload()}
        >
          {!currentDelivery ? (
            <div className="rider-map-empty-shell">
              <MapSlot label="Map will appear here" hasRoute={false} />
              <div className="rider-map-empty-copy">
                <strong>No active delivery. Accept an offer to see it here.</strong>
                <Button as={ScenarioLink} to="/rider/deliveries" variant="primary">
                  Browse deliveries
                </Button>
              </div>
            </div>
          ) : (
            <div className="rider-map-layout">
              {/* Left Column: Dedicated Delivery Dispatch Panel */}
              <aside className="rider-map-sidebar">
                <Card className="rider-map-detail-card">
                  <CardBody className="rider-map-detail-body">
                    {/* Top Header with Back Button, Order ID & Status */}
                    <div className="rider-map-detail-header">
                      <div className="rider-map-header-left">
                        <ScenarioLink
                          to="/rider/deliveries"
                          className="rider-map-back-button"
                          aria-label="Back to deliveries"
                          title="Back to deliveries"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                            <path d="M19 12H5M12 19l-7-7 7-7" />
                          </svg>
                        </ScenarioLink>
                        <div className="rider-map-header-titles">
                          <p className="rider-map-title-label">Current delivery</p>
                          <h2>{currentDelivery.orderReference || currentDelivery.reference}</h2>
                        </div>
                      </div>
                      <StatusBadge status={currentDelivery.status} config={deliveryStatuses} />
                    </div>

                    {/* Active Leg Subtitle & Dispatch Time */}
                    <div className="rider-map-status-banner">
                      <span className="rider-map-subtitle">
                        {['accepted', 'arrived'].includes(currentDelivery.status)
                          ? 'Head to the restaurant to pick up'
                          : currentDelivery.status === 'picked_up'
                            ? 'Proceed to customer drop-off location'
                            : 'Delivery completed'}
                      </span>
                      {currentDelivery.timestamp && (
                        <small className="rider-map-timestamp">{currentDelivery.timestamp}</small>
                      )}
                    </div>

                    {/* 4-Step Progress Tracker */}
                    <ol className="rider-map-steps" aria-label="Delivery progress">
                      {routeSteps.map((step, index) => (
                        <li
                          key={step}
                          className={index < stepIndex ? 'is-done' : index === stepIndex ? 'is-current' : ''}
                        >
                          <span aria-hidden="true">{index < stepIndex ? '✓' : index + 1}</span>
                          <small>{step}</small>
                        </li>
                      ))}
                    </ol>

                    {/* Route Timeline: Pickup & Drop-off Details */}
                    <div className="rider-map-route-timeline" aria-label="Delivery route details">
                      {stops.map((stop) => {
                        const isActiveStop = currentStop === stop.key;
                        return (
                          <div
                            key={stop.key}
                            className={`rider-map-timeline-item is-${stop.key} ${isActiveStop ? 'is-active' : ''}`}
                          >
                            <div className="rider-map-timeline-marker" aria-hidden="true">
                              {stop.stepNum}
                            </div>
                            <div className="rider-map-timeline-content">
                              <div className="rider-map-timeline-topline">
                                <span className="rider-map-timeline-label">{stop.label}</span>
                                {stop.phone && (
                                  <a
                                    className="rider-map-mini-call"
                                    href={`tel:${stop.phone.replace(/[^+\d]/g, '')}`}
                                    title={`Call ${stop.title}`}
                                  >
                                    📞 Call
                                  </a>
                                )}
                              </div>
                              <strong className="rider-map-timeline-title">{stop.title}</strong>
                              <p className="rider-map-timeline-address">{stop.address}</p>
                              {stop.note && <p className="rider-map-timeline-note">“{stop.note}”</p>}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Order Manifest & Handling Checklist */}
                    <div className="rider-map-manifest-box">
                      <div className="rider-map-manifest-header">
                        <span>Order manifest</span>
                        <strong>
                          {itemsList.length} {itemsList.length === 1 ? 'item' : 'items'} ({totalUnitCount} units)
                        </strong>
                      </div>
                      <ul className="rider-map-item-list">
                        {itemsList.map((item) => (
                          <li key={item.name || item.id || `${item.quantity}-${item.label}`}>
                            <span className="rider-map-item-qty">{item.quantity || item.qty || 1}×</span>
                            <span className="rider-map-item-name">{item.name || item.label}</span>
                          </li>
                        ))}
                      </ul>
                      <div className="rider-map-handling-tags">
                        <span className="rider-map-tag">Check thermal seal</span>
                        <span className="rider-map-tag">Keep drinks upright</span>
                        {currentDelivery.proof?.method && (
                          <span className="rider-map-tag">{currentDelivery.proof.method}</span>
                        )}
                      </div>
                    </div>

                    {/* Financial Summary: Payment & Rider Pay */}
                    <div className="rider-map-finance-grid">
                      <div className={`rider-map-finance-box ${isCod ? 'is-cod' : 'is-paid'}`}>
                        <span>{isCod ? 'COD to collect' : 'Payment status'}</span>
                        <strong>
                          {isCod
                            ? formatPeso(currentDelivery.payment?.amount || currentDelivery.amount)
                            : 'Paid online'}
                        </strong>
                        <small>{isCod ? 'Collect cash from customer' : 'Do not collect cash'}</small>
                      </div>
                      <div className="rider-map-finance-box is-earnings">
                        <span>Delivery pay</span>
                        <strong>{formatPeso(currentDelivery.earnings || 180)}</strong>
                        <small>Base + distance fee</small>
                      </div>
                    </div>

                    {canShowProof && (
                      <div className="rider-map-proof-block">
                        <FileUploadField
                          label="Recipient photo"
                          accept="image/*"
                          value={proofPreview || currentDelivery.proof?.method || 'Add photo'}
                          preview={proofPreview || currentDelivery.proof?.preview || ''}
                          onChange={handleProofUpload}
                        />
                      </div>
                    )}

                    {canShowActions && (
                      <div className="rider-map-actions">
                        <Button variant="primary" fullWidth loading={isSubmitting} onClick={handlePrimaryAction}>
                          {challengeAction}
                        </Button>
                        <Button
                          variant="secondary"
                          fullWidth
                          onClick={handleNavigationOpen}
                          disabled={!currentDelivery.dropoff && !currentDelivery.restaurantAddress}
                        >
                          Open in navigation app
                        </Button>
                      </div>
                    )}

                    {transitionError && <p className="rider-map-error">{transitionError}</p>}
                  </CardBody>
                </Card>
              </aside>

              {/* Right Column: Full-Visibility Interactive Route Map & Stop Cards */}
              <div className="rider-map-canvas-column">
                <div className="rider-map-viewport">
                  <MapSlot
                    className="rider-map-slot"
                    stage={currentStop}
                    pickup={stops[0]}
                    dropoff={stops[1]}
                    metrics={routeMetrics}
                  />
                </div>

                {/* Docked Route Checkpoints Bar Below Map */}
                <div className="rider-map-stop-row" aria-label="Delivery checkpoints">
                  {stops.map((stop) => (
                    <div
                      key={stop.key}
                      className={`rider-map-stop-card is-${stop.key} ${currentStop === stop.key ? 'is-current' : ''}`}
                    >
                      <div className="rider-map-stop-card-top">
                        <span>
                          Step {stop.stepNum} · {stop.key === 'pickup' ? 'Pickup' : 'Drop-off'}
                        </span>
                        <em className="rider-map-stop-badge">
                          {currentStop === stop.key ? 'Active leg' : stop.key === 'pickup' ? 'Origin' : 'Destination'}
                        </em>
                      </div>
                      <strong>{stop.title}</strong>
                      <small>{stop.address}</small>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </StateView>
      </div>

      {currentDelivery && (
        <PickupPhotoDialog open={pickupDialogOpen} onClose={closePickupDialog} onConfirm={confirmPickup} />
      )}
    </div>
  );
}
