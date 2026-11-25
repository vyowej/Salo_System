import { useEffect, useState } from 'react';
import StatusChip from './StatusChip';
import {
  DOCUMENT_REJECTION_REASONS,
  getDocumentLabel,
  isPdfDocument,
} from '../../constants/applicationDocuments';
import { resolveBackendUrl } from '../../../../services/applicationService';
import './AdminApplications.css';

function buildThumbUrl(baseUrl, retryCount) {
  if (!baseUrl) return '';
  const separator = baseUrl.includes('?') ? '&' : '?';
  const withVariant = `${baseUrl}${separator}variant=thumb`;
  if (!retryCount) return withVariant;
  return `${withVariant}&retry=${retryCount}`;
}

export default function DocumentCard({
  doc,
  canApprove = true,
  isFinalized = false,
  busy = false,
  onVerify,
  onReject,
  onOpenLightbox,
}) {
  const [imgError, setImgError] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState(DOCUMENT_REJECTION_REASONS[0]);
  const [note, setNote] = useState('');

  const fileUrl = resolveBackendUrl(doc?.file_url);
  const effectiveUrl = buildThumbUrl(fileUrl, retryCount);
  const label = getDocumentLabel(doc?.document_code);
  const isPdf = isPdfDocument(doc);
  const status = String(doc?.document_status || 'pending').toLowerCase();
  const isVerified = status === 'verified';
  const isRejected = status === 'rejected';
  const chipLabel = isVerified ? 'Verified' : isRejected ? 'Rejected' : 'Pending';

  useEffect(() => {
    setImgError(false);
    setImgLoaded(false);
    setRetryCount(0);
    setRejectOpen(false);
    setNote('');
  }, [doc?.document_id, doc?.file_url]);

  function handleRetry(event) {
    event.stopPropagation();
    setImgError(false);
    setImgLoaded(false);
    setRetryCount((count) => count + 1);
  }

  function handleConfirmReject(event) {
    event.preventDefault();
    if (busy || !canApprove) return;
    const trimmedNote = note.trim();
    const fullReason = trimmedNote ? `${reason}: ${trimmedNote}` : reason;
    setRejectOpen(false);
    setNote('');
    onReject?.(doc, fullReason);
  }

  const cardStateClass = isVerified
    ? 'is-verified'
    : isRejected
      ? 'is-rejected'
      : '';

  return (
    <article className={`admin-doc-card ${cardStateClass}`.trim()}>
      <div className="admin-doc-card__media">
        {isPdf ? (
          <div className="admin-doc-card__pdf">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="9" y1="15" x2="15" y2="15" />
            </svg>
            <span className="admin-doc-card__pdf-label">PDF Document</span>
            {fileUrl && (
              <a
                href={fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="admin-doc-card__pdf-open"
              >
                Open
              </a>
            )}
          </div>
        ) : imgError || !effectiveUrl ? (
          <div className="admin-doc-card__fallback" role="status">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
            <span>Can&apos;t load file</span>
            {fileUrl && (
              <button
                type="button"
                className="admin-doc-card__retry"
                onClick={handleRetry}
              >
                Retry
              </button>
            )}
          </div>
        ) : (
          <button
            type="button"
            className="admin-doc-card__thumb-btn"
            onClick={() => onOpenLightbox?.(doc)}
            aria-label={`View ${label} full size`}
          >
            {!imgLoaded && <span className="admin-doc-card__skeleton" aria-hidden="true" />}
            <img
              src={effectiveUrl}
              alt={label}
              loading="lazy"
              decoding="async"
              className={`admin-doc-card__thumb ${imgLoaded ? 'is-loaded' : 'is-loading'}`}
              onLoad={() => setImgLoaded(true)}
              onError={() => {
                setImgLoaded(true);
                setImgError(true);
              }}
            />
          </button>
        )}

        {isVerified && (
          <span className="admin-doc-card__verified-badge" aria-label="Verified">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </span>
        )}
      </div>

      <div className="admin-doc-card__header">
        <h3 className="admin-doc-card__title">{label}</h3>
        <StatusChip status={chipLabel} />
      </div>

      {isRejected && doc?.review_note && (
        <p className="admin-doc-card__note" title={doc.review_note}>
          {doc.review_note}
        </p>
      )}

      {canApprove && !isFinalized && (
        <div className="admin-doc-card__actions">
          <button
            type="button"
            className={`admin-doc-btn admin-doc-btn--verify ${isVerified ? 'is-selected' : ''}`}
            disabled={busy || isVerified}
            aria-pressed={isVerified}
            onClick={() => {
              setRejectOpen(false);
              onVerify?.(doc);
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" aria-hidden="true">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span>{isVerified ? 'Verified' : 'Verify'}</span>
          </button>

          <button
            type="button"
            className={`admin-doc-btn admin-doc-btn--reject ${isRejected || rejectOpen ? 'is-selected' : ''}`}
            disabled={busy}
            aria-pressed={isRejected || rejectOpen}
            onClick={() => setRejectOpen((prev) => !prev)}
          >
            <span>Reject</span>
          </button>
        </div>
      )}

      {rejectOpen && canApprove && !isFinalized && (
        <form className="admin-doc-reject-panel" onSubmit={handleConfirmReject}>
          <label className="admin-doc-reject-panel__field">
            <span>Reason</span>
            <select
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              aria-label={`Rejection reason for ${label}`}
            >
              {DOCUMENT_REJECTION_REASONS.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </label>

          <label className="admin-doc-reject-panel__field">
            <span>Note (optional)</span>
            <input
              type="text"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Add details for the applicant"
              aria-label={`Rejection note for ${label}`}
            />
          </label>

          <div className="admin-doc-reject-panel__actions">
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
              Confirm
            </button>
          </div>
        </form>
      )}
    </article>
  );
}
