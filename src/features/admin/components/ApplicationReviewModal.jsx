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
import { mapBackendApplicationStatus, resolveBackendUrl } from '../../../services/applicationService';
import { extractApplicationLocations, formatBranchAddressSummary } from '../../../pages/BusinessApplication/utils/branchHelpers';
import { formatDate, formatDateTime } from '../utils/format';

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
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    setDetail(application);
    setLeftTab('Overview');
    setPreviewId(application?.documents?.[0]?.document_id || null);
    setPendingDecision(null);
    setPendingFlagDoc(null);
    setActionError('');
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
    setActionError('');
    try {
      const updated = await adminApiService.reviewDocument(kind, appId, doc.document_id, {
        status,
        reviewNote,
      });
      setDetail(updated);
      showAdminToast(`Document marked as ${status}.`, status === 'verified' ? 'success' : 'warning');
      onUpdated?.(updated);
    } catch (err) {
      const msg = err?.errors?.review_note?.[0] || err?.message || 'Unable to update document status.';
      setActionError(msg);
      showAdminToast(msg, 'danger');
    } finally {
      setBusy(false);
    }
  }

  async function handleStartReview() {
    if (!canApprove || busy) return;
    setBusy(true);
    setActionError('');
    try {
      const updated = await adminApiService.decideApplication(kind, appId, {
        decision: 'under_review',
      });
      setDetail(updated);
      showAdminToast(`${displayName} moved to Under Review.`, 'success');
      onUpdated?.(updated);
    } catch (err) {
      const msg = err?.message || 'Unable to start review.';
      setActionError(msg);
      showAdminToast(msg, 'danger');
    } finally {
      setBusy(false);
    }
  }

  async function executeDecision({ reason }) {
    if (!pendingDecision || !canApprove || busy) return;
    setBusy(true);
    setActionError('');
    try {
      let updated;
      if (pendingDecision.type === 'additional_info') {
        updated = await adminApiService.requestDocument(kind, appId, {
          documentName: 'Additional Supporting Document',
          reason,
        });
      } else {
        const decisionMap = {
          approve: 'approve',
          reject: 'reject',
        };
        updated = await adminApiService.decideApplication(kind, appId, {
          decision: decisionMap[pendingDecision.type],
          note: reason,
        });
      }
      showAdminToast(
        pendingDecision.type === 'approve'
          ? `${displayName} approved.`
          : pendingDecision.type === 'additional_info'
            ? `Additional information requested for ${displayName}.`
            : `${displayName} application rejected.`,
        pendingDecision.type === 'approve' ? 'success' : 'warning',
      );
      onUpdated?.(updated);
      setPendingDecision(null);
      onClose?.();
    } catch (err) {
      const msg = err?.errors?.note?.[0] || err?.errors?.reason?.[0] || err?.message || 'Unable to save application decision.';
      setActionError(msg);
      setPendingDecision(null);
      showAdminToast(msg, 'danger');
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
            {canApprove && ['submitted', 'pending_review', 'resubmitted'].includes(detail.application_status) && (
              <button
                type="button"
                className="admin-action-button"
                disabled={busy}
                onClick={handleStartReview}
              >
                Start Review
              </button>
            )}
            {canApprove && detail.application_status === 'under_review' && (
              <>
                <button
                  type="button"
                  className="admin-action-button"
                  disabled={busy}
                  onClick={() =>
                    setPendingDecision({
                      type: 'additional_info',
                      title: 'Request additional information',
                      message: `Ask ${displayName} to upload additional information or documents.`,
                      confirmLabel: 'Send Request',
                      reasonLabel: 'Required message / reason',
                      requireReason: true,
                      danger: false,
                    })
                  }
                >
                  Request Additional Info
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
                      requireReason: true,
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
                      message: kind === 'restaurant'
                        ? `Approve ${displayName}? This publishes the restaurant and its initial menu items.`
                        : `Approve ${displayName}? This marks the rider application approved.`,
                      confirmLabel: 'Approve',
                      reasonLabel: 'Approval note (optional)',
                      requireReason: false,
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
        {actionError && (
          <div
            role="alert"
            style={{
              marginBottom: 12,
              padding: '10px 12px',
              borderRadius: 8,
              background: '#fef2f2',
              border: '1px solid #fecaca',
              color: '#b91c1c',
              fontSize: 13,
            }}
          >
            {actionError}
          </div>
        )}
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
                    {(() => {
                      const locSummary = extractApplicationLocations(detail);
                      if (!locSummary.hasBranches) return null;
                      return (
                        <li>
                          <strong>Locations ({locSummary.totalLocations})</strong>
                          <div style={{ display: 'grid', gap: 6, marginTop: 4 }}>
                            <div style={{ padding: '6px 8px', borderRadius: 6, background: 'var(--bg-secondary, #f8fafc)' }}>
                              <div style={{ fontWeight: 600, fontSize: 13 }}>{locSummary.mainBranchName} (Main)</div>
                              <div style={{ fontSize: 12, opacity: 0.85 }}>{formatBranchAddressSummary(detail.address)}</div>
                            </div>
                            {locSummary.branches.map((branch, idx) => (
                              <div
                                key={branch.application_branch_id || `${branch.branch_name}-${idx}`}
                                style={{ padding: '6px 8px', borderRadius: 6, background: 'var(--bg-secondary, #f8fafc)' }}
                              >
                                <div style={{ fontWeight: 600, fontSize: 13 }}>{branch.branch_name}</div>
                                <div style={{ fontSize: 12, opacity: 0.85 }}>
                                  {formatBranchAddressSummary(branch.address)}
                                  {branch.address?.latitude != null && branch.address?.longitude != null && (
                                    <> · Pin: {Number(branch.address.latitude).toFixed(4)}, {Number(branch.address.longitude).toFixed(4)}</>
                                  )}
                                  {branch.contact_phone && <> · {branch.contact_phone}</>}
                                </div>
                              </div>
                            ))}
                          </div>
                        </li>
                      );
                    })()}
                    {detail.logo_image && (
                      <li>
                        <strong>Logo</strong>
                        <img src={resolveBackendUrl(detail.logo_image)} alt="Restaurant logo" style={{ maxHeight: 48, borderRadius: 6 }} />
                      </li>
                    )}
                    {detail.cover_image && (
                      <li>
                        <strong>Cover photo</strong>
                        <img src={resolveBackendUrl(detail.cover_image)} alt="Restaurant cover" style={{ maxHeight: 64, borderRadius: 6 }} />
                      </li>
                    )}
                    {detail.menu_items?.length > 0 && (
                      <li>
                        <strong>Initial menu ({detail.menu_items.length})</strong>
                        <div style={{ display: 'grid', gap: 6, marginTop: 4 }}>
                          {detail.menu_items.map((item) => (
                            <div key={item.menu_item_id || item.name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              {item.photo_url && (
                                <img
                                  src={resolveBackendUrl(item.photo_url)}
                                  alt={item.name}
                                  style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: 4 }}
                                />
                              )}
                              <span>{item.name} · {item.category} · ₱{Number(item.price || 0).toFixed(2)}</span>
                            </div>
                          ))}
                        </div>
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
                    {(() => {
                      const locSummary = extractApplicationLocations(detail);
                      if (!locSummary.hasBranches) return null;
                      return (
                        <li>
                          <strong>Locations ({locSummary.totalLocations})</strong>
                          <div style={{ display: 'grid', gap: 6, marginTop: 4 }}>
                            <div style={{ padding: '6px 8px', borderRadius: 6, background: 'var(--bg-secondary, #f8fafc)' }}>
                              <div style={{ fontWeight: 600, fontSize: 13 }}>{locSummary.mainBranchName} (Main)</div>
                              <div style={{ fontSize: 12, opacity: 0.85 }}>{formatBranchAddressSummary(detail.address)}</div>
                            </div>
                            {locSummary.branches.map((branch, idx) => (
                              <div
                                key={branch.application_branch_id || `${branch.branch_name}-${idx}`}
                                style={{ padding: '6px 8px', borderRadius: 6, background: 'var(--bg-secondary, #f8fafc)' }}
                              >
                                <div style={{ fontWeight: 600, fontSize: 13 }}>{branch.branch_name}</div>
                                <div style={{ fontSize: 12, opacity: 0.85 }}>
                                  {formatBranchAddressSummary(branch.address)}
                                  {branch.address?.latitude != null && branch.address?.longitude != null && (
                                    <> · Pin: {Number(branch.address.latitude).toFixed(4)}, {Number(branch.address.longitude).toFixed(4)}</>
                                  )}
                                  {branch.contact_phone && <> · {branch.contact_phone}</>}
                                </div>
                              </div>
                            ))}
                          </div>
                        </li>
                      );
                    })()}
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
                        href={resolveBackendUrl(activePreview.file_url)}
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
