import { useState } from 'react';
import Button from '../../../components/common/Button';
import { ConfirmDialog, PageHeader, StateView } from '../components';
import useAdminSession from '../contexts/useAdminSession';
import { useAdminPageSearch } from '../contexts/useAdminSearch';
import { formatDateTime } from '../utils/format';
import AdminLayout from '../../../layouts/AdminLayout';
import './AdminPages.css';

export default function AdminSecuritySettingsPage() {
  useAdminPageSearch({ disabled: true });
  const { sessions, revokeSession } = useAdminSession();
  const [selectedSession, setSelectedSession] = useState(null);

  return (
    <AdminLayout>
      <section className="admin-shell-page">
        <PageHeader title="Security and Sessions" description="Review active sessions associated with your administrator account." />

        <StateView state={sessions.length ? 'success' : 'empty'} title="sessions">
          <div className="admin-session-list">
            {sessions.map((session) => (
              <article className="admin-session-row" key={session.id}>
                <div>
                  <strong>{session.device}{session.current ? ' · Current session' : ''}</strong>
                  <p>{session.location}</p>
                  <time dateTime={session.lastSeen}>Last active {formatDateTime(session.lastSeen)}</time>
                </div>
                {session.revoked ? (
                  <span>Revoked</span>
                ) : session.current ? (
                  <span>Active</span>
                ) : (
                  <Button variant="danger-outline" onClick={() => setSelectedSession(session)}>Revoke</Button>
                )}
              </article>
            ))}
          </div>
        </StateView>
        <ConfirmDialog
          open={Boolean(selectedSession)}
          title="Revoke this session?"
          description={selectedSession ? `Sign out ${selectedSession.device} (${selectedSession.location})?` : ''}
          confirmLabel="Revoke session"
          requireReauthentication
          requireReason
          onClose={() => setSelectedSession(null)}
          onConfirm={() => {
            if (selectedSession) revokeSession(selectedSession.id);
            setSelectedSession(null);
          }}
        />
      </section>
    </AdminLayout>
  );
}
