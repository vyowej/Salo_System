import { useEffect, useState } from 'react';
import {
  ConfirmModal,
  Modal,
  StatusBadge,
  Tabs,
  Timeline,
  showAdminToast,
} from './index';
import { applyApplicationDecision, saveApplicationDraft } from '../mocks';
import { appendAdminAuditLog } from '../utils/auditLog';
import { formatDate, formatDateTime } from '../utils/format';

export default function ApplicationReviewModal({
  open,
  kind,
  application,
  canApprove,
  currentAdmin,
  onClose,
  onUpdated,
}) {
  const [leftTab, setLeftTab] = useState('Overview');
  const [documents, setDocuments] = useState([]);
  const [internalNotes, setInternalNotes] = useState('');
  const [previewKey, setPreviewKey] = useState('');
  const [pendingDecision, setPendingDecision] = useState(null);
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    if (!application) return;
    setLeftTab('Overview');
    setDocuments(application.documentsList || []);
    setInternalNotes(application.internalNotes || '');
    setPreviewKey(application.documentsList?.[0]?.key || '');
    setPendingDecision(null);
    setIsDirty(false);
  }, [application]);

  if (!application) return null;

  const missingDocs = documents.filter((doc) => doc.status !== 'Verified');
  const allVerified = documents.length > 0 && missingDocs.length === 0;
  const activePreview = documents.find((doc) => doc.key === previewKey) || documents[0];

  function updateDoc(docKey, patch) {
    setDocuments((prev) => {
      const next = prev.map((doc) => (doc.key === docKey ? { ...doc, ...patch } : doc));
      saveApplicationDraft(kind, application.id, { documents: next, internalNotes });
      return next;
    });
    setIsDirty(true);
  }

  function handleNotesChange(value) {
    setInternalNotes(value);
    saveApplicationDraft(kind, application.id, { documents, internalNotes: value });
    setIsDirty(true);
  }

  function executeDecision({ reason }) {
    if (!pendingDecision || !canApprove) return;
    const updated = applyApplicationDecision(kind, application.id, {
      decision: pendingDecision.type,
      documents,
      internalNotes,
      reason,
      actor: currentAdmin?.name,
    });
    if (updated) {
      appendAdminAuditLog({
        actor: currentAdmin?.name,
        actorRole: currentAdmin?.role,
        action:
          pendingDecision.type === 'approve'
            ? `Approved ${kind} application`
            : pendingDecision.type === 'revision'
              ? `Requested revision for ${kind} application`
              : `Rejected ${kind} application`,
        targetType: kind === 'restaurant' ? 'Restaurant application' : 'Rider application',
        targetId: updated.applicationId,
        previousValue: application.reviewStatus,
        newValue: updated.reviewStatus,
        reason,
      });
      showAdminToast(
        pendingDecision.type === 'approve'
          ? `${updated.name} approved and added to ${kind === 'restaurant' ? 'Restaurants' : 'Riders'}.`
          : pendingDecision.type === 'revision'
            ? `Revision request sent for ${updated.name}.`
            : `${updated.name} application rejected.`,
        pendingDecision.type === 'approve' ? 'success' : 'warning',
      );
      onUpdated?.(updated);
    }
    setPendingDecision(null);
    setIsDirty(false);
    onClose?.();
  }

  const timelineItems = (application.history || []).map((entry) => ({
    title: entry.action,
    time: formatDateTime(entry.time),
    description: `${entry.actor}: ${entry.detail}`,
  }));

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        size="wide"
        isDirty={isDirty}
        title={application.name}
        subtitle={`${application.applicationId} · Submitted ${formatDate(application.joinedDate)}`}
        headerExtra={<StatusBadge status={application.reviewStatus} />}
        footer={(
          <>
            <button type="button" className="admin-action-button" onClick={onClose}>
              Cancel
            </button>
            {canApprove && (
              <>
                <button
                  type="button"
                  className="admin-action-button"
                  onClick={() =>
                    setPendingDecision({
                      type: 'revision',
                      title: 'Request application revision',
                      message: `Send a revision message to ${application.name}. The applicant will be asked to update their submission.`,
                      confirmLabel: 'Request Revision',
                      reasonLabel: 'Message to applicant',
                      danger: false,
                    })
                  }
                >
                  Request Revision
                </button>
                <button
                  type="button"
                  className="admin-action-button admin-action-button--danger"
                  onClick={() =>
                    setPendingDecision({
                      type: 'reject',
                      title: 'Reject application',
                      message: `Reject ${application.name} (${application.applicationId}). This records an audit entry.`,
                      confirmLabel: 'Reject',
                      reasonLabel: 'Rejection reason',
                      danger: true,
                    })
                  }
                >
                  Reject
                </button>
                <button
                  type="button"
                  className="admin-action-button"
                  disabled={!allVerified}
                  title={!allVerified ? `Verify all ${missingDocs.length} remaining document(s) before approving.` : undefined}
                  onClick={() =>
                    setPendingDecision({
                      type: 'approve',
                      title: `Approve ${kind === 'restaurant' ? 'restaurant' : 'rider'} application`,
                      message: `Approve ${application.name}? This activates the ${kind} account in ${kind === 'restaurant' ? 'Restaurants' : 'Riders'}.`,
                      confirmLabel: 'Approve',
                      reasonLabel: 'Approval note',
                      danger: false,
                    })
                  }
                >
                  Approve
                </button>
              </>
            )}
          </>
        )}
      >
        <div className="admin-review-grid">
          <div className="admin-review-col">
            <Tabs
              items={['Overview', 'Documents', 'History']}
              value={leftTab}
              onChange={setLeftTab}
              label="Application review sections"
            />

            {leftTab === 'Overview' && (
              <div className="admin-record-panel">
                {kind === 'restaurant' ? (
                  <ul className="admin-detail-list">
                    <li><strong>Restaurant</strong><span>{application.name}</span></li>
                    <li><strong>Cuisine / type</strong><span>{application.cuisine}</span></li>
                    <li><strong>Owner</strong><span>{application.ownerName}</span></li>
                    <li><strong>Email</strong><span>{application.ownerEmail}</span></li>
                    <li><strong>Phone</strong><span>{application.phone}</span></li>
                    <li><strong>Address</strong><span>{application.address}</span></li>
                    <li><strong>City / zone</strong><span>{application.zone}</span></li>
                    <li><strong>Operating hours</strong><span>{application.operatingHours}</span></li>
                  </ul>
                ) : (
                  <ul className="admin-detail-list">
                    <li><strong>Applicant</strong><span>{application.name}</span></li>
                    <li><strong>Email</strong><span>{application.email}</span></li>
                    <li><strong>Phone</strong><span>{application.phone}</span></li>
                    <li><strong>City / zone</strong><span>{application.zone}</span></li>
                    <li><strong>Preferred zones</strong><span>{(application.preferredZones || []).join(', ')}</span></li>
                    <li><strong>Vehicle</strong><span>{application.vehicle}</span></li>
                    <li><strong>License number</strong><span>{application.licenseNumber}</span></li>
                    <li><strong>Emergency contact</strong><span>{application.emergencyContact}</span></li>
                  </ul>
                )}
              </div>
            )}

            {leftTab === 'Documents' && (
              <div className="admin-review-col">
                {documents.map((doc) => (
                  <div key={doc.key} className="admin-review-doc-card">
                    <div className="admin-review-check-row">
                      <strong>{doc.label}</strong>
                      <div className="admin-action-row">
                        <StatusBadge status={doc.status} />
                        <button
                          type="button"
                          className="admin-text-button"
                          onClick={() => setPreviewKey(doc.key)}
                        >
                          Preview
                        </button>
                      </div>
                    </div>
                    {doc.reason && <small className="admin-muted">Note: {doc.reason}</small>}
                  </div>
                ))}
                {activePreview && (
                  <div className="admin-review-doc-preview" role="region" aria-label="Document preview">
                    <strong>Preview · {activePreview.label}</strong>
                    <span>File: {activePreview.fileName}</span>
                    <span>Applicant: {application.name} ({application.applicationId})</span>
                    <span>Verification state: {activePreview.status}</span>
                  </div>
                )}
              </div>
            )}

            {leftTab === 'History' && (
              <div className="admin-record-panel">
                <Timeline items={timelineItems} />
              </div>
            )}
          </div>

          <div className="admin-review-col">
            <div className="admin-record-panel">
              <div className="admin-section-heading">
                <h2>Verification checklist</h2>
                <span>{documents.length - missingDocs.length}/{documents.length} verified</span>
              </div>

              <div className="admin-review-checklist">
                {documents.map((doc) => (
                  <div key={doc.key} className="admin-review-check-item">
                    <div className="admin-review-check-row">
                      <label>
                        <input
                          type="checkbox"
                          checked={doc.status === 'Verified'}
                          disabled={!canApprove}
                          onChange={(event) =>
                            updateDoc(doc.key, {
                              status: event.target.checked ? 'Verified' : 'Pending',
                              checked: event.target.checked,
                              reason: event.target.checked ? '' : doc.reason,
                            })
                          }
                        />
                        <span>{doc.label}</span>
                      </label>
                      {canApprove && (
                        <div className="admin-action-row">
                          <button
                            type="button"
                            className="admin-text-button"
                            onClick={() => updateDoc(doc.key, { status: 'Verified', checked: true, reason: '' })}
                          >
                            Verify
                          </button>
                          <button
                            type="button"
                            className="admin-text-button"
                            onClick={() => updateDoc(doc.key, { status: 'Rejected', checked: false })}
                          >
                            Flag
                          </button>
                        </div>
                      )}
                    </div>
                    {doc.status === 'Rejected' && (
                      <div className="admin-modal-field">
                        <label htmlFor={`doc-reason-${doc.key}`}>Rejection note</label>
                        <input
                          id={`doc-reason-${doc.key}`}
                          value={doc.reason || ''}
                          disabled={!canApprove}
                          placeholder="Explain why this document was flagged..."
                          onChange={(event) => updateDoc(doc.key, { reason: event.target.value })}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="admin-modal-field">
                <label htmlFor="app-internal-notes">Internal reviewer notes</label>
                <textarea
                  id="app-internal-notes"
                  value={internalNotes}
                  disabled={!canApprove}
                  placeholder="Optional internal notes for audit and team handoff..."
                  onChange={(event) => handleNotesChange(event.target.value)}
                />
              </div>

              {!allVerified && (
                <div className="admin-review-warning" role="status">
                  Approve is disabled until all required documents are verified ({missingDocs.map((d) => d.label).join(', ')}).
                </div>
              )}

              {!canApprove && (
                <p className="admin-shell-note">
                  Your role has read-only access to this application. Decision buttons are hidden.
                </p>
              )}
            </div>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        open={Boolean(pendingDecision)}
        title={pendingDecision?.title}
        message={pendingDecision?.message}
        confirmLabel={pendingDecision?.confirmLabel}
        danger={pendingDecision?.danger}
        requireReason
        reasonLabel={pendingDecision?.reasonLabel}
        onClose={() => setPendingDecision(null)}
        onConfirm={executeDecision}
      />
    </>
  );
}
