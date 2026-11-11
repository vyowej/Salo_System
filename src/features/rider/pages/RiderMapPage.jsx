import { useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import Button from '../../../components/common/Button';
import { Card, CardBody } from '../../../components/common/Card';
import MapSlot from '../../../components/common/MapSlot';
import PageHeader from '../components/PageHeader';
import PickupPhotoDialog from '../components/PickupPhotoDialog';
import ScenarioLink from '../components/ScenarioLink';
import StateView from '../components/StateView';
import StatusBadge from '../components/StatusBadge';
import FileUploadField from '../components/FileUploadField';
import { deliveryStatuses } from '../constants/statusConfig';
import { getRiderMock } from '../mocks';
import { previewCopy } from '../mocks/ui.mock';
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

  const viewState = scenario === 'default' || scenario === 'active' || scenario === 'empty' || scenario === 'denied' || scenario === 'stale'
    ? 'ready'
    : scenario;

  const deliveryProgress = resolvedDelivery ? getDeliveryProgress(resolvedDelivery.id) : null;
  const currentDelivery = resolvedDelivery
    ? { ...resolvedDelivery, ...deliveryProgress, status: deliveryProgress?.status || resolvedDelivery.status }
    : null;
  const currentStop = currentDelivery?.status === 'picked_up' ? 'dropoff' : 'pickup';
  const challengeAction = ['accepted', 'arrived'].includes(currentDelivery?.status)
    ? 'Mark as Picked Up'
    : currentDelivery?.status === 'picked_up' ? 'Mark as Delivered' : '';
  const canShowActions = Boolean(currentDelivery && ['accepted', 'arrived', 'picked_up'].includes(currentDelivery.status));
  const canShowProof = currentDelivery?.status === 'picked_up' && (currentDelivery.proof || currentDelivery.customerPhone || currentDelivery.phone);
  const currentDeliveryId = currentDelivery?.id;

  const stops = [
    {
      key: 'pickup',
      label: 'Pickup',
      title: currentDelivery?.restaurant || 'Restaurant',
      address: currentDelivery?.restaurantAddress || currentDelivery?.pickup || 'Pickup address unavailable',
    },
    {
      key: 'dropoff',
      label: 'Drop-off',
      title: currentDelivery?.customerName || 'Customer',
      address: currentDelivery?.dropoff || 'Drop-off address unavailable',
    },
  ];

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
    const targetAddress = currentStop === 'pickup'
      ? resolvedDelivery?.restaurantAddress || resolvedDelivery?.pickup
      : resolvedDelivery?.dropoff;

    if (!targetAddress) return;
    window.open(buildNavigationUrl(targetAddress), '_blank', 'noopener,noreferrer');
  }

  return (
    <div className="rider-page-shell rider-map-page">
      <PageHeader
        title="Map & tracking"
        eyebrow="Delivery route"
        actions={(
          <ScenarioLink to="/rider/deliveries" className="rider-map-back-button" aria-label="Back" title="Back">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </ScenarioLink>
        )}
      />

      <div className="rider-map-workspace">
        <StateView
          state={viewState}
          emptyTitle="No active delivery"
          emptyMessage="No active delivery. Accept an offer to see it here."
          onRetry={() => window.location.reload()}
        >
          {!currentDelivery ? (
            <div className="rider-map-empty-shell">
              <MapSlot label="Map will appear here" />
              <div className="rider-map-empty-copy">
                <strong>No active delivery. Accept an offer to see it here.</strong>
                <Button as={ScenarioLink} to="/rider/deliveries" variant="primary">Browse deliveries</Button>
              </div>
            </div>
          ) : (
            <div className="rider-map-viewport">
              <MapSlot className="rider-map-slot" />

              <aside className="rider-map-floating-panel">
                <Card className="rider-map-detail-card">
                  <CardBody className="rider-map-detail-body">
                    <div className="rider-map-detail-header">
                      <div>
                        <p className="rider-map-title-label">Current delivery</p>
                        <h2>{currentDelivery.orderReference || currentDelivery.reference}</h2>
                        <span className="rider-map-subtitle">
                          {['accepted', 'arrived'].includes(currentDelivery.status)
                            ? 'Head to the restaurant to pick up'
                            : currentDelivery.status === 'picked_up'
                              ? 'Deliver to the customer'
                              : 'Review delivery details'}
                        </span>
                      </div>
                      <StatusBadge status={currentDelivery.status} config={deliveryStatuses} />
                    </div>

                    <details className="rider-map-details">
                      <summary>
                        <span>Order summary</span>
                        <strong>{currentDelivery.items?.length ? `${currentDelivery.items.length} items` : 'Order items'}</strong>
                      </summary>
                      <ul className="rider-map-item-list">
                        {(currentDelivery.items || []).map((item) => (
                          <li key={item.name || item.id || `${item.quantity}-${item.label}`}>
                            <span>{item.name || item.label}</span>
                            <strong>{item.quantity || item.qty || 1}</strong>
                          </li>
                        ))}
                      </ul>
                    </details>

                    <div className="rider-map-payment-line">
                      {currentDelivery.payment?.type === 'COD' || currentDelivery.paymentType === 'cod'
                        ? <>COD · Collect {formatPeso(currentDelivery.payment?.amount || currentDelivery.amount)}</>
                        : 'Paid online · Do not collect payment'}
                    </div>

                    {currentDelivery.earnings && (
                      <div className="rider-map-earnings-row">
                        <span>Delivery pay</span>
                        <strong>{formatPeso(currentDelivery.earnings)}</strong>
                      </div>
                    )}

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
                        <Button variant="secondary" fullWidth onClick={handleNavigationOpen} disabled={!currentDelivery.dropoff && !currentDelivery.restaurantAddress}>
                          Open in navigation app
                        </Button>
                      </div>
                    )}
                    {transitionError && <p className="rider-map-error">{transitionError}</p>}
                    <p className="rider-map-safety-note">{previewCopy.neverDriving}</p>
                  </CardBody>
                </Card>
              </aside>

              <div className="rider-map-stop-row" aria-label="Delivery stops">
                {stops.map((stop) => (
                  <div
                    key={stop.key}
                    className={`rider-map-stop-card is-${stop.key} ${currentStop === stop.key ? 'is-current' : ''}`}
                  >
                    <span>{stop.label}</span>
                    <strong>{stop.title}</strong>
                    <small>{stop.address}</small>
                  </div>
                ))}
              </div>
            </div>
          )}
        </StateView>
        {currentDelivery && (
          <ScenarioLink to="/rider/support" className="rider-map-report-button">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18.6A2 2 0 003.2 21h17.6a2 2 0 001.4-3L13.7 3.9a2 2 0 00-3.4 0z" />
            </svg>
            <span>Report a problem</span>
          </ScenarioLink>
        )}
      </div>

      {currentDelivery && (
        <PickupPhotoDialog
          open={pickupDialogOpen}
          onClose={closePickupDialog}
          onConfirm={confirmPickup}
        />
      )}
    </div>
  );
}
