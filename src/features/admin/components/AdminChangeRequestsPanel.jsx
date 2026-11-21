import { useCallback, useEffect, useState } from 'react';
import adminApiService from '../../../services/adminApiService';
import Button from '../../../components/common/Button';
import Badge from '../../../components/common/Badge';
import Modal from '../../../components/common/Modal';
import { showAdminToast } from './index';

function badgeVariant(status) {
  switch (String(status || '').toLowerCase()) {
    case 'approved':
    case 'completed':
      return 'success';
    case 'rejected':
    case 'cancelled':
      return 'danger';
    default:
      return 'warning';
  }
}

export default function AdminChangeRequestsPanel({ canApprove = true }) {
  const [subTab, setSubTab] = useState('profile');
  const [statusFilter, setStatusFilter] = useState('pending');
  const [changeRequests, setChangeRequests] = useState([]);
  const [lifecycleRequests, setLifecycleRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [reviewTarget, setReviewTarget] = useState(null);
  const [reviewNote, setReviewNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [changes, lifecycle] = await Promise.all([
        adminApiService.getChangeRequests({ status: statusFilter }),
        adminApiService.getLifecycleRequests({ status: statusFilter }),
      ]);
      setChangeRequests(Array.isArray(changes) ? changes : []);
      setLifecycleRequests(Array.isArray(lifecycle) ? lifecycle : []);
    } catch (err) {
      setError(err?.message || 'Unable to load change requests.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleDecision = async (decision) => {
    if (!reviewTarget || submitting) return;
    setSubmitting(true);
    try {
      if (reviewTarget.kind === 'profile') {
        await adminApiService.decideChangeRequest(reviewTarget.item.request_id, {
          decision,
          reviewNote,
        });
      } else {
        await adminApiService.decideLifecycleRequest(reviewTarget.item.lifecycle_request_id, {
          decision,
          reviewNote,
        });
      }
      showAdminToast?.({
        title: `Request ${decision}d`,
        description: 'The request status has been updated.',
      });
      setReviewTarget(null);
      setReviewNote('');
      await loadAll();
    } catch (err) {
      setError(err?.message || `Unable to ${decision} request.`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <Button
            type="button"
            size="sm"
            variant={subTab === 'profile' ? 'primary' : 'outline'}
            onClick={() => setSubTab('profile')}
          >
            Profile &amp; Verification Changes ({changeRequests.length})
          </Button>
          <Button
            type="button"
            size="sm"
            variant={subTab === 'lifecycle' ? 'primary' : 'outline'}
            onClick={() => setSubTab('lifecycle')}
          >
            Account Reactivation &amp; Deletion ({lifecycleRequests.length})
          </Button>
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Filter change requests by status"
          style={{
            padding: '7px 10px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-primary)',
            background: 'var(--surface-primary)',
            color: 'var(--text-primary)',
          }}
        >
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="all">All statuses</option>
        </select>
      </div>

      {error && <p role="alert" style={{ color: '#b91c1c', margin: 0 }}>{error}</p>}
      {loading && <p className="admin-muted" style={{ margin: 0 }}>Loading requests...</p>}

      {!loading && subTab === 'profile' && (
        changeRequests.length === 0 ? (
          <p className="admin-muted">No profile/verification change requests match this filter.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {changeRequests.map((item) => (
              <div
                key={item.request_id}
                style={{
                  padding: '14px 16px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-primary)',
                  background: 'var(--surface-primary)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: '12px',
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <strong>
                      #{item.request_id} · {item.entity_type === 'restaurant' ? 'Restaurant' : 'Rider'}
                      {item.target_name ? ` (${item.target_name})` : ''}
                    </strong>
                    <Badge variant={badgeVariant(item.status)} size="sm">{item.status}</Badge>
                  </div>
                  <small style={{ color: 'var(--text-secondary)' }}>
                    Requested by: {item.requester_name || item.requester_email || `User #${item.requested_by_user_id}`}
                  </small>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-primary)' }}>
                    <strong>Changes:</strong>{' '}
                    {Object.entries(item.payload || {}).map(([k, v]) => `${k} = ${v}`).join(' · ') || 'Document verification'}
                  </div>
                  {item.reason && (
                    <small style={{ color: 'var(--text-secondary)' }}>Reason: {item.reason}</small>
                  )}
                  {Array.isArray(item.documents) && item.documents.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '4px' }}>
                      {item.documents.map((doc) => (
                        <a
                          key={doc.index}
                          href={adminApiService.getChangeRequestDocumentUrl(item.request_id, doc.index)}
                          target="_blank"
                          rel="noreferrer"
                          className="salo-partner-status-link"
                          style={{ fontSize: 'var(--font-size-xs)' }}
                        >
                          📄 {doc.original_name}
                        </a>
                      ))}
                    </div>
                  )}
                </div>

                {item.status === 'pending' && canApprove && (
                  <Button
                    type="button"
                    size="sm"
                    variant="primary"
                    onClick={() => {
                      setReviewTarget({ kind: 'profile', item });
                      setReviewNote('');
                    }}
                  >
                    Review
                  </Button>
                )}
              </div>
            ))}
          </div>
        )
      )}

      {!loading && subTab === 'lifecycle' && (
        lifecycleRequests.length === 0 ? (
          <p className="admin-muted">No account lifecycle requests match this filter.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {lifecycleRequests.map((item) => (
              <div
                key={item.lifecycle_request_id}
                style={{
                  padding: '14px 16px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-primary)',
                  background: 'var(--surface-primary)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: '12px',
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <strong>
                      #{item.lifecycle_request_id} · {item.request_type.toUpperCase()}
                    </strong>
                    <Badge variant={badgeVariant(item.status)} size="sm">{item.status}</Badge>
                  </div>
                  <small style={{ color: 'var(--text-secondary)' }}>
                    User: {item.user_name} ({item.email}) · Current status: {item.account_status}
                  </small>
                  {item.reason && (
                    <small style={{ color: 'var(--text-secondary)' }}>Reason: {item.reason}</small>
                  )}
                </div>

                {item.status === 'pending' && canApprove && (
                  <Button
                    type="button"
                    size="sm"
                    variant="primary"
                    onClick={() => {
                      setReviewTarget({ kind: 'lifecycle', item });
                      setReviewNote('');
                    }}
                  >
                    Review
                  </Button>
                )}
              </div>
            ))}
          </div>
        )
      )}

      <Modal
        open={Boolean(reviewTarget)}
        onClose={submitting ? undefined : () => setReviewTarget(null)}
        title="Review Request"
        size="sm"
        footer={(
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <Button type="button" variant="ghost" size="sm" onClick={() => setReviewTarget(null)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="button" variant="danger-outline" size="sm" onClick={() => handleDecision('reject')} disabled={submitting}>
              Reject
            </Button>
            <Button type="button" variant="primary" size="sm" onClick={() => handleDecision('approve')} loading={submitting}>
              Approve
            </Button>
          </div>
        )}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <p style={{ margin: 0, fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' }}>
            Approving will immediately apply the requested change and notify the user.
          </p>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: 'var(--font-size-xs)' }}>
            <span>Review Note (optional)</span>
            <textarea
              rows={3}
              value={reviewNote}
              onChange={(e) => setReviewNote(e.target.value)}
              placeholder="Add an approval or rejection note"
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '8px 10px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-primary)',
                background: 'var(--input-bg)',
                color: 'var(--text-primary)',
                font: 'inherit',
              }}
            />
          </label>
        </div>
      </Modal>
    </div>
  );
}
