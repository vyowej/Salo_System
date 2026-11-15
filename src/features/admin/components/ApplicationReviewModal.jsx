import { useEffect, useState } from 'react';
import {
  ConfirmModal,
  Modal,
  StatusBadge,
  Tabs,
  Timeline,
  showAdminToast,
} from './index';
import adminApiService from '../../../services/adminApiService';
import { mapBackendApplicationStatus } from '../../../services/applicationService';
import { formatDate, formatDateTime } from '../utils/format';

const API_ORIGIN = (
  import.meta.env.VITE_API_URL ||
  import.meta.env.VITE_API_BASE_URL ||
  'http://localhost:8000/api'
).replace(/\/api\/?$/, '');

export default function ApplicationReviewModal({
  open,
  kind,
  application,
  canApprove,
  onClose,
  onUpdated,
}) {
  const [detail, setDetail] = useState(application);
  const [leftTab, setLeftTab] = useState('Overview');
  const [previewId, setPreviewId] = useState(null);
  const [pendingDecision, setPendingDecision] = useState(null);
  const [pendingFlagDoc, setPendingFlagDoc] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setDetail(application);
    setLeftTab('Overview');
    setPreviewId(application?.documents?.[0]?.document_id || null);
    setPendingDecision(null);
    setPendingFlagDoc(null);
  }, [application]);

  if (!detail) return null;

  const appId = kind === 'restaurant' ? detail.restaurant_application_id : detail.rider_application_id;
  const displayName = kind === 'restaurant'
    ? detail.restaurant_name
    : `${detail.legal_first_name || ''} ${detail.legal_last_name || ''}`.trim();
  const displayStatus = mapBackendApplicationStatus(detail.application_status) || detail.application_status;
  const documents = detail.documents || [];
  const verifiedCount = documents.filter((doc) => doc.document_status === 'verified').length;
  const missingDocsCount = documents.length - verifiedCount;
  const allVerified = documents.length > 0 && missingDocsCount === 0;
  const activePreview = documents.find((doc) => doc.document_id === previewId) || documents[0];

  async function handleDocumentReview(doc, status, reviewNote = '') {
    if (!canApprove || busy) return;
    setBusy(true);
    try {
      const updated = await adminApiService.reviewDocument(kind, appId, doc.document_id, {
        status,
        reviewNote,
      });
      setDetail(updated);
      showAdminToast(`Document marked as ${status}.`, status === 'verified' ? 'success' : 'warning');
      onUpdated?.(updated);
    } catch (err) {
      showAdminToast(err?.message || 'Unable to update document status.', 'danger');
    } finally {
      setBusy(false);
    }
  }

  async function executeDecision({ reason }) {
    if (!pendingDecision || !canApprove || busy) return;
    setBusy(true);
    try {
      const decisionMap = {
        approve: 'approve',
        reject: 'reject',
        revision: 'needs_correction',
      };
      const updated = await adminApiService.decideApplication(kind, appId, {
        decision: decisionMap[pendingDecision.type],
        note: reason,
      });
      showAdminToast(
        pendingDecision.type === 'approve'
          ? `${displayName} approved and activated.`
          : pendingDecision.type === 'revision'
            ? `Revision request sent for ${displayName}.`
            : `${displayName} application rejected.`,
        pendingDecision.type === 'approve' ? 'success' : 'warning',
      );
      onUpdated?.(updated);
      setPendingDecision(null);
      onClose?.();
    } catch (err) {
      showAdminToast(err?.message || 'Unable to save application decision.', 'danger');
    } finally {
      setBusy(false);
    }
  }

  const timelineItems = (detail.history || []).map((entry) => ({
    title: entry.action,
    time: formatDateTime(entry.created_at),
    description: entry.reason ? `${entry.actor}: ${entry.reason}` : entry.actor,
  }));

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        size="wide"
        title={displayName}
        subtitle={`${detail.reference_number} · Submitted ${formatDate(detail.submitted_at)}`}
        headerExtra={<StatusBadge status={displayStatus} />}
        footer={(
          <>
            <button type="button" className="admin-action-button" onClick={onClose} disabled={busy}>
              Close
            </button>
            {canApprove && (
              <>
                <button
                  type="button"
                  className="admin-action-button"
                  disabled={busy}
                  onClick={() =>
                    setPendingDecision({
                      type: 'revision',
                      title: 'Request application revision',
                      message: `Send a correction message to ${displayName}.`,
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
                  disabled={busy}
                  onClick={() =>
                    setPendingDecision({
                      type: 'reject',
                      title: 'Reject application',
                      message: `Reject ${displayName} (${detail.reference_number}). This records an audit entry.`,
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
                  disabled={!allVerified || busy}
                  title={!allVerified ? `Verify all ${missingDocsCount} remaining document(s) before approving.` : undefined}
                  onClick={() =>
                    setPendingDecision({
                      type: 'approve',
                      title: `Approve ${kind === 'restaurant' ? 'restaurant' : 'rider'} application`,
                      message: `Approve ${displayName}? This activates the ${kind} account.`,
                      confirmLabel: 'Approve',
                      reasonLabel: 'Approval note (optional)',
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
                    <li><strong>Restaurant</strong><span>{detail.restaurant_name}</span></li>
                    <li><strong>Business type</strong><span>{detail.business_type}</span></li>
                    <li><strong>Ownership</strong><span>{detail.ownership_structure}</span></li>
                    <li><strong>Representative</strong><span>{`${detail.legal_first_name} ${detail.legal_last_name}`}</span></li>
                    <li><strong>Email</strong><span>{detail.contact_email}</span></li>
                    <li><strong>Phone</strong><span>{detail.contact_phone}</span></li>
                    <li><strong>Address</strong><span>{[detail.address?.street, detail.address?.barangay, detail.address?.city, detail.address?.province].filter(Boolean).join(', ')}</span></li>
                    {detail.logo_image && (
                      <li>
                        <strong>Logo</strong>
                        <img src={`${API_ORIGIN}${detail.logo_image}`} alt="Restaurant logo" style={{ maxHeight: 48, borderRadius: 6 }} />
                      </li>
                    )}
                    {detail.cover_image && (
                      <li>
                        <strong>Cover photo</strong>
                        <img src={`${API_ORIGIN}${detail.cover_image}`} alt="Restaurant cover" style={{ maxHeight: 64, borderRadius: 6 }} />
                      </li>
                    )}
                  </ul>
                ) : (
                  <ul className="admin-detail-list">
                    <li><strong>Applicant</strong><span>{displayName}</span></li>
                    <li><strong>Email</strong><span>{detail.contact_email}</span></li>
                    <li><strong>Phone</strong><span>{detail.contact_phone}</span></li>
                    <li><strong>Base city</strong><span>{detail.base_city}</span></li>
                    <li><strong>Address</strong><span>{[detail.address?.street, detail.address?.barangay, detail.address?.city, detail.address?.province].filter(Boolean).join(', ')}</span></li>
                    <li><strong>Vehicle</strong><span>{[detail.vehicle_type, detail.vehicle_brand, detail.vehicle_model, detail.plate_number].filter(Boolean).join(' · ')}</span></li>
                    <li><strong>Gov ID type</strong><span>{detail.gov_id_type}</span></li>
                    <li><strong>Emergency contact</strong><span>{`${detail.emergency_contact_name} (${detail.emergency_contact_phone})`}</span></li>
                  </ul>
                )}
              </div>
            )}

            {leftTab === 'Documents' && (
              <div className="admin-review-col">
                {documents.map((doc) => (
                  <div key={doc.document_id} className="admin-review-doc-card">
                    <div className="admin-review-check-row">
                      <strong>{doc.document_code}</strong>
                      <div className="admin-action-row">
                        <StatusBadge status={doc.document_status === 'verified' ? 'Verified' : doc.document_status === 'rejected' ? 'Rejected' : 'Pending'} />
                        <button
                          type="button"
                          className="admin-text-button"
                          onClick={() => setPreviewId(doc.document_id)}
                        >
                          Preview
                        </button>
                      </div>
                    </div>
                    {doc.review_note && <small className="admin-muted">Note: {doc.review_note}</small>}
                  </div>
                ))}
                {activePreview && (
                  <div className="admin-review-doc-preview" role="region" aria-label="Document preview">
                    <strong>Preview · {activePreview.document_code}</strong>
                    <span>File: {activePreview.original_filename}</span>
                    <div style={{ marginTop: 8 }}>
                      <a
                        href={`${API_ORIGIN}${activePreview.file_url}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="admin-text-button"
                      >
                        Open uploaded document in new tab ↗
                      </a>
                    </div>
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
                <span>{verifiedCount}/{documents.length} verified</span>
              </div>

              <div className="admin-review-checklist">
                {documents.map((doc) => (
                  <div key={doc.document_id} className="admin-review-check-item">
                    <div className="admin-review-check-row">
                      <label>
                        <input
                          type="checkbox"
                          checked={doc.document_status === 'verified'}
                          disabled={!canApprove || busy}
                          onChange={(event) => {
                            if (event.target.checked) {
                              handleDocumentReview(doc, 'verified');
                            }
                          }}
                        />
                        <span>{doc.document_code} ({doc.original_filename})</span>
                      </label>
                      {canApprove && (
                        <button
                          type="button"
                          className="admin-text-button"
                          disabled={busy}
                          onClick={() => setPendingFlagDoc(doc)}
                        >
                          Reject Doc
                        </button>
                      )}
                    </div>
                    {doc.review_note && <small className="admin-muted">Note: {doc.review_note}</small>}
                  </div>
                ))}
              </div>
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
        requireReason={pendingDecision?.type === 'reject' || pendingDecision?.type === 'revision'}
        reasonLabel={pendingDecision?.reasonLabel}
        onCancel={() => setPendingDecision(null)}
        onConfirm={executeDecision}
      />

      <ConfirmModal
        open={Boolean(pendingFlagDoc)}
        title={`Reject document: ${pendingFlagDoc?.document_code || ''}`}
        message="Enter the reason this document needs correction or replacement."
        confirmLabel="Reject Document"
        danger
        requireReason
        reasonLabel="Rejection reason"
        onCancel={() => setPendingFlagDoc(null)}
        onConfirm={({ reason }) => {
          const target = pendingFlagDoc;
          setPendingFlagDoc(null);
          if (target) handleDocumentReview(target, 'rejected', reason);
        }}
      />
    </>
  );
}
