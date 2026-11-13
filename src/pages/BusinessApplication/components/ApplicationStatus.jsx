import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Button from '../../../components/common/Button';
import Badge from '../../../components/common/Badge';
import { Card, CardBody } from '../../../components/common/Card';
import {
  APPLICATION_STATUS_CONFIG,
  MOCK_ADMIN_FEEDBACK_SAMPLES,
} from '../constants/applicationDefaults';
import adminService from '../../../services/adminService';
import './ApplicationStatus.css';

const TIMELINE_STEPS = [
  { key: 'submitted', label: 'Application Submitted', desc: 'Received by onboarding queue' },
  { key: 'under_review', label: 'Document & Permit Review', desc: 'Checking DTI/SEC, Mayor’s Permit, and ID' },
  { key: 'kitchen_check', label: 'Premises & Banking Verification', desc: 'Validating dispatch coordinates & account' },
  { key: 'final_decision', label: 'Decision & Activation', desc: 'Merchant agreement & storefront publishing' },
];

export default function ApplicationStatus({
  initialStatus = 'Pending Review',
  applicationData = null,
  onStatusChange,
}) {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const [currentStatus, setCurrentStatus] = useState(initialStatus);
  const [checklist, setChecklist] = useState(
    MOCK_ADMIN_FEEDBACK_SAMPLES.Approved.activationChecklist
  );
  const [uploadedFile, setUploadedFile] = useState(null);
  const [uploadError, setUploadError] = useState('');

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

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadError('');
    if (file.size > 10 * 1024 * 1024) {
      setUploadError('File size exceeds 10 MB limit.');
      return;
    }
    const validMimes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
    if (!validMimes.includes(file.type)) {
      setUploadError('Please upload a PDF, JPG, or PNG document.');
      return;
    }

    setUploadedFile(file);
  };

  // Find active admin request if any
  const pendingRequests = applicationData?.requestedDocuments || [];
  const activeRequest = pendingRequests[pendingRequests.length - 1] || MOCK_ADMIN_FEEDBACK_SAMPLES['Additional Documents Required'];

  const handleSubmitRequestedDoc = () => {
    if (!uploadedFile) return;

    const fileMeta = {
      id: `req-doc-${Date.now()}`,
      name: uploadedFile.name,
      size: uploadedFile.size,
      type: uploadedFile.type,
      uploadedAt: new Date().toISOString(),
    };

    const restId = applicationData?.referenceNumber || applicationData?.id;
    if (restId) {
      try {
        adminService.submitRequestedDocument(restId, activeRequest?.id, fileMeta);
      } catch (e) {
        console.warn('Could not sync requested doc to adminService', e);
      }
    }

    setUploadedFile(null);
    handleStatusSelect('Under Review');
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
    if (currentStatus === 'Needs Correction' || currentStatus === 'Additional Documents Required') {
      return stepIndex === 1 ? 'flagged' : stepIndex < 1 ? 'completed' : 'pending';
    }
    if (currentStatus === 'Resubmitted' || currentStatus === 'Under Review') {
      return stepIndex <= 1 ? 'completed' : stepIndex === 2 ? 'active' : 'pending';
    }
    if (currentStatus === 'Pending Review' || currentStatus === 'Submitted') {
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
          <span className="simulation-subtext">Click any of the mock application states below to test:</span>
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

      {/* 1. Additional Documents Required State */}
      {currentStatus === 'Additional Documents Required' && (
        <div className="status-correction-card" role="alert" style={{ borderColor: 'var(--salo-warning, #f59e0b)' }}>
          <div className="correction-icon-wrap" aria-hidden="true" style={{ background: '#fef3c7', color: '#b45309' }}>
            📋
          </div>
          <div className="correction-body">
            <h3 className="correction-title">Action Required: Additional Supporting Documents Requested</h3>
            <div className="correction-meta-row">
              <span>Reviewed by: <strong>{activeRequest?.reviewedBy || 'SALO Compliance Reviewer'}</strong></span>
              <span>•</span>
              <span>Document: <strong>{activeRequest?.requestedDocument || activeRequest?.documentName || 'Sanitary Permit / Health Certificate'}</strong></span>
              {activeRequest?.dueDate && (
                <>
                  <span>•</span>
                  <span>Due Date: <strong>{activeRequest.dueDate}</strong></span>
                </>
              )}
            </div>

            <div className="correction-feedback-box" style={{ background: 'var(--surface-secondary, #f8f9fa)', borderLeft: '4px solid var(--salo-warning, #f59e0b)' }}>
              <p style={{ margin: '0 0 4px', fontSize: '13px', fontWeight: 600 }}>
                Reason for Request:
              </p>
              <p className="correction-feedback-text" style={{ fontStyle: 'normal', margin: '0 0 8px' }}>
                {activeRequest?.reason || 'Additional business documentation required to complete partner onboarding.'}
              </p>
              {activeRequest?.instructions && (
                <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--border-secondary, #e5e7eb)' }}>
                  <p style={{ margin: '0 0 4px', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                    Instructions from Reviewer:
                  </p>
                  <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)' }}>
                    {activeRequest.instructions}
                  </p>
                </div>
              )}
            </div>

            {/* Document Upload Interface */}
            <div style={{ margin: '16px 0', padding: '16px', background: 'var(--surface-primary, #ffffff)', border: '1px solid var(--border-primary, #e5e7eb)', borderRadius: '10px' }}>
              <h4 style={{ margin: '0 0 8px', fontSize: '14px', fontWeight: 700 }}>
                Upload Requested Document
              </h4>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 12px' }}>
                Please provide clear digital scans or photos of the requested document.
              </p>

              {uploadedFile ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--surface-secondary, #f8f9fa)', borderRadius: '8px', border: '1px solid var(--border-secondary, #e5e7eb)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '20px' }} aria-hidden="true">📄</span>
                    <div>
                      <strong style={{ fontSize: '13px', display: 'block' }}>{uploadedFile.name}</strong>
                      <small style={{ color: 'var(--text-muted)' }}>{(uploadedFile.size / 1024).toFixed(1)} KB • Ready to submit</small>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="danger-outline"
                    size="sm"
                    onClick={() => setUploadedFile(null)}
                  >
                    Remove
                  </Button>
                </div>
              ) : (
                <div
                  style={{
                    border: '2px dashed var(--border-primary, #e5e7eb)',
                    borderRadius: '8px',
                    padding: '24px 16px',
                    textAlign: 'center',
                    cursor: 'pointer',
                    background: 'var(--surface-secondary, #f8f9fa)',
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click(); }}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                    style={{ display: 'none' }}
                    onChange={handleFileSelect}
                  />
                  <p style={{ margin: '0 0 4px', fontSize: '13px', fontWeight: 600, color: 'var(--salo-orange, #f36b2b)' }}>
                    Click to select file or drag & drop
                  </p>
                  <small style={{ color: 'var(--text-muted)' }}>PDF, JPG, or PNG (Max 10 MB)</small>
                </div>
              )}

              {uploadError && (
                <p style={{ color: 'var(--salo-error)', fontSize: '12px', margin: '8px 0 0' }} role="alert">
                  {uploadError}
                </p>
              )}
            </div>

            <div className="correction-actions">
              <Button
                variant="primary"
                size="md"
                disabled={!uploadedFile}
                onClick={handleSubmitRequestedDoc}
              >
                Submit Requested Documents
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

      {/* 2. Needs Correction State */}
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

      {/* 3. Approved State */}
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

      {/* 4. Rejected State */}
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
