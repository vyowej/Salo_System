import { useState } from 'react';
import Button from '../../../components/common/Button';
import { Modal, PageHeader, StateView } from '../components';
import useAdminSession from '../contexts/useAdminSession';
import { useAdminPageSearch } from '../contexts/useAdminSearch';
import { formatDateTime } from '../utils/format';
import AdminLayout from '../../../layouts/AdminLayout';
import './AdminPages.css';

export default function AdminSecuritySettingsPage() {
  useAdminPageSearch({ disabled: true });
  const { sessions, revokedAfter, revokeOtherSessions } = useAdminSession();
  const [revokeOpen, setRevokeOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const handleRevokeOthers = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    setNotice('');
    try {
      await revokeOtherSessions({ password, reason });
      setRevokeOpen(false);
      setPassword('');
      setReason('');
      setNotice('All other active sessions have been revoked. Your current session remains active.');
    } catch (err) {
      setError(err?.message || 'Unable to revoke other sessions.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AdminLayout>
      <section className="admin-shell-page">
        <PageHeader
          title="Security and Sessions"
          description="Review your current administrator session and revoke any other active sessions."
          actions={(
            <Button variant="danger-outline" size="sm" onClick={() => setRevokeOpen(true)}>
              Revoke other sessions
            </Button>
          )}
        />

        {notice && <div className="admin-inline-notice" role="status" style={{ marginBottom: 12 }}>{notice}</div>}
        {revokedAfter && (
          <p style={{ margin: '0 0 12px', fontSize: '0.85rem', opacity: 0.8 }}>
            Previous sessions issued before {formatDateTime(new Date(revokedAfter * 1000).toISOString())} have been revoked.
          </p>
        )}

        <StateView state={sessions.length ? 'success' : 'empty'} title="No active sessions found">
          <div className="admin-session-list">
            {sessions.map((session) => (
              <article className="admin-session-row" key={session.id}>
                <div>
                  <strong>{session.device}{session.current ? ' · Current session' : ''}</strong>
                  <p>{session.location}</p>
                  <time dateTime={session.last_seen || session.lastSeen}>
                    Issued {formatDateTime(session.last_seen || session.lastSeen)}
                  </time>
                </div>
                <span>{session.current ? 'Active (Current)' : 'Active'}</span>
              </article>
            ))}
          </div>
        </StateView>

        <Modal open={revokeOpen} title="Revoke all other sessions?" onClose={() => !submitting && setRevokeOpen(false)}>
          <form onSubmit={handleRevokeOthers} style={{ display: 'grid', gap: 12 }}>
            <p style={{ margin: 0, fontSize: '0.9rem' }}>
              Enter your administrator password to sign out all other devices/browsers while keeping this current session active.
            </p>
            {error && <div className="admin-inline-error" role="alert">{error}</div>}
            <label style={{ display: 'grid', gap: 4 }}>
              <span>Current password (required)</span>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </label>
            <label style={{ display: 'grid', gap: 4 }}>
              <span>Reason (optional)</span>
              <input type="text" maxLength={255} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Routine security check" />
            </label>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Button type="button" variant="outline" onClick={() => setRevokeOpen(false)} disabled={submitting}>Cancel</Button>
              <Button type="submit" variant="danger-outline" disabled={submitting}>
                {submitting ? 'Revoking...' : 'Revoke Other Sessions'}
              </Button>
            </div>
          </form>
        </Modal>
      </section>
    </AdminLayout>
  );
}
