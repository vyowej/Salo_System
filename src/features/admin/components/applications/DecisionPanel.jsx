import { formatDateTime } from '../../utils/format';
import './AdminApplications.css';

function getDecisionSummary(application) {
  const status = String(application?.application_status || '').toLowerCase();
  const history = Array.isArray(application?.history) ? application.history : [];
  const decisionEntry = history.find((entry) => {
    const action = String(entry?.action || '').toLowerCase();
    return action.endsWith(`_${status}`) || action === status;
  }) || history[0];

  const actor = decisionEntry?.actor || null;
  const timestamp = decisionEntry?.created_at || application?.decided_at || application?.reviewed_at;
  const formattedTime = timestamp ? formatDateTime(timestamp) : '';

  if (actor && formattedTime) {
    return `${status === 'approved' ? 'Approved' : 'Rejected'} by ${actor} on ${formattedTime}`;
  }
  if (formattedTime) {
    return `${status === 'approved' ? 'Approved' : 'Rejected'} on ${formattedTime}`;
  }
  return status === 'approved' ? 'Application approved' : 'Application rejected';
}

export default function DecisionPanel({
  application,
  documents = [],
  canApprove = true,
  busy = false,
  onApprove,
  onRequestMoreInfo,
  onReject,
}) {
  const status = String(application?.application_status || '').toLowerCase();
  const isApproved = status === 'approved';
  const isRejected = status === 'rejected';
  const isWaiting = status === 'additional_documents_required';

  const totalCount = documents.length;
  const verifiedCount = documents.filter((doc) => doc.document_status === 'verified').length;
  const rejectedDocs = documents.filter((doc) => doc.document_status === 'rejected');
  const allVerified = totalCount > 0 && verifiedCount === totalCount;

  return (
    <section className="admin-review-card admin-decision-card" aria-label="Application decision">
      <div className="admin-decision-card__header">
        <h2 className="admin-review-card__title">Decision</h2>
        <span className="admin-decision-card__progress">
          {verifiedCount} of {totalCount} documents verified
        </span>
      </div>

      {isApproved || isRejected ? (
        <div className={`admin-decision-card__result ${isApproved ? 'is-approved' : 'is-rejected'}`}>
          <p className="admin-decision-card__result-line">{getDecisionSummary(application)}</p>
          {application?.reviewer_note && (
            <p className="admin-decision-card__result-note">
              Note: {application.reviewer_note}
            </p>
          )}
        </div>
      ) : isWaiting ? (
        <div className="admin-decision-card__result is-waiting">
          <p className="admin-decision-card__result-line">
            Waiting for applicant to upload the requested documents.
          </p>
          {application?.reviewer_note && (
            <p className="admin-decision-card__result-note">
              Requested: {application.reviewer_note}
            </p>
          )}
        </div>
      ) : !canApprove ? (
        <p className="admin-decision-card__helper">
          You have view-only access for this application.
        </p>
      ) : (
        <div className="admin-decision-card__actions">
          <div className="admin-decision-card__primary-wrap">
            <button
              type="button"
              className="admin-decision-btn admin-decision-btn--primary"
              disabled={!allVerified || busy}
              onClick={onApprove}
            >
              Approve application
            </button>
            {!allVerified && (
              <p className="admin-decision-card__helper">
                Verify all documents to approve.
              </p>
            )}
          </div>

          <button
            type="button"
            className="admin-decision-btn admin-decision-btn--secondary"
            disabled={rejectedDocs.length === 0 || busy}
            onClick={() => onRequestMoreInfo?.(rejectedDocs)}
            title={rejectedDocs.length === 0 ? 'Reject at least one document to request corrections.' : undefined}
          >
            Request more info
          </button>

          <button
            type="button"
            className="admin-decision-btn admin-decision-btn--danger-text"
            disabled={busy}
            onClick={onReject}
          >
            Reject application
          </button>
        </div>
      )}
    </section>
  );
}
