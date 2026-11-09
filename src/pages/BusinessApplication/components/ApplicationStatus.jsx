import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Button from '../../../components/common/Button';
import Badge from '../../../components/common/Badge';
import { Card, CardBody } from '../../../components/common/Card';
import {
  APPLICATION_STATUS_CONFIG,
  MOCK_ADMIN_FEEDBACK_SAMPLES,
} from '../constants/applicationDefaults';
import './ApplicationStatus.css';

const TIMELINE_STEPS = [
  { key: 'submitted', label: 'Application Submitted', desc: 'Received by onboarding queue' },
  { key: 'under_review', label: 'Document & Permit Review', desc: 'Checking DTI/SEC, BIR 2303, and Mayor’s Permit' },
  { key: 'kitchen_check', label: 'Premises & Banking Verification', desc: 'Validating dispatch coordinates & account' },
  { key: 'final_decision', label: 'Decision & Activation', desc: 'Merchant agreement & storefront publishing' },
];

export default function ApplicationStatus({
  initialStatus = 'Pending Review',
  applicationData = null,
  onStatusChange,
}) {
  const navigate = useNavigate();
  const [currentStatus, setCurrentStatus] = useState(initialStatus);
  const [checklist, setChecklist] = useState(
    MOCK_ADMIN_FEEDBACK_SAMPLES.Approved.activationChecklist
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

  const statusMeta = APPLICATION_STATUS_CONFIG[currentStatus] || APPLICATION_STATUS_CONFIG['Pending Review'];
  const refNum = applicationData?.referenceNumber || 'SALO-APP-20261109-8421';
  const restName = applicationData?.businessInfo?.restaurantName || applicationData?.name || 'Barrio Fiesta Bistro';
  const submittedDate = applicationData?.submittedAt
    ? new Date(applicationData.submittedAt).toLocaleDateString()
    : new Date().toLocaleDateString();

  // Determine timeline progress based on currentStatus
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
    <div className="app-status-container">
      {/* Simulation Pill Controls */}
      <div className="status-simulation-panel">
        <div className="simulation-header">
          <span className="simulation-tag">Prototype Status Simulator</span>
          <span className="simulation-subtext">Click any of the 8 mock application states below to test:</span>
        </div>
        <div className="simulation-pills-row">
          {Object.keys(APPLICATION_STATUS_CONFIG).map((statusKey) => (
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

      {/* Main Status Header Card */}
      <Card className="status-hero-card">
        <CardBody>
          <div className="status-hero-top">
            <div className="status-hero-meta">
              <span className="status-hero-eyebrow">Restaurant Partner Application</span>
              <h2 className="status-hero-restaurant">{restName}</h2>
              <div className="status-hero-identifiers">
                <span>Ref: <strong>{refNum}</strong></span>
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

      {/* Conditional Status State Detail Modules */}

      {/* 1. Needs Correction State */}
      {currentStatus === 'Needs Correction' && (
        <div className="status-correction-card" role="alert">
          <div className="correction-icon-wrap" aria-hidden="true">⚠️</div>
          <div className="correction-body">
            <h3 className="correction-title">Action Required: Correction Requested by Compliance</h3>
            <div className="correction-meta-row">
              <span>Reviewed by: <strong>{MOCK_ADMIN_FEEDBACK_SAMPLES['Needs Correction'].reviewedBy}</strong></span>
              <span>•</span>
              <span>Section: <strong>{MOCK_ADMIN_FEEDBACK_SAMPLES['Needs Correction'].flaggedSection}</strong></span>
            </div>
            <div className="correction-feedback-box">
              <p className="correction-feedback-text">
                "{MOCK_ADMIN_FEEDBACK_SAMPLES['Needs Correction'].feedback}"
              </p>
            </div>
            <div className="correction-actions">
              <Button
                variant="primary"
                size="md"
                onClick={() => navigate('/become-a-partner?step=3')}
              >
                Edit & Resubmit Application
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

      {/* 2. Approved State */}
      {currentStatus === 'Approved' && (
        <div className="status-approved-card">
          <div className="approved-banner">
            <div className="approved-icon" aria-hidden="true">🎉</div>
            <div className="approved-copy">
              <h3 className="approved-title">Congratulations! Your Application is Approved!</h3>
              <p className="approved-desc">
                {MOCK_ADMIN_FEEDBACK_SAMPLES.Approved.note}
              </p>
              <p className="approved-notice">
                <em>Note:</em> Approval means your merchant agreement is active. Complete the 5 readiness items below before setting your store live for customer orders.
              </p>
            </div>
          </div>

          <div className="approved-checklist-section">
            <h4 className="checklist-heading">Storefront Activation Checklist:</h4>
            <div className="checklist-items">
              {checklist.map((item) => (
                <label key={item.id} className="checklist-item-row">
                  <input
                    type="checkbox"
                    checked={item.done}
                    onChange={() => handleToggleChecklist(item.id)}
                    className="wizard-checkbox-input"
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
              to="/owner"
              variant="primary"
              size="lg"
            >
              Enter Restaurant Merchant Portal →
            </Button>
          </div>
        </div>
      )}

      {/* 3. Rejected State */}
      {currentStatus === 'Rejected' && (
        <div className="status-rejected-card">
          <div className="rejected-icon" aria-hidden="true">✕</div>
          <div className="rejected-body">
            <h3 className="rejected-title">Application Status: Not Approved</h3>
            <p className="rejected-reason">
              <strong>Reason:</strong> {MOCK_ADMIN_FEEDBACK_SAMPLES.Rejected.reason}
            </p>
            <p className="rejected-details">
              {MOCK_ADMIN_FEEDBACK_SAMPLES.Rejected.details}
            </p>
            <div className="rejected-actions">
              <Button
                type="button"
                variant="outline"
                size="md"
                onClick={() => alert('Support ticket created. SALO Partner Support will contact your registered email.')}
              >
                Contact Partner Appeals
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
          <h3 className="timeline-title">Application Progress Timeline</h3>
          <div className="timeline-stepper">
            {TIMELINE_STEPS.map((step, idx) => {
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

      {/* Return Actions */}
      <div className="status-bottom-nav">
        <Button
          as={Link}
          to="/become-a-partner"
          variant="outline"
          size="md"
        >
          View / Edit Application Form
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
