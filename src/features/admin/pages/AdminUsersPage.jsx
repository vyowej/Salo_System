import { useMemo, useState } from 'react';
import AdminLayout from '../../../layouts/AdminLayout';
import { getAdminMock } from '../mocks';
import {
  ConfirmDialog,
  DataTable,
  DetailDrawer,
  PageHeader,
  StatusBadge,
  Tabs,
  Timeline,
} from '../components';
import useAdminSession from '../contexts/useAdminSession';
import { ADMIN_ACCOUNT_CAPABILITIES, ADMIN_ACCOUNT_STATUSES } from '../constants';
import { formatDate } from '../utils/format';
import './AdminPages.css';

const INITIAL_ACCOUNTS = getAdminMock('accounts').data.map((account) => ({ ...account }));
const ORDERS = getAdminMock('orders').data;
const RESERVATIONS = getAdminMock('reservations').data;

export default function AdminUsersPage() {
  const { permissions } = useAdminSession();
  const [accounts, setAccounts] = useState(INITIAL_ACCOUNTS);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All statuses');
  const [capabilityFilter, setCapabilityFilter] = useState('All capabilities');
  const [selected, setSelected] = useState(null);
  const [tab, setTab] = useState('Overview');
  const [confirm, setConfirm] = useState(null);
  const [notice, setNotice] = useState('');
  const canEdit = Boolean(permissions.accounts?.some((action) => ['edit', 'activate', 'deactivate', 'delete'].includes(action)));

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return accounts.filter((account) => {
      const matchesSearch = !term || [
        account.name, account.username, account.email, account.phone, account.id,
      ].some((value) => String(value || '').toLowerCase().includes(term));
      const matchesStatus = statusFilter === 'All statuses' || account.status === statusFilter;
      const matchesCapability = capabilityFilter === 'All capabilities' || account.capabilities.includes(capabilityFilter);
      return matchesSearch && matchesStatus && matchesCapability;
    });
  }, [accounts, search, statusFilter, capabilityFilter]);

  const accountOrders = selected
    ? ORDERS.filter((order) => order.customerEmail === selected.email)
    : [];
  const accountReservations = selected
    ? RESERVATIONS.filter((reservation) => reservation.customerEmail === selected.email)
    : [];
  const columns = [
    { key: 'name', label: 'Account', render: (account) => <button className="admin-text-link" type="button" onClick={() => { setSelected(account); setTab('Overview'); }}><strong>{account.name}</strong><span>@{account.username || '—'}</span></button> },
    { key: 'contact', label: 'Contact', render: (account) => <>{account.email}<br />{account.phone || 'No phone on file'}</> },
    { key: 'capabilities', label: 'Capabilities', render: (account) => account.capabilities.join(', ') },
    { key: 'joined', label: 'Registered', render: (account) => formatDate(account.joined) },
    { key: 'ordersCount', label: 'Orders / Reservations', render: (account) => `${account.ordersCount} / ${account.reservationsCount}` },
    { key: 'verificationStatus', label: 'Verification', render: (account) => <StatusBadge status={account.verificationStatus} /> },
    { key: 'status', label: 'Status', render: (account) => <StatusBadge status={account.status} /> },
  ];

  function requestStatus(account, status) {
    setSelected(account);
    setConfirm({ account, status });
  }

  function confirmStatus({ reason }) {
    const { account, status } = confirm;
    const updated = {
      ...account,
      status,
      statusReason: reason,
      accountActivity: [
        ...(account.accountActivity || []),
        { id: `account-status-${Date.now()}`, title: `Account ${status.toLowerCase()}`, description: reason, time: new Date().toISOString() },
      ],
    };
    setAccounts((previous) => previous.map((item) => item.id === account.id ? updated : item));
    setSelected((previous) => previous?.id === account.id ? updated : previous);
    setNotice(`${account.name} is now ${status.toLowerCase()}. Account history is preserved.`);
    setConfirm(null);
  }

  function requestSessionRevocation(account) {
    setConfirm({ account, status: 'Revoke active sessions' });
  }

  function confirmSessionRevocation({ reason }) {
    const account = confirm.account;
    const updated = {
      ...account,
      sessionsRevoked: true,
      sessionRevocationReason: reason,
      accountActivity: [
        ...(account.accountActivity || []),
        { id: `account-session-${Date.now()}`, title: 'Active sessions revoked', description: reason, time: new Date().toISOString() },
      ],
    };
    setAccounts((previous) => previous.map((item) => item.id === account.id ? updated : item));
    setSelected((previous) => previous?.id === account.id ? updated : previous);
    setNotice(`Demo sessions for ${account.name} have been marked revoked.`);
    setConfirm(null);
  }

  const historyItems = selected
    ? [
      ...accountOrders.map((order) => ({ id: order.id, title: `Order ${order.id}`, description: `${order.status} · ${order.restaurants.join(', ')}`, time: order.createdAt })),
      ...accountReservations.map((reservation) => ({ id: reservation.id, title: `Reservation ${reservation.id}`, description: `${reservation.status} · ${reservation.restaurantName} · ${reservation.guests} guests`, time: reservation.reservedAt })),
    ]
    : [];
  const accountActivity = selected
    ? [
      { id: `${selected.id}-registered`, title: 'Account registered', description: 'SALO account registration date from the demo record.', time: `${selected.joined}T09:00:00+08:00` },
      ...(selected.verificationStatus === 'Verified' ? [{ id: `${selected.id}-verified`, title: 'Verification completed', description: 'Verification status is marked as verified in the demo record.', time: `${selected.joined}T09:30:00+08:00` }] : []),
      ...(selected.accountActivity || []),
    ]
    : [];

  return (
    <AdminLayout>
      <section className="admin-shell-page">
        <PageHeader title={`Accounts and Customers (${accounts.length})`} description="Search and review centralized SALO identities, their capabilities, verification, and service history." />
        {notice && <p className="admin-inline-notice" role="status">{notice}</p>}
        <div className="admin-filter-bar">
          <label className="admin-filter-control">Search<input aria-label="Search accounts" placeholder="Name, username, email, phone, or ID" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
          <label className="admin-filter-control">Status<select aria-label="Filter by account status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option>All statuses</option>{ADMIN_ACCOUNT_STATUSES.map((status) => <option key={status}>{status}</option>)}</select></label>
          <label className="admin-filter-control">Capability<select aria-label="Filter by account capability" value={capabilityFilter} onChange={(event) => setCapabilityFilter(event.target.value)}><option>All capabilities</option>{ADMIN_ACCOUNT_CAPABILITIES.map((capability) => <option key={capability}>{capability}</option>)}</select></label>
        </div>
        <DataTable columns={columns} rows={filtered} emptyTitle="No matching accounts" emptyDescription="Adjust the search or filters to find another account." />
      </section>

      <DetailDrawer open={Boolean(selected)} title={selected?.name || 'Account details'} onClose={() => setSelected(null)}>
        {selected && (
          <div className="admin-drawer-content">
            <p className="admin-muted">@{selected.username || 'No username'} · {selected.email}</p>
            <Tabs items={['Overview', 'History', 'Activity', 'Verification']} value={tab} onChange={setTab} label="Account detail sections" />
            {tab === 'Overview' && (
              <>
                <ul className="admin-detail-list">
                  <li><strong>Contact</strong>{selected.phone || 'Not provided'}</li>
                  <li><strong>Registered</strong>{formatDate(selected.joined)}</li>
                  <li><strong>Account status</strong><StatusBadge status={selected.status} /></li>
                  <li><strong>Verification</strong><StatusBadge status={selected.verificationStatus} /></li>
                  <li><strong>Capabilities</strong>{selected.capabilities.map((capability) => <span className="admin-chip" key={capability}>{capability}</span>)}</li>
                  <li><strong>Activity totals</strong>{selected.ordersCount} orders · {selected.reservationsCount} reservations</li>
                </ul>
                {canEdit && (
                  <div className="admin-action-row">
                    {selected.status !== 'Active' && <button className="admin-action-button" type="button" onClick={() => requestStatus(selected, 'Active')}>Activate / Reactivate</button>}
                    {selected.status === 'Active' && <button className="admin-action-button" type="button" onClick={() => requestStatus(selected, 'Suspended')}>Suspend account</button>}
                    {selected.status !== 'Deactivated' && <button className="admin-action-button admin-action-button--danger" type="button" onClick={() => requestStatus(selected, 'Deactivated')}>Deactivate</button>}
                    <button className="admin-action-button" type="button" onClick={() => requestSessionRevocation(selected)}>Revoke sessions</button>
                  </div>
                )}
                <p className="admin-shell-note">Deactivation prevents access to the relevant SALO services. Orders, reservations, payments, and audit history are preserved.</p>
              </>
            )}
            {tab === 'History' && <><p className="admin-muted">{accountOrders.length} recent order record(s) · {accountReservations.length} reservation record(s)</p><Timeline items={historyItems} /></>}
            {tab === 'Activity' && <Timeline items={accountActivity} />}
            {tab === 'Verification' && (
              <div className="admin-record-panel">
                <h3>Identity verification</h3>
                <p>Status: <StatusBadge status={selected.verificationStatus} /></p>
                <p>Evidence and verification results are demo records. Sensitive documents are not displayed in this mock.</p>
                {selected.sessionsRevoked && <p>Sessions marked revoked: {selected.sessionRevocationReason}</p>}
              </div>
            )}
          </div>
        )}
      </DetailDrawer>

      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm?.status === 'Revoke active sessions' ? 'Revoke account sessions?' : `${confirm?.status} account?`}
        description={confirm?.status === 'Revoke active sessions'
          ? 'This demo will mark the account sessions as revoked. No live sessions are affected.'
          : 'This is a demo account action. Historical SALO records remain preserved.'}
        confirmLabel={confirm?.status === 'Revoke active sessions' ? 'Revoke sessions' : confirm?.status}
        requireReauthentication
        requireReason
        onClose={() => setConfirm(null)}
        onConfirm={confirm?.status === 'Revoke active sessions' ? confirmSessionRevocation : confirmStatus}
      />
    </AdminLayout>
  );
}
