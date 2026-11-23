import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Button from '../../../components/common/Button';
import AdminLayout from '../../../layouts/AdminLayout';
import adminApiService from '../../../services/adminApiService';
import { ConfirmDialog, DataTable, Modal, PageHeader, StateView, StatusBadge } from '../components';
import useAdminSession from '../contexts/useAdminSession';
import { useAdminPageSearch } from '../contexts/useAdminSearch';
import { formatDateTime } from '../utils/format';
import './AdminPages.css';

export default function AdminAdministratorsPage() {
  useAdminPageSearch({ disabled: true });
  const { currentAdmin } = useAdminSession();
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({
    username: '',
    first_name: '',
    last_name: '',
    email: '',
    password: '',
  });
  const [pendingAction, setPendingAction] = useState(null);
  const [savingAction, setSavingAction] = useState(false);

  const loadAdmins = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await adminApiService.getUsers({ role: 'admin', per_page: 100 });
      setAdmins(res?.items ?? []);
    } catch (err) {
      setError(err?.message || 'Unable to load administrators.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAdmins();
  }, [loadAdmins]);

  const handleCreateAdmin = async (event) => {
    event.preventDefault();
    setCreating(true);
    setActionError('');
    setNotice('');
    try {
      await adminApiService.createUser({
        ...createForm,
        user_role: 'admin',
        account_status: 'active',
      });
      setCreateOpen(false);
      setCreateForm({ username: '', first_name: '', last_name: '', email: '', password: '' });
      setNotice('Administrator created. They will be required to change their temporary password on first login.');
      await loadAdmins();
    } catch (err) {
      setActionError(err?.message || 'Unable to create administrator.');
    } finally {
      setCreating(false);
    }
  };

  const handleConfirmAction = async (reason) => {
    if (!pendingAction) return;
    setSavingAction(true);
    setActionError('');
    setNotice('');
    try {
      if (pendingAction.type === 'revoke') {
        await adminApiService.revokeUserSessions(pendingAction.user.user_id, { reason });
        setNotice(`Revoked active sessions for ${pendingAction.user.email}.`);
      } else {
        const nextStatus = pendingAction.type === 'suspend' ? 'suspended' : 'active';
        await adminApiService.updateUser(pendingAction.user.user_id, { account_status: nextStatus, reason });
        setNotice(`Administrator ${pendingAction.user.email} is now ${nextStatus}.`);
      }
      setPendingAction(null);
      await loadAdmins();
    } catch (err) {
      setPendingAction(null);
      setActionError(err?.message || 'Unable to update administrator.');
    } finally {
      setSavingAction(false);
    }
  };

  return (
    <AdminLayout>
      <section className="admin-shell-page">
        <PageHeader
          title="Administrators"
          description="Manage platform administrator accounts, account status, and session revocation."
          actions={(
            <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
              New Administrator
            </Button>
          )}
        />

        {notice && <div className="admin-inline-notice" role="status" style={{ marginBottom: 12 }}>{notice}</div>}
        {actionError && <div className="admin-inline-error" role="alert" style={{ marginBottom: 12 }}>{actionError}</div>}

        {loading ? (
          <StateView state="loading" title="Loading administrators..." />
        ) : error ? (
          <StateView
            state="error"
            title="Unable to load administrators"
            description={error}
            action={<Button variant="primary" size="sm" onClick={loadAdmins}>Retry</Button>}
          />
        ) : (
          <StateView state={admins.length ? 'success' : 'empty'} title="No administrators found">
            <DataTable
              rows={admins}
              rowKey={(row) => row.user_id}
              columns={[
                {
                  key: 'name',
                  label: 'Administrator',
                  render: (row) => (
                    <div>
                      <strong>{[row.first_name, row.last_name].filter(Boolean).join(' ') || row.username}</strong>
                      {Number(row.user_id) === Number(currentAdmin?.id) && (
                        <span style={{ marginLeft: 8, fontSize: '0.75rem', opacity: 0.75 }}>(You)</span>
                      )}
                      <div style={{ fontSize: '0.82rem', opacity: 0.75 }}>{row.email}</div>
                    </div>
                  ),
                },
                { key: 'status', label: 'Status', render: (row) => <StatusBadge status={row.account_status} /> },
                { key: 'created_at', label: 'Created', render: (row) => formatDateTime(row.created_at) },
                {
                  key: 'actions',
                  label: 'Actions',
                  render: (row) => {
                    const isSelf = Number(row.user_id) === Number(currentAdmin?.id);
                    const isActive = row.account_status === 'active';
                    return (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <Link to={`/admin/administrators/${row.user_id}`} className="admin-link-action">View</Link>
                        {!isSelf && (
                          <>
                            <Button
                              variant={isActive ? 'danger-outline' : 'secondary'}
                              size="sm"
                              onClick={() => setPendingAction({ type: isActive ? 'suspend' : 'activate', user: row })}
                            >
                              {isActive ? 'Suspend' : 'Activate'}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setPendingAction({ type: 'revoke', user: row })}
                            >
                              Revoke Sessions
                            </Button>
                          </>
                        )}
                      </div>
                    );
                  },
                },
              ]}
            />
          </StateView>
        )}

        <Modal open={createOpen} title="Create Administrator" onClose={() => !creating && setCreateOpen(false)}>
          <form onSubmit={handleCreateAdmin} style={{ display: 'grid', gap: 12 }}>
            <p style={{ margin: 0, fontSize: '0.85rem', opacity: 0.8 }}>
              New administrators must change their temporary password on first login.
            </p>
            <label style={{ display: 'grid', gap: 4 }}>
              <span>Username</span>
              <input value={createForm.username} onChange={(e) => setCreateForm((p) => ({ ...p, username: e.target.value }))} required />
            </label>
            <label style={{ display: 'grid', gap: 4 }}>
              <span>First name</span>
              <input value={createForm.first_name} onChange={(e) => setCreateForm((p) => ({ ...p, first_name: e.target.value }))} required />
            </label>
            <label style={{ display: 'grid', gap: 4 }}>
              <span>Last name</span>
              <input value={createForm.last_name} onChange={(e) => setCreateForm((p) => ({ ...p, last_name: e.target.value }))} required />
            </label>
            <label style={{ display: 'grid', gap: 4 }}>
              <span>Email</span>
              <input type="email" value={createForm.email} onChange={(e) => setCreateForm((p) => ({ ...p, email: e.target.value }))} required />
            </label>
            <label style={{ display: 'grid', gap: 4 }}>
              <span>Temporary password (min 8 chars)</span>
              <input type="password" minLength={8} value={createForm.password} onChange={(e) => setCreateForm((p) => ({ ...p, password: e.target.value }))} required />
            </label>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>Cancel</Button>
              <Button type="submit" variant="primary" disabled={creating}>{creating ? 'Creating...' : 'Create Administrator'}</Button>
            </div>
          </form>
        </Modal>

        <ConfirmDialog
          open={Boolean(pendingAction)}
          title={
            pendingAction?.type === 'revoke'
              ? 'Revoke administrator sessions?'
              : pendingAction?.type === 'suspend'
                ? 'Suspend administrator account?'
                : 'Activate administrator account?'
          }
          description={pendingAction ? `Target account: ${pendingAction.user.email}` : ''}
          confirmLabel={savingAction ? 'Processing...' : 'Confirm'}
          requireReason
          onClose={() => !savingAction && setPendingAction(null)}
          onConfirm={handleConfirmAction}
        />
      </section>
    </AdminLayout>
  );
}
