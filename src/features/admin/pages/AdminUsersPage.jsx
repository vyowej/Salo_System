import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import AdminLayout from '../../../layouts/AdminLayout';
import { getAdminMock } from '../mocks';
import {
  ConfirmDialog,
  DataTable,
  Modal,
  showAdminToast,
  PageHeader,
  StatusBadge,
  Tabs,
  Timeline,
} from '../components';
import useAdminSession from '../contexts/useAdminSession';
import { useAdminPageSearch } from '../contexts/useAdminSearch';
import { ADMIN_ACCOUNT_CAPABILITIES, ADMIN_ACCOUNT_STATUSES } from '../constants';
import { formatDate, formatDateTime, formatPeso } from '../utils/format';
import './AdminPages.css';

const INITIAL_ACCOUNTS = getAdminMock('accounts').data.map((account) => ({ ...account }));
const ORDERS = getAdminMock('orders').data;
const RESERVATIONS = getAdminMock('reservations').data;

export default function AdminUsersPage() {
  const { permissions } = useAdminSession();
  const { query: globalQuery } = useAdminPageSearch({ scopeLabel: 'Accounts', placeholder: 'Search accounts by name, email, phone, status', searchableFields: ['name', 'username', 'email', 'phone', 'status'] });
  const [accounts, setAccounts] = useState(INITIAL_ACCOUNTS);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All statuses');
  const [capabilityFilter, setCapabilityFilter] = useState('All capabilities');
  const [selected, setSelected] = useState(null);
  const [tab, setTab] = useState('Profile');
  const [confirm, setConfirm] = useState(null);
  const [notice, setNotice] = useState('');
  const canEdit = Boolean(permissions.accounts?.some((action) => ['edit', 'activate', 'deactivate', 'delete'].includes(action)));

  const filtered = useMemo(() => {
    const term = (globalQuery || search).trim().toLowerCase();
    return accounts.filter((account) => {
      const matchesSearch = !term || [
        account.name, account.username, account.email, account.phone, account.id,
      ].some((value) => String(value || '').toLowerCase().includes(term));
      const matchesStatus = statusFilter === 'All statuses' || account.status === statusFilter;
      const matchesCapability = capabilityFilter === 'All capabilities' || account.capabilities.includes(capabilityFilter);
      return matchesSearch && matchesStatus && matchesCapability;
    });
  }, [accounts, globalQuery, search, statusFilter, capabilityFilter]);

  const accountOrders = selected
    ? ORDERS.filter((order) => order.customerEmail === selected.email)
    : [];
  const accountReservations = selected
    ? RESERVATIONS.filter((reservation) => reservation.customerEmail === selected.email)
    : [];
  function maskEmail(email) {
    if (!email || canEdit) return email || '—';
    const [local, domain] = String(email).split('@');
    return `${local.slice(0, 2)}***@${domain || '***'}`;
  }
  function maskPhone(phone) {
    if (!phone || canEdit) return phone || 'Not provided';
    const digits = String(phone).replace(/\s+/g, '');
    return digits.length > 4 ? `***-***-${digits.slice(-4)}` : '***';
  }
  const columns = [
    { key: 'name', label: 'Account', render: (account) => <button className="admin-text-link" type="button" onClick={() => { setSelected(account); setTab('Overview'); }}><strong>{account.name}</strong><span>@{account.username || '—'}</span></button> },
    { key: 'contact', label: 'Contact', render: (account) => <>{maskEmail(account.email)}<br />{maskPhone(account.phone)}</> },
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
    setNotice(`Sessions for ${account.name} have been marked revoked.`);
    showAdminToast(`Sessions revoked for ${account.name}.`);
    setConfirm(null);
  }

  const _historyItems = selected
    ? [
      ...accountOrders.map((order) => ({ id: order.id, title: `Order ${order.id}`, description: `${order.status} · ${order.restaurants.join(', ')}`, time: order.createdAt })),
      ...accountReservations.map((reservation) => ({ id: reservation.id, title: `Reservation ${reservation.id}`, description: `${reservation.status} · ${reservation.restaurantName} · ${reservation.guests} guests`, time: reservation.reservedAt })),
    ]
    : [];
  const accountActivity = selected
    ? [
      { id: `${selected.id}-registered`, title: 'Account registered', description: 'SALO account registration date.', time: `${selected.joined}T09:00:00+08:00` },
      ...(selected.verificationStatus === 'Verified' ? [{ id: `${selected.id}-verified`, title: 'Verification completed', description: 'Account verification status is verified.', time: `${selected.joined}T09:30:00+08:00` }] : []),
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
        <DataTable columns={columns} rows={filtered} tableSearch={globalQuery} defaultOrder={[[0, 'asc']]} onRowClick={(account) => { setSelected(account); setTab('Profile'); }} rowActions={() => [{ label: 'View', onClick: (row) => { setSelected(row); setTab('Profile'); } }]} emptyTitle="No matching accounts" emptyDescription="Adjust the search or filters to find another account." />
      </section>

      <Modal open={Boolean(selected)} onClose={() => setSelected(null)} size="wide" title={selected?.name || 'Account details'} subtitle={selected ? `@${selected.username || 'user'} · ${maskEmail(selected.email)}` : undefined} headerExtra={selected ? <StatusBadge status={selected.status} /> : null} footer={selected ? (<><button className="admin-action-button" type="button" onClick={() => setSelected(null)}>Close</button>{canEdit && (<>{selected.status !== 'Active' && <button className="admin-action-button" type="button" onClick={() => requestStatus(selected, 'Active')}>Activate / Reactivate</button>}{selected.status === 'Active' && <button className="admin-action-button" type="button" onClick={() => requestStatus(selected, 'Suspended')}>Suspend</button>}{selected.status !== 'Deactivated' && <button className="admin-action-button admin-action-button--danger" type="button" onClick={() => requestStatus(selected, 'Deactivated')}>Deactivate</button>}<button className="admin-action-button" type="button" onClick={() => requestSessionRevocation(selected)}>Revoke sessions</button></>)}</>) : null}>
        {selected && (
          <div className="admin-drawer-content">
            <p className="admin-muted">@{selected.username || 'No username'} · {selected.email}</p>
            <Tabs items={['Profile', 'Activity', 'Linked roles', 'Security / history']} value={tab} onChange={setTab} label="Account detail sections" />
            {tab === 'Profile' && (
              <>
                <ul className="admin-detail-list">
                  <li><strong>Contact</strong>{maskPhone(selected.phone)}</li>
                  <li><strong>Email</strong>{maskEmail(selected.email)}</li>
                  <li><strong>Last login</strong>{formatDateTime(selected.lastLogin || `${selected.joined}T14:20:00+08:00`)}</li>
                  <li><strong>Default address</strong>{selected.defaultAddress || 'Quezon City, Metro Manila'}</li>
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
            {tab === 'Activity' && (
              <DataTable
                columns={[
                  { key: 'id', label: 'ID', render: (row) => <Link to={row.to}>{row.id}</Link> },
                  { key: 'kind', label: 'Type' },
                  { key: 'date', label: 'Date', sortValue: (row) => new Date(row.date).getTime(), render: (row) => formatDateTime(row.date) },
                  { key: 'restaurant', label: 'Restaurant' },
                  { key: 'amount', label: 'Amount', align: 'right', sortValue: (row) => row.amount, render: (row) => formatPeso(row.amount) },
                  { key: 'status', label: 'Status', render: (row) => <StatusBadge status={row.status} /> },
                ]}
                rows={[
                  ...accountOrders.map((order) => ({ id: order.id, kind: 'Order', date: order.createdAt, restaurant: order.restaurants.join(', '), amount: order.feeBreakdown?.orderTotal ?? 0, status: order.status, to: `/admin/orders/${order.id}` })),
                  ...accountReservations.map((res) => ({ id: res.id, kind: 'Reservation', date: res.reservedAt, restaurant: res.restaurantName, amount: res.feeBreakdown?.reservationFee ?? 0, status: res.status, to: `/admin/reservations/${res.id}` })),
                ]}
                defaultOrder={[[2, 'desc']]}
                emptyTitle="No account activity"
                emptyDescription="No orders or reservations recorded for this account."
              />
            )}

            {tab === 'Linked roles' && (
              <div className="admin-record-panel">

                {selected.capabilities.filter((cap) => cap !== 'Customer').length === 0 ? (
                  <p className="admin-muted">This account only holds the Customer capability.</p>
                ) : (
                  <ul className="admin-detail-list">
                    {selected.capabilities.map((cap) => {
                      const target = cap.toLowerCase().includes('restaurant') ? '/admin/restaurants' : cap.toLowerCase().includes('rider') ? '/admin/riders' : cap.toLowerCase().includes('admin') ? '/admin/administrators' : '/admin/accounts';
                      return <li key={cap}><strong>{cap}</strong><Link to={target}>Open {cap.toLowerCase()} module</Link></li>;
                    })}
                  </ul>
                )}
    


              </div>
            )}
            {tab === 'Security / history' && (
              <div className="admin-record-panel">

                {selected.sessionsRevoked && <p className="admin-shell-note">Sessions marked revoked: {selected.sessionRevocationReason}</p>}
                <Timeline items={accountActivity.map((entry) => ({ ...entry, time: formatDateTime(entry.time) }))} />
              </div>
            )}
          </div>
        )}


      </Modal>
      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm?.status === 'Revoke active sessions' ? 'Revoke account sessions?' : `${confirm?.status} account?`}
        description={confirm?.status === 'Revoke active sessions'
          ? 'This will mark the account sessions as revoked.'
          : 'Historical SALO records remain preserved.'}
        confirmLabel={confirm?.status === 'Revoke active sessions' ? 'Revoke sessions' : confirm?.status}
        requireReauthentication
        requireReason
        onClose={() => setConfirm(null)}
        onConfirm={confirm?.status === 'Revoke active sessions' ? confirmSessionRevocation : confirmStatus}
      />
    </AdminLayout>
  );
}
