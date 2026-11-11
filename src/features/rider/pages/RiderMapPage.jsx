import { useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import Button from '../../../components/common/Button';
import { Card, CardBody } from '../../../components/common/Card';
import MapSlot from '../../../components/common/MapSlot';
import PageHeader from '../components/PageHeader';
import ScenarioLink from '../components/ScenarioLink';
import StateView from '../components/StateView';
import StatusBadge from '../components/StatusBadge';
import FileUploadField from '../components/FileUploadField';
import { deliveryStatuses } from '../constants/statusConfig';
import { getRiderMock } from '../mocks';
import { previewCopy } from '../mocks/ui.mock';
import useScenario from '../hooks/useScenario';
import { buildNavigationUrl } from '../utils/navigation';
import './RiderMapPage.css';

const progressSteps = [
  { key: 'accepted', label: 'Accepted' },
  { key: 'picked_up', label: 'Picked Up' },
  { key: 'delivered', label: 'Delivered' },
];

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
  const resolvedDelivery = useMemo(() => {
    const candidates = [
      ...(Array.isArray(deliveries?.list) ? deliveries.list : []),
      activeDelivery,
      ...historyRecords,
    ].filter(Boolean);

    if (selectedId) {
      return candidates.find(
        (item) => item.id === selectedId || item.orderReference === selectedId || item.reference === selectedId,
      ) || activeDelivery || historyRecords[0] || null;
    }

    return activeDelivery || historyRecords[0] || null;
  }, [activeDelivery, deliveries?.list, historyRecords, selectedId]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [transitionError, setTransitionError] = useState('');
  const [proofPreview, setProofPreview] = useState('');

  const viewState = scenario === 'default' || scenario === 'active' || scenario === 'empty' || scenario === 'denied' || scenario === 'stale'
    ? 'ready'
    : scenario;

  const currentStop = resolvedDelivery?.status === 'picked_up' ? 'dropoff' : 'pickup';
  const challengeAction = resolvedDelivery?.status === 'accepted' ? 'Mark as Picked Up' : resolvedDelivery?.status === 'picked_up' ? 'Mark as Delivered' : '';
  const canShowActions = Boolean(resolvedDelivery && ['accepted', 'picked_up'].includes(resolvedDelivery.status));
  const canShowProof = resolvedDelivery?.status === 'picked_up' && (resolvedDelivery.proof || resolvedDelivery.customerPhone || resolvedDelivery.phone);
  const progressIndex = progressSteps.findIndex((step) => step.key === resolvedDelivery?.status) || 0;

  const stops = [
    {
      key: 'pickup',
      label: 'Pickup',
      title: resolvedDelivery?.restaurant || 'Restaurant',
      address: resolvedDelivery?.restaurantAddress || resolvedDelivery?.pickup || 'Pickup address unavailable',
    },
    {
      key: 'dropoff',
      label: 'Drop-off',
      title: resolvedDelivery?.customerName || 'Customer',
      address: resolvedDelivery?.dropoff || 'Drop-off address unavailable',
    },
  ];

  function handleStopClick(target) {
    const element = document.getElementById(`${target}-stop`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

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
    setIsSubmitting(true);

    window.setTimeout(() => {
      setIsSubmitting(false);
      setTransitionError('Unable to update this delivery right now. Please try again.');
    }, 700);
  }

  function handleNavigationOpen() {
    const targetAddress = currentStop === 'pickup'
      ? resolvedDelivery?.restaurantAddress || resolvedDelivery?.pickup
      : resolvedDelivery?.dropoff;

    if (!targetAddress) return;
    window.open(buildNavigationUrl(targetAddress), '_blank', 'noopener,noreferrer');
  }

  return (
    <div className="rider-page-shell">
      <PageHeader title="Map & tracking" subtitle="Track the active route and keep the handoff moving." eyebrow="Delivery route" />

      <StateView
        state={viewState}
        emptyTitle="No active delivery"
        emptyMessage="No active delivery. Accept an offer to see it here."
        onRetry={() => window.location.reload()}
      >
        {!resolvedDelivery ? (
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
                      <h2>{resolvedDelivery.orderReference || resolvedDelivery.reference}</h2>
                    </div>
                    <StatusBadge status={resolvedDelivery.status} config={deliveryStatuses} />
                  </div>

                  <p className="rider-map-subtitle">
                    {resolvedDelivery.status === 'accepted'
                      ? 'Head to the restaurant to pick up'
                      : resolvedDelivery.status === 'picked_up'
                        ? 'Deliver to the customer'
                        : 'Review delivery details'}
                  </p>

                  <div className="rider-map-progress" aria-label="Delivery progress">
                    {progressSteps.map((step, index) => {
                      const isComplete = index < progressIndex;
                      const isActive = step.key === resolvedDelivery.status;
                      const marker = isComplete ? '✓' : index + 1;

                      return (
                        <div key={step.key} className={`rider-map-progress-step ${isComplete ? 'is-complete' : ''} ${isActive ? 'is-active' : ''}`}>
                          <span className="rider-map-progress-bullet" aria-hidden="true">{marker}</span>
                          <span>{step.label}</span>
                        </div>
                      );
                    })}
                  </div>

                  <div id="pickup-stop" className={`rider-map-stop-section ${currentStop === 'pickup' ? 'is-current' : ''}`}>
                    <div className="rider-map-section-header">
                      <span>Pickup</span>
                    </div>
                    <strong>{resolvedDelivery.restaurant}</strong>
                    <p>{resolvedDelivery.restaurantAddress || resolvedDelivery.pickup || 'Pickup address unavailable'}</p>
                    <small>{resolvedDelivery.orderReference || resolvedDelivery.reference}</small>
                  </div>

                  <div id="dropoff-stop" className={`rider-map-stop-section ${currentStop === 'dropoff' ? 'is-current' : ''}`}>
                    <div className="rider-map-section-header">
                      <span>Drop-off</span>
                    </div>
                    <strong>{resolvedDelivery.customerName || 'Customer'}</strong>
                    <p>{resolvedDelivery.dropoff || 'Drop-off address unavailable'}</p>
                    {resolvedDelivery.deliveryNotes && <p className="rider-map-note">{resolvedDelivery.deliveryNotes}</p>}
                    {resolvedDelivery.customerPhone && (
                      <a href={`tel:${resolvedDelivery.customerPhone.replace(/\s+/g, '')}`} className="rider-map-phone-link">
                        {resolvedDelivery.customerPhone}
                      </a>
                    )}
                  </div>

                  <div className="rider-map-section">
                    <div className="rider-map-section-header">
                      <span>Order summary</span>
                    </div>
                    <details className="rider-map-details" open>
                      <summary>{resolvedDelivery.items?.length ? `${resolvedDelivery.items.length} items` : 'Order items'}</summary>
                      <ul className="rider-map-item-list">
                        {(resolvedDelivery.items || []).map((item) => (
                          <li key={item.name || item.id || `${item.quantity}-${item.label}`}>
                            <span>{item.name || item.label}</span>
                            <strong>{item.quantity || item.qty || 1}</strong>
                          </li>
                        ))}
                      </ul>
                    </details>
                  </div>

                  <div className="rider-map-payment-block">
                    <div className={`rider-map-payment-row ${resolvedDelivery.payment?.type === 'COD' || resolvedDelivery.paymentType === 'cod' ? 'is-cod' : 'is-online'}`}>
                      <span>{resolvedDelivery.payment?.type === 'COD' || resolvedDelivery.paymentType === 'cod' ? 'COD' : 'Paid online'}</span>
                      <strong>
                        {resolvedDelivery.payment?.type === 'COD' || resolvedDelivery.paymentType === 'cod'
                          ? 'Collect from customer'
                          : 'Paid online. Do not collect payment.'}
                      </strong>
                      {resolvedDelivery.payment?.type === 'COD' || resolvedDelivery.paymentType === 'cod' ? (
                        <em>{resolvedDelivery.payment?.amount || resolvedDelivery.amount || '—'}</em>
                      ) : null}
                    </div>
                  </div>

                  {resolvedDelivery.earnings && (
                    <div className="rider-map-earnings-row">
                      <span>Delivery pay</span>
                      <strong>{resolvedDelivery.earnings}</strong>
                    </div>
                  )}

                  {canShowProof && (
                    <div className="rider-map-proof-block">
                      <div className="rider-map-section-header">
                        <span>Proof of delivery</span>
                      </div>
                      <FileUploadField
                        label="Recipient photo"
                        accept="image/*"
                        value={proofPreview || resolvedDelivery.proof?.method || 'Add photo'}
                        preview={proofPreview || resolvedDelivery.proof?.preview || ''}
                        onChange={handleProofUpload}
                      />
                      {resolvedDelivery.proof?.metadata && <small>{resolvedDelivery.proof.metadata}</small>}
                    </div>
                  )}

                  <div className="rider-map-actions">
                    <Button as={ScenarioLink} to="/rider/deliveries" variant="outline" size="sm">Back</Button>
                    {canShowActions && (
                      <Button variant="primary" fullWidth loading={isSubmitting} onClick={handlePrimaryAction} className="rider-map-primary-action">
                        {challengeAction}
                      </Button>
                    )}
                    {canShowActions && (
                      <div className="rider-map-inline-actions">
                        <button type="button" className="rider-map-link-button" onClick={handleNavigationOpen} disabled={!resolvedDelivery.dropoff && !resolvedDelivery.restaurantAddress}>
                          Open in navigation app
                        </button>
                        <button type="button" className="rider-map-link-button subtle" onClick={() => window.location.assign('/rider/support')}>
                          Report a problem
                        </button>
                      </div>
                    )}
                    {transitionError && <p className="rider-map-error">{transitionError}</p>}
                  </div>

                  <div className="rider-map-safety-note">{previewCopy.neverDriving}</div>
                </CardBody>
              </Card>
            </aside>

            <div className="rider-map-stop-row" aria-label="Delivery stops">
              {stops.map((stop) => (
                <button
                  key={stop.key}
                  type="button"
                  className={`rider-map-stop-card ${currentStop === stop.key ? 'is-current' : ''}`}
                  onClick={() => handleStopClick(stop.key)}
                >
                  <span>{stop.label}</span>
                  <strong>{stop.title}</strong>
                  <small>{stop.address}</small>
                </button>
              ))}
            </div>
          </div>
        )}
      </StateView>
    </div>
  );
}
