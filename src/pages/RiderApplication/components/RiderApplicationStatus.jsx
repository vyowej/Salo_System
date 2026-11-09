import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Button from '../../../components/common/Button';
import Badge from '../../../components/common/Badge';
import { Card, CardBody } from '../../../components/common/Card';
import {
  RIDER_STATUS_CONFIG,
  MOCK_RIDER_ADMIN_FEEDBACK,
} from '../constants/riderApplicationDefaults';
import './RiderApplicationStatus.css';

const RIDER_TIMELINE_STEPS = [
  { key: 'submitted', label: 'Application Submitted', desc: 'Received by fleet intake queue' },
  { key: 'under_review', label: 'Clearance & License Verification', desc: 'Verifying identity, NBI/Police clearance, and LTO records' },
  { key: 'orientation', label: 'Safety Orientation & Equipment', desc: 'Handbook review, thermal bag issuance, and safety briefing' },
  { key: 'activation', label: 'Fleet Dispatch Activation', desc: 'Delivery zone assigned and online shift capability enabled' },
];

export default function RiderApplicationStatus({
  initialStatus = 'Pending Review',
  applicationData = null,
  onStatusChange,
}) {
  const navigate = useNavigate();
  const [currentStatus, setCurrentStatus] = useState(initialStatus);
  const [checklist, setChecklist] = useState(
    MOCK_RIDER_ADMIN_FEEDBACK.Approved.activationChecklist
  );

  useEffect(() => {
    setCurrentStatus(initialStatus);
  }, [initialStatus]);

  const handleStatusSelect = (newStatus) => {
    setCurrentStatus(newStatus);
    onStatusChange?.(newStatus);
  };

  const handleToggleChecklist = (id) => {
    setChecklist((prev) =>
      prev.map((item) => (item.id === id ? { ...item, done: !item.done } : item))
    );
  };

  const statusMeta = RIDER_STATUS_CONFIG[currentStatus] || RIDER_STATUS_CONFIG['Pending Review'];
  const refNum = applicationData?.referenceNumber || 'SALO-RIDER-20261109-7814';
  const applicantName =
    applicationData?.personal?.firstName && applicationData?.personal?.lastName
      ? `${applicationData.personal.firstName} ${applicationData.personal.lastName}`
      : applicationData?.name || 'Juan Dela Cruz';
  const deliveryMethod = applicationData?.deliveryMethod || 'motorcycle';
  const submittedDate = applicationData?.submittedAt
    ? new Date(applicationData.submittedAt).toLocaleDateString()
    : new Date().toLocaleDateString();

  const getTimelineState = (stepIndex) => {
    if (currentStatus === 'Approved') return 'completed';
    if (currentStatus === 'Rejected') {
      return stepIndex <= 1 ? 'completed' : 'rejected';
    }
    if (currentStatus === 'Needs Correction') {
      return stepIndex === 1 ? 'flagged' : stepIndex < 1 ? 'completed' : 'pending';
    }
    if (currentStatus === 'Resubmitted' || currentStatus === 'Under Review') {
      return stepIndex <= 1 ? 'completed' : stepIndex === 2 ? 'active' : 'pending';
    }
    if (currentStatus === 'Pending Review') {
      return stepIndex === 0 ? 'completed' : stepIndex === 1 ? 'active' : 'pending';
    }
    if (currentStatus === 'Pending Submission' || currentStatus === 'Draft') {
      return stepIndex === 0 ? 'active' : 'pending';
    }
    return 'pending';
  };

  return (
    <div className="rider-app-status-container">
      {/* Simulation Pill Controls */}
      <div className="status-simulation-panel">
        <div className="simulation-header">
          <span className="simulation-tag">Rider Status Simulator</span>
          <span className="simulation-subtext">Click any of the 8 mock application states below to evaluate UI:</span>
        </div>
        <div className="simulation-pills-row">
          {Object.keys(RIDER_STATUS_CONFIG).map((statusKey) => (
            <button
              key={statusKey}
              type="button"
              className={`simulation-pill ${currentStatus === statusKey ? 'active' : ''}`}
              onClick={() => handleStatusSelect(statusKey)}
            >
              {statusKey}
            </button>
          ))}
        </div>
      </div>

      {/* Main Status Hero Card */}
      <Card className="status-hero-card">
        <CardBody>
          <div className="status-hero-top">
            <div className="status-hero-meta">
              <span className="status-hero-eyebrow">Rider Partner Application</span>
              <h2 className="status-hero-restaurant">{applicantName}</h2>
              <div className="status-hero-identifiers">
                <span>Ref: <strong>{refNum}</strong></span>
                <span>•</span>
                <span>Mode: <strong style={{ textTransform: 'capitalize' }}>{deliveryMethod.replace('_', ' ')}</strong></span>
                <span>•</span>
                <span>Submitted: {submittedDate}</span>
              </div>
            </div>
            <div className="status-hero-badge-wrap">
              <Badge variant={statusMeta.variant} size="lg">
                {statusMeta.label}
              </Badge>
            </div>
          </div>
          <p className="status-hero-desc">{statusMeta.description}</p>
        </CardBody>
      </Card>

      {/* Conditional Status Detail Modules */}

      {/* 1. Needs Correction */}
      {currentStatus === 'Needs Correction' && (
        <div className="status-correction-card" role="alert">
          <div className="correction-icon-wrap" aria-hidden="true">⚠️</div>
          <div className="correction-body">
            <h3 className="correction-title">Action Required: Document Update Requested</h3>
            <div className="correction-meta-row">
              <span>Reviewed by: <strong>{MOCK_RIDER_ADMIN_FEEDBACK['Needs Correction'].reviewedBy}</strong></span>
              <span>•</span>
              <span>Flagged Section: <strong>{MOCK_RIDER_ADMIN_FEEDBACK['Needs Correction'].flaggedSection}</strong></span>
              <span>•</span>
              <span>Document: <strong>{MOCK_RIDER_ADMIN_FEEDBACK['Needs Correction'].flaggedDocument}</strong></span>
            </div>
            <div className="correction-feedback-box">
              <p className="correction-feedback-text">
                "{MOCK_RIDER_ADMIN_FEEDBACK['Needs Correction'].feedback}"
              </p>
            </div>
            <div className="correction-actions">
              <Button
                variant="primary"
                size="md"
                onClick={() => navigate('/become-a-rider?step=6')}
              >
                Edit & Resubmit Documents
              </Button>
              <Button
                as={Link}
                to="/customer"
                variant="outline"
                size="md"
              >
                Back to Dashboard
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Approved */}
      {currentStatus === 'Approved' && (
        <div className="status-approved-card">
          <div className="approved-banner">
            <div className="approved-icon" aria-hidden="true">🎉</div>
            <div className="approved-copy">
              <h3 className="approved-title">Congratulations! Your Rider Application is Approved!</h3>
              <p className="approved-desc">
                {MOCK_RIDER_ADMIN_FEEDBACK.Approved.note}
              </p>
              <p className="approved-notice">
                <em>Important Note:</em> Application approval and live delivery dispatch activation are distinct stages.
                Please complete the 5 readiness items below before going online to accept orders.
              </p>
            </div>
          </div>

          <div className="approved-checklist-section">
            <h4 className="checklist-heading">Rider Onboarding & Activation Checklist:</h4>
            <div className="checklist-items">
              {checklist.map((item) => (
                <label key={item.id} className="checklist-item-row">
                  <input
                    type="checkbox"
                    checked={item.done}
                    onChange={() => handleToggleChecklist(item.id)}
                    className="rider-checkbox-input"
                  />
                  <span className={`checklist-item-text ${item.done ? 'done' : ''}`}>
                    {item.text}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="approved-actions">
            <Button
              as={Link}
              to="/rider/activate"
              variant="primary"
              size="lg"
            >
              Proceed to Rider Account Activation →
            </Button>
          </div>
        </div>
      )}

      {/* 3. Rejected */}
      {currentStatus === 'Rejected' && (
        <div className="status-rejected-card">
          <div className="rejected-icon" aria-hidden="true">✕</div>
          <div className="rejected-body">
            <h3 className="rejected-title">Application Status: Not Approved</h3>
            <p className="rejected-reason">
              <strong>Reason:</strong> {MOCK_RIDER_ADMIN_FEEDBACK.Rejected.reason}
            </p>
            <p className="rejected-details">
              {MOCK_RIDER_ADMIN_FEEDBACK.Rejected.details}
            </p>
            <div className="rejected-actions">
              <Button
                type="button"
                variant="outline"
                size="md"
                onClick={() => alert('Support ticket logged. SALO Fleet Support will contact your registered email address.')}
              >
                Contact Fleet Appeals
              </Button>
              <Button
                as={Link}
                to="/customer"
                variant="ghost"
                size="md"
              >
                Return to Customer Dashboard
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Progress Timeline */}
      <Card className="status-timeline-card">
        <CardBody>
          <h3 className="timeline-title">Rider Application Progress Timeline</h3>
          <div className="timeline-stepper">
            {RIDER_TIMELINE_STEPS.map((step, idx) => {
              const state = getTimelineState(idx);
              return (
                <div key={step.key} className={`timeline-node ${state}`}>
                  <div className="timeline-marker">
                    {state === 'completed' ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    ) : state === 'flagged' ? (
                      '!'
                    ) : state === 'rejected' ? (
                      '✕'
                    ) : (
                      idx + 1
                    )}
                  </div>
                  <div className="timeline-content">
                    <span className="timeline-step-label">{step.label}</span>
                    <span className="timeline-step-desc">{step.desc}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </CardBody>
      </Card>

      {/* Bottom Navigation */}
      <div className="status-bottom-nav">
        <Button
          as={Link}
          to="/become-a-rider"
          variant="outline"
          size="md"
        >
          View / Edit Rider Application
        </Button>
        <Button
          as={Link}
          to="/customer"
          variant="primary"
          size="md"
        >
          Back to Customer Portal
        </Button>
      </div>
    </div>
  );
}
