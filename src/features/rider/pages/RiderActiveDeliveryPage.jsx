import { useEffect, useMemo, useState } from 'react';
import Button from '../../../components/common/Button';
import { Card, CardBody } from '../../../components/common/Card';
import PageHeader from '../components/PageHeader';
import StateView from '../components/StateView';
import StepTracker from '../components/StepTracker';
import FileUploadField from '../components/FileUploadField';
import StatusBadge from '../components/StatusBadge';
import PaymentBadge from '../components/PaymentBadge';
import Timeline from '../components/Timeline';
import ScenarioLink from '../components/ScenarioLink';
import { deliverySteps, deliveryActionLabels } from '../constants/deliverySteps';
import { codStatuses, deliveryStatuses } from '../constants/statusConfig';
import { failureReasons, emergencyContacts } from '../constants';
import { getRiderMock } from '../mocks';
import useScenario from '../hooks/useScenario';
import './RiderActiveDeliveryPage.css';

export default function RiderActiveDeliveryPage() {
  const scenario = useScenario();
  const deliveries = useMemo(() => getRiderMock('deliveries', scenario), [scenario]);
  const delivery = deliveries?.active || null;
  const viewState = scenario === 'default' || scenario === 'active' ? 'ready' : scenario;
  const [proofOpen, setProofOpen] = useState(false);
  const [problemOpen, setProblemOpen] = useState(false);
  const [emergencyOpen, setEmergencyOpen] = useState(false);
  const [proofMethod, setProofMethod] = useState('contactless');
  const [recipientName, setRecipientName] = useState('');
  const [pin, setPin] = useState('');
  const [photo, setPhoto] = useState('');
  const [photoPreview, setPhotoPreview] = useState('');
  const [problemReason, setProblemReason] = useState(failureReasons[0]);
  const [problemDescription, setProblemDescription] = useState('');
  const [problemPhoto, setProblemPhoto] = useState('');
  const [problemSubmitted, setProblemSubmitted] = useState(false);

  const currentStep = delivery?.status || 'accepted';
  const primaryActionLabel = deliveryActionLabels[currentStep] || deliveryActionLabels.accepted;
  const canComplete = proofMethod === 'contactless' ? Boolean(photo) : Boolean(recipientName.trim());

  useEffect(() => () => {
    if (photoPreview) URL.revokeObjectURL(photoPreview);
  }, [photoPreview]);

  function chooseProofPhoto(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setPhoto(file.name);
    setPhotoPreview(URL.createObjectURL(file));
  }

  function submitProblem(event) {
    event.preventDefault();
    setProblemSubmitted(true);
  }

  return (
    <div className="rider-page-shell">
      <PageHeader title="Active delivery" subtitle="Track pickup, handoff, and delivery progress." eyebrow="Current assignment" />
      <StateView
        state={viewState}
        emptyTitle="No active delivery"
        emptyMessage="You do not have an active delivery right now."
        onRetry={() => window.location.reload()}
      >
        {!delivery ? (
          <div className="rider-empty-state-card">
            <strong>No active delivery</strong>
            <ScenarioLink to="/rider/deliveries">Browse delivery offers</ScenarioLink>
          </div>
        ) : (
          <>
            <StepTracker steps={deliverySteps} currentKey={currentStep} />
            <div className="rider-active-layout">
              <Card className="rider-active-main">
                <CardBody>
                  <div className="rider-detail-row">
                    <span>Order reference</span>
                    <strong>{delivery.orderReference}</strong>
                  </div>
                  <div className="rider-detail-row">
                    <span>Restaurant</span>
                    <strong>{delivery.restaurant}</strong>
                  </div>
                  <div className="rider-detail-row">
                    <span>Pickup address</span>
                    <strong>{delivery.pickup}</strong>
                  </div>
                  <div className="rider-detail-row">
                    <span>Customer</span>
                    <strong>{delivery.customerName}</strong>
                  </div>
                  <div className="rider-detail-row">
                    <span>Drop-off address</span>
                    <strong>{delivery.dropoff}</strong>
                  </div>
                  <div className="rider-detail-row rider-detail-block">
                    <span>Instructions</span>
                    <p>{delivery.instructions}</p>
                  </div>
                  <div className="rider-detail-row rider-detail-block">
                    <span>Payment</span>
                    <div className="rider-payment-block">
                      <strong>{delivery.payment.type}</strong>
                      <PaymentBadge status={delivery.payment.paymentStatus || 'payment_pending'} />
                      {delivery.payment.type === 'COD' && <StatusBadge status={delivery.payment.codStatus || 'not_collected'} config={codStatuses} />}
                      <span>{delivery.payment.amount}</span>
                    </div>
                  </div>
                </CardBody>
              </Card>

              <Card className="rider-active-action-card">
                <CardBody>
                  <div className="rider-action-head">
                    <span>Delivery progress</span>
                    <StatusBadge status={currentStep} config={deliveryStatuses} />
                  </div>
                  <Button variant="primary" fullWidth className="rider-action-primary">
                    {primaryActionLabel}
                  </Button>
                  <Button variant="outline" fullWidth>
                    Open in Maps
                  </Button>
                  <Button variant="outline" fullWidth>
                    Call customer
                  </Button>
                  <Button variant="ghost" fullWidth onClick={() => setProblemOpen((value) => !value)}>
                    Can't reach customer
                  </Button>
                  <Button variant="ghost" fullWidth onClick={() => setProblemOpen((value) => !value)}>
                    Report a problem
                  </Button>
                  <ScenarioLink to="/rider/safety" className="rider-safety-link">Safety guidance</ScenarioLink>
                  <Button variant="danger-outline" fullWidth onClick={() => setEmergencyOpen((value) => !value)}>
                    Emergency / Safety
                  </Button>

                  {problemOpen && (
                    <div className="rider-panel-box">
                      {problemSubmitted ? (
                        <>
                          <h4>Under Admin review</h4>
                          <p>Your problem report is shown as submitted in this local preview.</p>
                          <Timeline items={getRiderMock('support').problemReviewTimeline} />
                        </>
                      ) : (
                        <form className="rider-problem-form" onSubmit={submitProblem}>
                          <h4>Problem report</h4>
                          <div className="rider-choice-grid">
                            {failureReasons.map((reason) => (
                              <button type="button" key={reason} className={problemReason === reason ? 'rider-choice-card is-selected' : 'rider-choice-card'} aria-pressed={problemReason === reason} onClick={() => setProblemReason(reason)}>
                                {reason}
                              </button>
                            ))}
                          </div>
                          <label className="rider-field" htmlFor="rider-problem-explanation">Explanation</label>
                          <textarea id="rider-problem-explanation" rows="4" value={problemDescription} onChange={(event) => setProblemDescription(event.target.value)} placeholder="Add a short explanation for the issue." required />
                          <FileUploadField label="Attach a photo" accept="image/*" value={problemPhoto} onChange={(event) => setProblemPhoto(event.target.files?.[0]?.name || '')} maxSizeLabel="Optional supporting photo" />
                          <Button type="submit" variant="primary" size="sm" disabled={!problemDescription.trim()}>Submit report</Button>
                        </form>
                      )}
                    </div>
                  )}

                  {emergencyOpen && (
                    <div className="rider-panel-box rider-emergency-panel">
                      <h4>Emergency and safety contacts</h4>
                      {emergencyContacts.map((contact) => (
                        <a key={contact.label} href={`tel:${contact.number}`}><strong>{contact.label}</strong><span>{contact.number}</span></a>
                      ))}
                    </div>
                  )}

                  {proofOpen && (
                    <div className="rider-panel-box">
                      <h4>Proof of delivery</h4>
                      <div className="rider-segmented" role="tablist">
                        <button type="button" className={proofMethod === 'contactless' ? 'is-selected' : ''} onClick={() => setProofMethod('contactless')}>Contactless</button>
                        <button type="button" className={proofMethod === 'handover' ? 'is-selected' : ''} onClick={() => setProofMethod('handover')}>Hand-to-customer</button>
                      </div>

                      {proofMethod === 'contactless' ? (
                        <FileUploadField
                          label="Delivery photo"
                          accept="image/*"
                          value={photo}
                          preview={photoPreview}
                          onChange={chooseProofPhoto}
                          maxSizeLabel="Show the order and surroundings."
                        />
                      ) : (
                        <>
                          <label className="rider-field">
                            <span>Recipient name</span>
                            <input value={recipientName} onChange={(event) => setRecipientName(event.target.value)} placeholder="Enter recipient name" />
                          </label>
                          <label className="rider-field">
                            <span>PIN</span>
                            <input value={pin} onChange={(event) => setPin(event.target.value)} placeholder="Optional PIN" />
                          </label>
                        </>
                      )}

                      <p className="rider-helper-copy">
                        {proofMethod === 'contactless'
                          ? 'Show the order and surroundings.'
                          : 'Enter the recipient name. The PIN is optional.'}
                      </p>

                      {!canComplete && (
                        <p className="rider-helper-copy warning">Missing: {proofMethod === 'contactless' ? 'delivery photo' : 'recipient name'}.</p>
                      )}

                      <Button variant="primary" size="sm" disabled={!canComplete}>
                        Complete delivery
                      </Button>
                    </div>
                  )}

                  <div className="rider-action-row">
                    <Button variant="primary" size="sm" onClick={() => setProofOpen((value) => !value)}>
                      Complete delivery
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setProblemOpen((value) => !value)}>
                      Report issue
                    </Button>
                  </div>
                </CardBody>
              </Card>
            </div>
          </>
        )}
      </StateView>
    </div>
  );
}
