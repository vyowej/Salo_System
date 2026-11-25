import { useEffect, useMemo, useState } from 'react';
import { ConfirmModal, Timeline, showAdminToast } from '../index';
import AdminBranchPermitDrawer from '../AdminBranchPermitDrawer';
import Badge from '../../../../components/common/Badge';
import Button from '../../../../components/common/Button';
import adminApiService from '../../../../services/adminApiService';
import { mapBackendApplicationStatus, resolveBackendUrl } from '../../../../services/applicationService';
import { extractApplicationLocations, formatBranchAddressSummary } from '../../../../pages/BusinessApplication/utils/branchHelpers';
import { getAdminBranchPermitBadge } from '../../utils/branchPermitAdminUtils';
import { formatDate, formatDateTime } from '../../utils/format';
import {
  NEEDS_ACTION_STATUSES,
  buildRejectedDocumentsSummary,
} from '../../constants/applicationDocuments';
import StatusChip from './StatusChip';
import DocumentCard from './DocumentCard';
import DocumentLightbox from './DocumentLightbox';
import DecisionPanel from './DecisionPanel';
import { acquireBodyScrollLock } from '../../../../utils/bodyScrollLock';
import './AdminApplications.css';

export default function ApplicationReviewDrawer({
  open,
  kind,
  application,
  canApprove = true,
  onClose,
  onUpdated,
}) {
  const [detail, setDetail] = useState(application);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const [menuExpanded, setMenuExpanded] = useState(false);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [pendingDecision, setPendingDecision] = useState(null);
  const [markAllOpen, setMarkAllOpen] = useState(false);
  const [selectedPermitId, setSelectedPermitId] = useState(null);

  useEffect(() => {
    setDetail(application);
    setActionError('');
    setLightboxIndex(null);
    setMenuExpanded(false);
    setHistoryExpanded(false);
    setPendingDecision(null);
    setMarkAllOpen(false);
    setSelectedPermitId(null);
  }, [application]);

  useEffect(() => {
    if (!open) return undefined;
    return acquireBodyScrollLock();
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && lightboxIndex === null && !pendingDecision && !markAllOpen && !selectedPermitId) {
        onClose?.();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, lightboxIndex, pendingDecision, markAllOpen, selectedPermitId, onClose]);

  const timelineItems = useMemo(() => (
    (detail?.history || []).map((entry) => ({
      title: entry.action,
      time: formatDateTime(entry.created_at),
      description: entry.reason ? `${entry.actor}: ${entry.reason}` : entry.actor,
    }))
  ), [detail?.history]);

  if (!open || !detail) return null;

  const appId = kind === 'restaurant' ? detail.restaurant_application_id : detail.rider_application_id;
  const displayName = kind === 'restaurant'
    ? detail.restaurant_name
    : `${detail.legal_first_name || ''} ${detail.legal_last_name || ''}`.trim();
  const displayStatus = mapBackendApplicationStatus(detail.application_status) || detail.application_status;
  const rawStatus = String(detail.application_status || '').toLowerCase();
  const isFinalized = rawStatus === 'approved' || rawStatus === 'rejected';
  const isWaiting = rawStatus === 'additional_documents_required';

  const documents = detail.documents || [];
  const verifiedCount = documents.filter((doc) => doc.document_status === 'verified').length;
  const hasRejectedDoc = documents.some((doc) => doc.document_status === 'rejected');
  const allVerified = documents.length > 0 && verifiedCount === documents.length;
  const showMarkAll = canApprove && !isFinalized && !isWaiting && documents.length > 0 && !hasRejectedDoc && !allVerified;

  const locSummary = extractApplicationLocations(detail);
  const fullAddress = [
    detail.address?.street,
    detail.address?.barangay,
    detail.address?.city,
    detail.address?.province,
  ].filter(Boolean).join(', ');

  async function ensureUnderReviewIfNeeded() {
    if (['submitted', 'pending_review', 'resubmitted'].includes(detail.application_status)) {
      const moved = await adminApiService.decideApplication(kind, appId, {
        decision: 'under_review',
      });
      setDetail(moved);
      return moved;
    }
    return detail;
  }

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

  async function handleMarkAllVerified() {
    if (!canApprove || busy) return;
    setMarkAllOpen(false);
    setBusy(true);
    setActionError('');
    try {
      let latest = detail;
      const toVerify = documents.filter((doc) => doc.document_status !== 'verified');
      for (const doc of toVerify) {
        latest = await adminApiService.reviewDocument(kind, appId, doc.document_id, {
          status: 'verified',
          reviewNote: '',
        });
      }
      setDetail(latest);
      showAdminToast('All documents marked as verified.', 'success');
      onUpdated?.(latest);
    } catch (err) {
      const msg = err?.message || 'Unable to verify all documents.';
      setActionError(msg);
      showAdminToast(msg, 'danger');
    } finally {
      setBusy(false);
    }
  }

  async function handleApprove() {
    if (!canApprove || busy || !allVerified) return;
    setBusy(true);
    setActionError('');
    try {
      await ensureUnderReviewIfNeeded();
      const updated = await adminApiService.decideApplication(kind, appId, {
        decision: 'approve',
      });
      setDetail(updated);
      showAdminToast(`${displayName} approved.`, 'success');
      onUpdated?.(updated);
      onClose?.();
    } catch (err) {
      const msg = err?.errors?.note?.[0] || err?.message || 'Unable to approve application.';
      setActionError(msg);
      showAdminToast(msg, 'danger');
    } finally {
      setBusy(false);
    }
  }

  async function handleRequestMoreInfo(rejectedDocs) {
    if (!canApprove || busy || !rejectedDocs.length) return;
    const summaryReason = buildRejectedDocumentsSummary(rejectedDocs);
    const docNames = rejectedDocs.map((d) => d.document_code).join(', ');
    setBusy(true);
    setActionError('');
    try {
      await ensureUnderReviewIfNeeded();
      const updated = await adminApiService.requestDocument(kind, appId, {
        documentName: docNames || 'Additional Supporting Document',
        reason: summaryReason,
      });
      setDetail(updated);
      showAdminToast(`Additional information requested for ${displayName}.`, 'warning');
      onUpdated?.(updated);
      onClose?.();
    } catch (err) {
      const msg = err?.errors?.reason?.[0] || err?.message || 'Unable to request additional information.';
      setActionError(msg);
      showAdminToast(msg, 'danger');
    } finally {
      setBusy(false);
    }
  }

  async function executeRejectDecision({ reason }) {
    if (!canApprove || busy) return;
    setBusy(true);
    setActionError('');
    try {
      await ensureUnderReviewIfNeeded();
      const updated = await adminApiService.decideApplication(kind, appId, {
        decision: 'reject',
        note: reason,
      });
      setDetail(updated);
      setPendingDecision(null);
      showAdminToast(`${displayName} application rejected.`, 'warning');
      onUpdated?.(updated);
      onClose?.();
    } catch (err) {
      const msg = err?.errors?.note?.[0] || err?.message || 'Unable to reject application.';
      setActionError(msg);
      setPendingDecision(null);
      showAdminToast(msg, 'danger');
    } finally {
      setBusy(false);
    }
  }

  const canActOnDocs = canApprove && (NEEDS_ACTION_STATUSES.includes(rawStatus));

  return (
    <>
      <div
        className="admin-app-drawer-backdrop"
        role="presentation"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onClose?.();
        }}
      >
        <section
          className="admin-app-drawer"
          role="dialog"
          aria-modal="true"
          aria-label={`Review ${displayName}`}
        >
          <header className="admin-app-drawer__header">
            <div className="admin-app-drawer__header-main">
              <div className="admin-app-drawer__title-row">
                <h1 className="admin-app-drawer__title">{displayName}</h1>
                <StatusChip status={rawStatus} label={displayStatus} />
              </div>
              <p className="admin-app-drawer__meta">
                {detail.reference_number} · Submitted {formatDate(detail.submitted_at)}
              </p>
            </div>
            <button
              type="button"
              className="admin-app-drawer__close"
              onClick={onClose}
              aria-label="Close application review"
            >
              ×
            </button>
          </header>

          <div className="admin-app-drawer__body">
            {actionError && (
              <div className="admin-app-drawer__error" role="alert">
                {actionError}
              </div>
            )}

            <div className="admin-app-drawer__grid">
              <div className="admin-app-drawer__left">
                <div className="admin-app-docs-header">
                  <div>
                    <h2 className="admin-review-card__title">Documents to verify</h2>
                    <p className="admin-app-docs-header__progress">
                      {verifiedCount} of {documents.length} verified
                    </p>
                  </div>

                  {showMarkAll && (
                    <button
                      type="button"
                      className="admin-doc-btn admin-doc-btn--ghost"
                      disabled={busy}
                      onClick={() => setMarkAllOpen(true)}
                    >
                      Mark all as verified
                    </button>
                  )}
                </div>

                {documents.length === 0 ? (
                  <div className="admin-review-card">
                    <p className="admin-app-docs-empty">No documents attached to this application.</p>
                  </div>
                ) : (
                  <div className="admin-doc-grid">
                    {documents.map((doc, idx) => (
                      <DocumentCard
                        key={doc.document_id}
                        doc={doc}
                        canApprove={canActOnDocs}
                        isFinalized={isFinalized}
                        busy={busy}
                        onVerify={(target) => handleDocumentReview(target, 'verified')}
                        onReject={(target, reason) => handleDocumentReview(target, 'rejected', reason)}
                        onOpenLightbox={() => setLightboxIndex(idx)}
                      />
                    ))}
                  </div>
                )}
              </div>

              <aside className="admin-app-drawer__right">
                <div className="admin-app-drawer__decision-slot">
                  <DecisionPanel
                    application={detail}
                    documents={documents}
                    canApprove={canApprove}
                    busy={busy}
                    onApprove={handleApprove}
                    onRequestMoreInfo={handleRequestMoreInfo}
                    onReject={() =>
                      setPendingDecision({
                        type: 'reject',
                        title: 'Reject application',
                        message: `Reject ${displayName} (${detail.reference_number}). This records an audit entry.`,
                        confirmLabel: 'Reject application',
                        reasonLabel: 'Rejection reason',
                        danger: true,
                      })
                    }
                  />
                </div>

                <section className="admin-review-card admin-app-summary-card" aria-label={kind === 'restaurant' ? 'Applicant and restaurant details' : 'Applicant and vehicle details'}>
                  <h2 className="admin-review-card__title">
                    {kind === 'restaurant' ? 'Applicant & restaurant' : 'Applicant & rider'}
                  </h2>

                  {kind === 'restaurant' && (detail.logo_image || detail.cover_image) && (
                    <div className="admin-app-media-preview">
                      {detail.logo_image && (
                        <img
                          src={resolveBackendUrl(detail.logo_image)}
                          alt={`${displayName} logo`}
                          loading="lazy"
                          decoding="async"
                          className="admin-app-media-preview__logo"
                        />
                      )}
                      {detail.cover_image && (
                        <img
                          src={resolveBackendUrl(detail.cover_image)}
                          alt={`${displayName} cover`}
                          loading="lazy"
                          decoding="async"
                          className="admin-app-media-preview__cover"
                        />
                      )}
                    </div>
                  )}

                  {kind === 'restaurant' ? (
                    <dl className="admin-kv-list">
                      <div className="admin-kv-row">
                        <dt>Restaurant</dt>
                        <dd>{detail.restaurant_name || '—'}</dd>
                      </div>
                      <div className="admin-kv-row">
                        <dt>Owner</dt>
                        <dd>{`${detail.legal_first_name || ''} ${detail.legal_last_name || ''}`.trim() || '—'}</dd>
                      </div>
                      <div className="admin-kv-row">
                        <dt>Email</dt>
                        <dd>{detail.contact_email || '—'}</dd>
                      </div>
                      <div className="admin-kv-row">
                        <dt>Phone</dt>
                        <dd>{detail.contact_phone || '—'}</dd>
                      </div>
                      <div className="admin-kv-row">
                        <dt>Address</dt>
                        <dd>{fullAddress || '—'}</dd>
                      </div>
                      <div className="admin-kv-row">
                        <dt>Business type</dt>
                        <dd>{detail.business_type || '—'}</dd>
                      </div>
                      <div className="admin-kv-row">
                        <dt>Ownership</dt>
                        <dd>{detail.ownership_structure || '—'}</dd>
                      </div>
                    </dl>
                  ) : (
                    <dl className="admin-kv-list">
                      <div className="admin-kv-row">
                        <dt>Applicant</dt>
                        <dd>{displayName || '—'}</dd>
                      </div>
                      <div className="admin-kv-row">
                        <dt>Email</dt>
                        <dd>{detail.contact_email || '—'}</dd>
                      </div>
                      <div className="admin-kv-row">
                        <dt>Phone</dt>
                        <dd>{detail.contact_phone || '—'}</dd>
                      </div>
                      <div className="admin-kv-row">
                        <dt>Base city</dt>
                        <dd>{detail.base_city || '—'}</dd>
                      </div>
                      <div className="admin-kv-row">
                        <dt>Address</dt>
                        <dd>{fullAddress || '—'}</dd>
                      </div>
                      <div className="admin-kv-row">
                        <dt>Vehicle</dt>
                        <dd>{[detail.vehicle_type, detail.vehicle_brand, detail.vehicle_model, detail.plate_number].filter(Boolean).join(' · ') || '—'}</dd>
                      </div>
                      <div className="admin-kv-row">
                        <dt>Gov ID type</dt>
                        <dd>{detail.gov_id_type || '—'}</dd>
                      </div>
                      <div className="admin-kv-row">
                        <dt>Emergency contact</dt>
                        <dd>{detail.emergency_contact_name ? `${detail.emergency_contact_name} (${detail.emergency_contact_phone || '—'})` : '—'}</dd>
                      </div>
                    </dl>
                  )}

                  {locSummary.hasBranches && (
                    <div className="admin-app-branches">
                      <h3 className="admin-app-branches__heading">Locations ({locSummary.totalLocations})</h3>
                      <div className="admin-app-branches__item">
                        <strong>{locSummary.mainBranchName} (Main)</strong>
                        <span>{formatBranchAddressSummary(detail.address)}</span>
                      </div>
                      {locSummary.branches.map((branch, idx) => {
                        const permitBadge = branch.permit_status
                          ? getAdminBranchPermitBadge(branch.permit_status)
                          : null;
                        return (
                          <div
                            key={branch.application_branch_id || `${branch.branch_name}-${idx}`}
                            className="admin-app-branches__item"
                          >
                            <div className="admin-app-branches__row">
                              <strong>{branch.branch_name}</strong>
                              <div className="admin-app-branches__badges">
                                {permitBadge && <Badge variant={permitBadge.variant} size="sm">{permitBadge.label}</Badge>}
                                {branch.permit_id && (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setSelectedPermitId(branch.permit_id)}
                                  >
                                    Open permit review
                                  </Button>
                                )}
                              </div>
                            </div>
                            <span>{formatBranchAddressSummary(branch.address)}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {kind === 'restaurant' && detail.menu_items?.length > 0 && (
                    <div className="admin-accordion">
                      <button
                        type="button"
                        className="admin-accordion__trigger"
                        aria-expanded={menuExpanded}
                        onClick={() => setMenuExpanded((prev) => !prev)}
                      >
                        <span>Initial menu ({detail.menu_items.length})</span>
                        <span aria-hidden="true">{menuExpanded ? '−' : '+'}</span>
                      </button>
                      {menuExpanded && (
                        <div className="admin-accordion__content">
                          {detail.menu_items.map((item) => (
                            <div key={item.menu_item_id || item.name} className="admin-app-menu-item">
                              {item.photo_url && (
                                <img
                                  src={resolveBackendUrl(item.photo_url)}
                                  alt={item.name}
                                  loading="lazy"
                                  decoding="async"
                                  className="admin-app-menu-item__img"
                                />
                              )}
                              <div>
                                <div className="admin-app-menu-item__name">{item.name}</div>
                                <div className="admin-app-menu-item__meta">
                                  {item.category} · ₱{Number(item.price || 0).toFixed(2)}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </section>

                <section className="admin-review-card admin-app-history-card" aria-label="Application history">
                  <div className="admin-accordion">
                    <button
                      type="button"
                      className="admin-accordion__trigger"
                      aria-expanded={historyExpanded}
                      onClick={() => setHistoryExpanded((prev) => !prev)}
                    >
                      <span>History ({timelineItems.length})</span>
                      <span aria-hidden="true">{historyExpanded ? '−' : '+'}</span>
                    </button>
                    {historyExpanded && (
                      <div className="admin-accordion__content">
                        {timelineItems.length > 0 ? (
                          <Timeline items={timelineItems} />
                        ) : (
                          <p className="admin-app-docs-empty">No history entries yet.</p>
                        )}
                      </div>
                    )}
                  </div>
                </section>
              </aside>
            </div>
          </div>
        </section>
      </div>

      <DocumentLightbox
        open={lightboxIndex !== null}
        documents={documents}
        activeIndex={lightboxIndex ?? 0}
        canApprove={canActOnDocs}
        isFinalized={isFinalized}
        busy={busy}
        onSelectIndex={(idx) => setLightboxIndex(idx)}
        onClose={() => setLightboxIndex(null)}
        onVerify={(doc) => handleDocumentReview(doc, 'verified')}
        onReject={(doc, reason) => handleDocumentReview(doc, 'rejected', reason)}
      />

      <ConfirmModal
        open={markAllOpen}
        title="Mark all documents as verified?"
        message={`This will mark all ${documents.length} submitted documents as verified.`}
        confirmLabel="Verify all"
        onCancel={() => setMarkAllOpen(false)}
        onConfirm={handleMarkAllVerified}
      />

      <ConfirmModal
        open={Boolean(pendingDecision)}
        title={pendingDecision?.title}
        message={pendingDecision?.message}
        confirmLabel={pendingDecision?.confirmLabel}
        danger={pendingDecision?.danger}
        requireReason
        reasonLabel={pendingDecision?.reasonLabel}
        onCancel={() => setPendingDecision(null)}
        onConfirm={executeRejectDecision}
      />

      <AdminBranchPermitDrawer
        open={Boolean(selectedPermitId)}
        permitId={selectedPermitId}
        onClose={() => setSelectedPermitId(null)}
        onUpdated={(updatedPermit) => {
          setDetail((prev) => {
            if (!prev || !Array.isArray(prev.branches)) return prev;
            return {
              ...prev,
              branches: prev.branches.map((b) => (
                b.permit_id === updatedPermit.permit_id
                  ? { ...b, permit_status: updatedPermit.permit_status, review_note: updatedPermit.review_note }
                  : b
              )),
            };
          });
          onUpdated?.();
        }}
      />
    </>
  );
}
