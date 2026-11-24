import { useEffect, useState } from 'react';
import StatusChip from './StatusChip';
import {
  DOCUMENT_REJECTION_REASONS,
  getDocumentLabel,
  isPdfDocument,
} from '../../constants/applicationDocuments';
import { resolveBackendUrl } from '../../../../services/applicationService';
import './AdminApplications.css';

export default function DocumentLightbox({
  open,
  documents = [],
  activeIndex = 0,
  canApprove = true,
  isFinalized = false,
  busy = false,
  onSelectIndex,
  onClose,
  onVerify,
  onReject,
}) {
  const [imgError, setImgError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState(DOCUMENT_REJECTION_REASONS[0]);
  const [note, setNote] = useState('');

  const safeIndex = Math.max(0, Math.min(activeIndex, Math.max(0, documents.length - 1)));
  const doc = documents[safeIndex] || null;
  const hasPrev = safeIndex > 0;
  const hasNext = safeIndex < documents.length - 1;

  useEffect(() => {
    setImgError(false);
    setRetryCount(0);
    setRejectOpen(false);
    setNote('');
  }, [safeIndex, doc?.document_id, open]);

  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose?.();
      } else if (event.key === 'ArrowLeft' && hasPrev) {
        event.preventDefault();
        onSelectIndex?.(safeIndex - 1);
      } else if (event.key === 'ArrowRight' && hasNext) {
        event.preventDefault();
        onSelectIndex?.(safeIndex + 1);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, hasPrev, hasNext, safeIndex, onClose, onSelectIndex]);

  if (!open || !doc) return null;

  const label = getDocumentLabel(doc.document_code);
  const baseUrl = resolveBackendUrl(doc.file_url);
  const effectiveUrl = baseUrl && retryCount
    ? `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}retry=${retryCount}`
    : baseUrl;
  const isPdf = isPdfDocument(doc);
  const status = String(doc.document_status || 'pending').toLowerCase();
  const isVerified = status === 'verified';
  const isRejected = status === 'rejected';
  const chipLabel = isVerified ? 'Verified' : isRejected ? 'Rejected' : 'Pending';

  async function handleVerifyAndAdvance() {
    if (busy || !canApprove || isFinalized) return;
    await onVerify?.(doc);
    if (hasNext) {
      onSelectIndex?.(safeIndex + 1);
    }
  }

  async function handleConfirmReject(event) {
    event.preventDefault();
    if (busy || !canApprove || isFinalized) return;
    const trimmed = note.trim();
    const fullReason = trimmed ? `${reason}: ${trimmed}` : reason;
    setRejectOpen(false);
    setNote('');
    await onReject?.(doc, fullReason);
  }

  return (
    <div
      className="admin-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={`${label} preview`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <header className="admin-lightbox__header">
        <div className="admin-lightbox__title-group">
          <h2 className="admin-lightbox__title">{label}</h2>
          <StatusChip status={chipLabel} />
          <span className="admin-lightbox__counter">
            {safeIndex + 1} of {documents.length}
          </span>
        </div>
        <button
          type="button"
          className="admin-lightbox__close"
          onClick={onClose}
          aria-label="Close document preview"
        >
          ×
        </button>
      </header>

      <div className="admin-lightbox__stage">
        <button
          type="button"
          className="admin-lightbox__nav admin-lightbox__nav--prev"
          disabled={!hasPrev}
          onClick={() => onSelectIndex?.(safeIndex - 1)}
          aria-label="Previous document"
        >
          ‹
        </button>

        <div className="admin-lightbox__content">
          {isPdf ? (
            <div className="admin-lightbox__fallback">
              <p>PDF document preview</p>
              {baseUrl && (
                <a
                  href={baseUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="admin-doc-btn admin-doc-btn--verify"
                >
                  Open PDF in new tab
                </a>
              )}
            </div>
          ) : imgError || !effectiveUrl ? (
            <div className="admin-lightbox__fallback" role="status">
              <p>Can&apos;t load file</p>
              {baseUrl && (
                <button
                  type="button"
                  className="admin-doc-card__retry"
                  onClick={() => {
                    setImgError(false);
                    setRetryCount((c) => c + 1);
                  }}
                >
                  Retry
                </button>
              )}
            </div>
          ) : (
            <img
              src={effectiveUrl}
              alt={label}
              className="admin-lightbox__img"
              onError={() => setImgError(true)}
            />
          )}
        </div>

        <button
          type="button"
          className="admin-lightbox__nav admin-lightbox__nav--next"
          disabled={!hasNext}
          onClick={() => onSelectIndex?.(safeIndex + 1)}
          aria-label="Next document"
        >
          ›
        </button>
      </div>

      <footer className="admin-lightbox__footer">
        <div className="admin-lightbox__filename">
          {doc.original_filename || label}
        </div>

        {canApprove && !isFinalized && (
          <div className="admin-lightbox__actions">
            {rejectOpen ? (
              <form className="admin-lightbox__reject-form" onSubmit={handleConfirmReject}>
                <select
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  aria-label="Rejection reason"
                >
                  {DOCUMENT_REJECTION_REASONS.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
                <input
                  type="text"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Optional note"
                  aria-label="Optional rejection note"
                />
                <button
                  type="button"
                  className="admin-doc-btn admin-doc-btn--ghost"
                  onClick={() => setRejectOpen(false)}
                  disabled={busy}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="admin-doc-btn admin-doc-btn--danger-solid"
                  disabled={busy}
                >
                  Confirm Reject
                </button>
              </form>
            ) : (
              <>
                <button
                  type="button"
                  className="admin-doc-btn admin-doc-btn--reject"
                  disabled={busy}
                  onClick={() => setRejectOpen(true)}
                >
                  Reject
                </button>
                <button
                  type="button"
                  className="admin-doc-btn admin-doc-btn--verify"
                  disabled={busy}
                  onClick={handleVerifyAndAdvance}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" aria-hidden="true">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span>{isVerified ? 'Verified · Next' : 'Verify & Next'}</span>
                </button>
              </>
            )}
          </div>
        )}
      </footer>
    </div>
  );
}
