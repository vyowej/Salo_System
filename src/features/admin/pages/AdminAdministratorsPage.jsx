import { useMemo, useState } from 'react';
import AdminLayout from '../../../layouts/AdminLayout';
import Button from '../../../components/common/Button';
import {
  ADMIN_MODULES,
  ADMIN_PERMISSION_ACTIONS,
  ADMIN_PERMISSION_MATRIX,
  ADMIN_ROLE_LIST,
} from '../constants';
import {
  ConfirmDialog,
  DataTable,
  DetailDrawer,
  PageHeader,
  StatusBadge,
  Tabs,
  Timeline,
} from '../components';
import { getAdminMock } from '../mocks';
import useAdminSession from '../contexts/useAdminSession';
import { formatDateTime } from '../utils/format';
import './AdminPages.css';

const INITIAL_ADMINS = getAdminMock('administrators').data.map((admin) => ({ ...admin }));
const DIRECTORY = getAdminMock('accounts').data;
const INITIAL_ACTIVITY = getAdminMock('administratorActivity').data;
const MODULE_LABELS = {
  dashboard: 'Dashboard', accounts: 'Accounts', administrators: 'Administrators',
  restaurants: 'Restaurants', riders: 'Riders', orders: 'Orders', reservations: 'Reservations',
  finance: 'Finance', fees: 'Fees and commissions', discounts: 'Discounts and promotions',
  serviceAreas: 'Service areas', reports: 'Reports and analytics', support: 'Support and complaints',
  content: 'Content management', activity: 'Activity logs', settings: 'Settings',
};

function clonePermissions(source = {}) {
  return Object.fromEntries(ADMIN_MODULES.map((module) => [module, [...(source[module] || [])]]));
}

function PermissionEditor({ value, onChange }) {
  function toggle(module, action, checked) {
    onChange({
      ...value,
      [module]: checked
        ? [...new Set([...(value[module] || []), action])]
        : (value[module] || []).filter((item) => item !== action),
    });
  }

  return (
    <div className="admin-permission-grid-wrap">
      <table className="admin-permission-grid">
        <thead><tr><th scope="col">Module</th>{ADMIN_PERMISSION_ACTIONS.map((action) => <th scope="col" key={action}>{action.replace('_', ' ')}</th>)}</tr></thead>
        <tbody>{ADMIN_MODULES.map((module) => (
          <tr key={module}>
            <th scope="row">{MODULE_LABELS[module]}</th>
            {ADMIN_PERMISSION_ACTIONS.map((action) => (
              <td key={action}><input type="checkbox" aria-label={`${MODULE_LABELS[module]} ${action}`} checked={value[module]?.includes(action) || false} onChange={(event) => toggle(module, action, event.target.checked)} /></td>
            ))}
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

export default function AdminAdministratorsPage() {
  const { permissions } = useAdminSession();
  const [admins, setAdmins] = useState(INITIAL_ADMINS);
  const [roleFilter, setRoleFilter] = useState('All roles');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [detailTab, setDetailTab] = useState('Profile');
  const [wizardStep, setWizardStep] = useState(0);
  const [inviteLookup, setInviteLookup] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteRole, setInviteRole] = useState(ADMIN_ROLE_LIST[1]);
  const [invitePermissions, setInvitePermissions] = useState(() => clonePermissions(ADMIN_PERMISSION_MATRIX[ADMIN_ROLE_LIST[1]]));
  const [permissionDraft, setPermissionDraft] = useState(null);
  const [editingPermissions, setEditingPermissions] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const [notice, setNotice] = useState('');
  const canManagePermissions = permissions.administrators?.includes('manage_permissions') || permissions.administrators?.includes('create');
  const lastActiveSuperAdmin = admins.filter((admin) => admin.role === 'Super Admin' && admin.status === 'Active').length <= 1;

  const matchingAccounts = useMemo(() => {
    const term = inviteLookup.trim().toLowerCase();
    if (!term) return [];
    return DIRECTORY.filter((account) => account.email.toLowerCase().includes(term) || account.username?.toLowerCase().includes(term)).slice(0, 5);
  }, [inviteLookup]);
  const visibleAdmins = admins.filter((admin) => {
    const term = search.trim().toLowerCase();
    return (roleFilter === 'All roles' || admin.role === roleFilter)
      && (!term || [admin.name, admin.email, admin.username, admin.status].some((value) => String(value || '').toLowerCase().includes(term)));
  });

  function chooseInviteAccount(account) {
    setInviteEmail(account.email);
    setInviteName(account.name);
    setInviteLookup(`@${account.username || account.email}`);
  }

  function startInvite() {
    setWizardStep(1);
    setInviteLookup('');
    setInviteEmail('');
    setInviteName('');
    setInviteRole(ADMIN_ROLE_LIST[1]);
    setInvitePermissions(clonePermissions(ADMIN_PERMISSION_MATRIX[ADMIN_ROLE_LIST[1]]));
  }

  function sendInvitation() {
    const normalizedEmail = inviteEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) || admins.some((admin) => admin.email.toLowerCase() === normalizedEmail)) {
      setNotice('Enter a valid, unique email address before sending an invitation.');
      return;
    }
    const account = DIRECTORY.find((item) => item.email.toLowerCase() === normalizedEmail);
    setPendingAction({
      action: 'Send invitation',
      invite: {
        id: `admin-demo-${Date.now()}`,
        name: inviteName || account?.name || normalizedEmail.split('@')[0],
        username: account?.username || null,
        email: normalizedEmail,
        role: inviteRole,
        status: 'Pending Invitation',
        invitationStatus: 'Pending',
        invitedAt: new Date().toISOString(),
        lastActive: null,
        accountExists: Boolean(account),
        assignedPermissions: invitePermissions,
        activePermissions: [],
      },
    });
  }

  function requestAction(admin, action, nextRole, nextPermissions) {
    if (admin.isSuperAdmin && admin.status === 'Active' && lastActiveSuperAdmin && ['Deactivate', 'Revoke access', 'Change role'].includes(action)) {
      setNotice('This action is blocked because this is the last active Super Admin.');
      return;
    }
    setPendingAction({ admin, action, nextRole, nextPermissions });
  }

  function applyAction({ reason }) {
    if (pendingAction.action === 'Send invitation') {
      const newAdmin = {
        ...pendingAction.invite,
        activity: [{
          id: `invited-${Date.now()}`,
          title: 'Administrator invitation recorded',
          description: `Invitation prepared with ${pendingAction.invite.role} role. Reason: ${reason}. Access remains inactive until acceptance and required verification.`,
          time: new Date().toISOString(),
        }],
      };
      setAdmins((previous) => [newAdmin, ...previous]);
      setSelected(newAdmin);
      setDetailTab('Activity');
      setWizardStep(0);
      setNotice(`Demo invitation recorded for ${newAdmin.email}. Access remains inactive until accepted and verified; no email was sent.`);
      setPendingAction(null);
      return;
    }
    const { admin, action, nextRole, nextPermissions } = pendingAction;
    const now = new Date().toISOString();
    let updated = { ...admin };
    if (action === 'Change role') {
      const nextRolePermissions = clonePermissions(ADMIN_PERMISSION_MATRIX[nextRole]);
      updated = { ...updated, role: nextRole, assignedPermissions: nextRolePermissions, activePermissions: updated.status === 'Active' ? nextRolePermissions : [] };
    }
    if (action === 'Update permissions') updated = {
      ...updated,
      assignedPermissions: nextPermissions,
      activePermissions: updated.status === 'Active' ? nextPermissions : [],
    };
    if (action === 'Activate') updated = { ...updated, status: 'Active' };
    if (action === 'Deactivate') updated = { ...updated, status: 'Inactive' };
    if (action === 'Revoke access') updated = { ...updated, status: 'Deactivated', invitationStatus: 'Revoked' };
    if (action === 'Resend invitation') updated = { ...updated, status: 'Pending Invitation', invitationStatus: 'Pending' };
    updated.activity = [
      ...(updated.activity || []),
      { id: `admin-action-${Date.now()}`, title: action, description: `Recorded by the current demo administrator. Reason: ${reason}`, time: now },
    ];
    setAdmins((previous) => previous.map((item) => item.id === admin.id ? updated : item));
    setSelected(updated);
    setEditingPermissions(false);
    setPermissionDraft(null);
    setNotice(`${admin.name}: ${action.toLowerCase()} recorded in demo history.`);
    setPendingAction(null);
  }

  const columns = [
    { key: 'name', label: 'Administrator', render: (admin) => <button className="admin-text-link" type="button" onClick={() => { setSelected(admin); setDetailTab('Profile'); }}><strong>{admin.name}</strong><span>{admin.email}</span></button> },
    { key: 'role', label: 'Role' },
    { key: 'status', label: 'Account / invitation', render: (admin) => <><StatusBadge status={admin.status} /><br /><span className="admin-muted">{admin.invitationStatus || '—'}</span></> },
    { key: 'invitedAt', label: 'Added', render: (admin) => formatDateTime(admin.invitedAt) },
    { key: 'lastActive', label: 'Last active', render: (admin) => admin.lastActive ? formatDateTime(admin.lastActive) : 'Never' },
    { key: 'actions', label: 'Actions', render: (admin) => <div className="admin-action-row">
      {admin.status === 'Active' ? <button className="admin-action-button" type="button" onClick={() => requestAction(admin, 'Deactivate')}>Deactivate</button> : admin.invitationStatus === 'Accepted' && <button className="admin-action-button" type="button" onClick={() => requestAction(admin, 'Activate')}>Activate</button>}
      {(admin.invitationStatus === 'Pending' || admin.invitationStatus === 'Expired') && <button className="admin-action-button" type="button" onClick={() => requestAction(admin, 'Resend invitation')}>Resend</button>}
      {['Pending', 'Expired', 'Accepted'].includes(admin.invitationStatus) && <button className="admin-action-button admin-action-button--danger" type="button" onClick={() => requestAction(admin, 'Revoke access')}>Revoke</button>}
    </div> },
  ];

  return (
    <AdminLayout>
      <section className="admin-shell-page">
        <PageHeader
          title="Administrators"
          description="Manage individual staff accounts, scoped permissions, invitations, and administrator activity."
          actions={canManagePermissions ? <Button variant="primary" onClick={startInvite}>Add Administrator</Button> : null}
        />
        <div className="admin-shell-note"><strong>Individual accounts only.</strong> Shared administrator credentials are not allowed. Demo invitations do not grant access until accepted and verified; backend enforcement is required in production.</div>
        {notice && <p className="admin-inline-notice" role="status">{notice}</p>}

        {wizardStep > 0 && (
          <section className="admin-record-panel admin-invite-wizard" aria-label="Add Administrator workflow">
            <header><h2>Add Administrator · Step {wizardStep} of 3</h2><button className="admin-action-button" type="button" onClick={() => setWizardStep(0)}>Cancel</button></header>
            {wizardStep === 1 && <>
              <p>Find an existing SALO account by registered email or username.</p>
              <label className="admin-filter-control">Search SALO users<input value={inviteLookup} onChange={(event) => { setInviteLookup(event.target.value); setInviteEmail(''); }} placeholder="Email address or username" /></label>
              {matchingAccounts.length > 0 && <ul className="admin-suggestion-list">{matchingAccounts.map((account) => <li key={account.id}><button type="button" onClick={() => chooseInviteAccount(account)}>{account.name} · @{account.username} · {account.email}</button></li>)}</ul>}
              <label className="admin-filter-control">Registered email<input type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="person@example.com" /></label>
              <label className="admin-filter-control">Administrator name<input value={inviteName} onChange={(event) => setInviteName(event.target.value)} /></label>
              <label className="admin-filter-control">Predefined role<select value={inviteRole} onChange={(event) => { setInviteRole(event.target.value); setInvitePermissions(clonePermissions(ADMIN_PERMISSION_MATRIX[event.target.value])); }}>{ADMIN_ROLE_LIST.filter((role) => role !== 'Super Admin').map((role) => <option key={role}>{role}</option>)}</select></label>
              <Button variant="primary" onClick={() => { if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteEmail.trim())) { setNotice('Choose an existing SALO account or enter a valid email address.'); return; } setWizardStep(2); }}>Continue to permissions</Button>
            </>}
            {wizardStep === 2 && <>
              <p>Review and adjust permissions by module and action. Unchecked actions remain unavailable.</p>
              <PermissionEditor value={invitePermissions} onChange={setInvitePermissions} />
              <div className="admin-action-row"><Button variant="outline" onClick={() => setWizardStep(1)}>Back</Button><Button variant="primary" onClick={() => setWizardStep(3)}>Review invitation</Button></div>
            </>}
            {wizardStep === 3 && <>
              <h3>Invitation review</h3>
              <ul className="admin-detail-list"><li><strong>Account</strong>{inviteName || inviteEmail} · {inviteEmail}</li><li><strong>Role</strong>{inviteRole}</li><li><strong>Assigned permissions</strong>{ADMIN_MODULES.reduce((count, module) => count + (invitePermissions[module]?.length || 0), 0)} actions across all modules</li><li><strong>Access status</strong>Pending acceptance and verification; no active permissions</li></ul>
              <p>For a person without a SALO account, secure account creation and verification must be completed before access is activated. This demo records an invitation only; it does not send email.</p>
              <div className="admin-action-row"><Button variant="outline" onClick={() => setWizardStep(2)}>Back</Button><Button variant="primary" onClick={sendInvitation}>Send invitation</Button></div>
            </>}
          </section>
        )}

        <div className="admin-filter-bar">
          <label className="admin-filter-control">Search<input aria-label="Search administrators" placeholder="Name, email, username, or status" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
          <label className="admin-filter-control">Role<select aria-label="Filter administrators by role" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}><option>All roles</option>{ADMIN_ROLE_LIST.map((role) => <option key={role}>{role}</option>)}</select></label>
        </div>
        <DataTable columns={columns} rows={visibleAdmins} emptyTitle="No matching administrators" emptyDescription="Try a different search or role filter." />
      </section>

      <DetailDrawer open={Boolean(selected)} title={selected?.name || 'Administrator details'} onClose={() => setSelected(null)}>
        {selected && <>
          <p className="admin-muted">{selected.email} · {selected.role} · <StatusBadge status={selected.invitationStatus || selected.status} /></p>
          <Tabs items={['Profile', 'Permissions', 'Activity']} value={detailTab} onChange={setDetailTab} label="Administrator detail sections" />
          {detailTab === 'Profile' && <div className="admin-drawer-content">
            <ul className="admin-detail-list">
              <li><strong>Username</strong>@{selected.username || '—'}</li>
              <li><strong>Last active</strong>{selected.lastActive ? formatDateTime(selected.lastActive) : 'Never'}</li>
              <li><strong>Invitation</strong>{selected.invitationStatus || 'Accepted'}</li>
              <li><strong>Account status</strong><StatusBadge status={selected.status} /></li>
            </ul>
            {canManagePermissions && <div className="admin-action-row">
              <label className="admin-filter-control">Change role<select aria-label="Change administrator role" value={selected.role} onChange={(event) => requestAction(selected, 'Change role', event.target.value)}>{ADMIN_ROLE_LIST.map((role) => <option key={role}>{role}</option>)}</select></label>
              {selected.status === 'Active' ? <button className="admin-action-button" type="button" onClick={() => requestAction(selected, 'Deactivate')}>Deactivate</button> : selected.invitationStatus === 'Accepted' && <button className="admin-action-button" type="button" onClick={() => requestAction(selected, 'Activate')}>Activate</button>}
              {(selected.invitationStatus === 'Pending' || selected.invitationStatus === 'Expired') && <button className="admin-action-button" type="button" onClick={() => requestAction(selected, 'Resend invitation')}>Resend invitation</button>}
              {['Pending', 'Expired', 'Accepted'].includes(selected.invitationStatus) && <button className="admin-action-button admin-action-button--danger" type="button" onClick={() => requestAction(selected, 'Revoke access')}>Revoke access</button>}
            </div>}
            {selected.isSuperAdmin && <p className="admin-shell-note">This is the demo Super Admin account. The last active Super Admin cannot be deactivated, revoked, or demoted.</p>}
          </div>}
          {detailTab === 'Permissions' && <div className="admin-record-panel">
            <h3>Assigned permissions</h3>
            {canManagePermissions && !editingPermissions && <Button variant="outline" onClick={() => { setPermissionDraft(clonePermissions(selected.assignedPermissions || ADMIN_PERMISSION_MATRIX[selected.role])); setEditingPermissions(true); }}>Edit permissions</Button>}
            {editingPermissions && <><PermissionEditor value={permissionDraft || {}} onChange={setPermissionDraft} /><div className="admin-action-row"><Button variant="ghost" onClick={() => { setEditingPermissions(false); setPermissionDraft(null); }}>Cancel</Button><Button variant="primary" onClick={() => requestAction(selected, 'Update permissions', undefined, permissionDraft)}>Review permission change</Button></div></>}
            {!editingPermissions && ADMIN_MODULES.map((module) => {
              const assigned = selected.assignedPermissions && Object.hasOwn(selected.assignedPermissions, module)
                ? selected.assignedPermissions[module]
                : ADMIN_PERMISSION_MATRIX[selected.role]?.[module] || [];
              return <p key={module}><strong>{MODULE_LABELS[module]}:</strong> {assigned.join(', ') || 'No access'}</p>;
            })}
            <p className="admin-muted">Pending invitations have no active permissions. Backend authorization must enforce these permissions independently.</p>
          </div>}
          {detailTab === 'Activity' && <Timeline items={[...(selected.activity || []), ...INITIAL_ACTIVITY.filter((item) => item.adminId === selected.id)]} />}
        </>}
      </DetailDrawer>

      <ConfirmDialog
        open={Boolean(pendingAction)}
        title={pendingAction?.action === 'Send invitation' ? 'Confirm administrator invitation' : `${pendingAction?.action || 'Confirm'} administrator`}
        description={pendingAction?.action === 'Send invitation'
          ? 'Record a demo invitation. No email will be sent, and access remains disabled until acceptance and required verification.'
          : 'This administrative change is recorded in the demo activity history and requires a reason. Verify the operator again in a real backend.'}
        confirmLabel={pendingAction?.action || 'Confirm'}
        requireReauthentication
        requireReason
        onClose={() => setPendingAction(null)}
        onConfirm={applyAction}
      />
    </AdminLayout>
  );
}
