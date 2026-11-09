import { useMemo, useState } from 'react';
import AdminLayout from '../../../layouts/AdminLayout';
import adminService from '../../../services/adminService';
import Button from '../../../components/common/Button';
import {
  ConfirmDialog,
  DataTable,
  DetailDrawer,
  DocumentViewer,
  PageHeader,
  StatusBadge,
  Tabs,
  Timeline,
} from '../components';
import useAdminSession from '../contexts/useAdminSession';
import { getAdminMock } from '../mocks';
import { formatDate, formatPeso } from '../utils/format';
import './AdminPages.css';

const SAVED_RIDERS = adminService.getRiders();
const INITIAL_RIDERS = getAdminMock('riders').data.map((rider) => ({
  ...rider,
  ...(SAVED_RIDERS.find((saved) => saved.id === rider.id) || {}),
}));
const ORDERS = getAdminMock('orders').data;
const ZONES = [...new Set(getAdminMock('serviceAreas').data.flatMap((area) => area.zones.map((zone) => zone.name)))];

export default function AdminRidersPage() {
  const { permissions } = useAdminSession();
  const [riders, setRiders] = useState(INITIAL_RIDERS);
  const [view, setView] = useState('Applications');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All riders');
  const [selected, setSelected] = useState(null);
  const [detailTab, setDetailTab] = useState('Application');
  const [requestMessage, setRequestMessage] = useState('');
  const [zoneDraft, setZoneDraft] = useState('');
  const [pendingAction, setPendingAction] = useState(null);
  const [notice, setNotice] = useState('');
  const canApprove = permissions.riders?.includes('approve');
  const canReject = permissions.riders?.includes('reject');
  const canEdit = permissions.riders?.includes('edit');
  const canActivate = permissions.riders?.includes('activate');
  const canDeactivate = permissions.riders?.includes('deactivate');
  const filtered = useMemo(() => riders.filter((rider) => {
    const term = search.trim().toLowerCase();
    const matchesText = !term || [rider.name, rider.username, rider.email, rider.phone, rider.vehicle, rider.licenseNumber, rider.zone].some((value) => String(value || '').toLowerCase().includes(term));
    const matchesStatus = statusFilter === 'All riders' || rider.status === statusFilter;
    return matchesText && matchesStatus;
  }), [riders, search, statusFilter]);
  const applicants = filtered.filter((rider) => ['Pending Review', 'Documents requested'].includes(rider.applicationStatus) || rider.status === 'Pending Verification');
  const unassignedOrders = ORDERS.filter((order) => !order.riderId && !['Completed', 'Cancelled'].includes(order.status));

  function askAction(rider, action, nextZone) {
    setSelected(rider);
    setPendingAction({ rider, action, nextZone });
  }

  function applyAction({ reason }) {
    const { rider, action, nextZone } = pendingAction;
    let updated = { ...rider };
    const event = { id: `rider-history-${Date.now()}`, title: action, description: `${reason}${action === 'Request documents' ? ` · ${requestMessage.trim()}` : ''}`, time: new Date().toISOString() };
    if (action === 'Approve application' || action === 'Activate' || action === 'Reactivate') updated = { ...updated, status: 'Active', applicationStatus: 'Approved', verificationStatus: 'Verified' };
    if (action === 'Reject application') updated = { ...updated, status: 'Rejected', applicationStatus: 'Rejected' };
    if (action === 'Request documents') updated = { ...updated, applicationStatus: 'Documents requested' };
    if (action === 'Suspend') updated = { ...updated, status: 'Suspended' };
    if (action === 'Deactivate') updated = { ...updated, status: 'Deactivated' };
    if (action === 'Assign delivery zone') updated = { ...updated, zone: nextZone };
    updated.applicationHistory = [...(updated.applicationHistory || []), event];
    setRiders((previous) => previous.map((item) => item.id === rider.id ? updated : item));
    if (['Approve application', 'Activate', 'Reactivate', 'Reject application', 'Suspend', 'Deactivate', 'Assign delivery zone'].includes(action)) {
      adminService.updateRiderStatus(rider.id, updated.status, {
        applicationStatus: updated.applicationStatus,
        verificationStatus: updated.verificationStatus,
        zone: updated.zone,
      });
    }
    setSelected(updated);
    setRequestMessage('');
    setZoneDraft('');
    setPendingAction(null);
    setNotice(`${rider.name}: ${action.toLowerCase()} recorded in demo data.`);
  }

  function saveZone() {
    if (!selected || !zoneDraft) return;
    askAction(selected, 'Assign delivery zone', zoneDraft);
  }

  const applicantColumns = [
    { key: 'name', label: 'Applicant', render: (rider) => <button className="admin-text-link" type="button" onClick={() => { setSelected(rider); setZoneDraft(''); setDetailTab('Application'); }}><strong>{rider.name}</strong><span>@{rider.username} · {rider.email}</span></button> },
    { key: 'vehicle', label: 'Vehicle', render: (rider) => <>{rider.vehicle}<br /><span className="admin-muted">{rider.licenseNumber}</span></> },
    { key: 'documents', label: 'Document review', render: (rider) => `${rider.idDocument || 'ID'} · ${rider.vehicleDocument || 'Vehicle document'}` },
    { key: 'zone', label: 'Requested zone' },
    { key: 'verificationStatus', label: 'Verification', render: (rider) => <StatusBadge status={rider.verificationStatus} /> },
    { key: 'review', label: 'Review', render: (rider) => <button className="admin-action-button" type="button" onClick={() => { setSelected(rider); setDetailTab('Application'); }}>Review application</button> },
  ];
  const directoryColumns = [
    { key: 'name', label: 'Rider', render: (rider) => <button className="admin-text-link" type="button" onClick={() => { setSelected(rider); setZoneDraft(''); setDetailTab('Profile'); }}><strong>{rider.name}</strong><span>@{rider.username} · {rider.phone}</span></button> },
    { key: 'vehicle', label: 'Vehicle / verification', render: (rider) => <>{rider.vehicle}<br /><span className="admin-muted">{rider.verificationStatus} · {rider.applicationStatus}</span></> },
    { key: 'zone', label: 'Zone / shifts', render: (rider) => <>{rider.zone}<br /><span className="admin-muted">{(rider.shifts || []).join(', ')}</span></> },
    { key: 'totalTrips', label: 'Deliveries / registered', render: (rider) => `${rider.totalTrips} · ${formatDate(rider.joinedDate || '2026-08-20')}` },
    { key: 'status', label: 'Status', render: (rider) => <StatusBadge status={rider.status} /> },
    { key: 'actions', label: 'Actions', render: (rider) => <div className="admin-action-row">
      {rider.status === 'Active' && canDeactivate && <button className="admin-action-button admin-action-button--danger" type="button" onClick={() => askAction(rider, 'Suspend')}>Suspend</button>}
      {rider.status === 'Suspended' && canActivate && <button className="admin-action-button" type="button" onClick={() => askAction(rider, 'Reactivate')}>Reactivate</button>}
      {rider.status !== 'Active' && rider.status !== 'Suspended' && canActivate && <button className="admin-action-button" type="button" onClick={() => askAction(rider, 'Activate')}>Activate</button>}
      {canDeactivate && rider.status !== 'Deactivated' && <button className="admin-action-button" type="button" onClick={() => askAction(rider, 'Deactivate')}>Deactivate</button>}
    </div> },
  ];
  const history = selected
    ? [...(selected.applicationHistory || [{ id: 'rider-submitted', title: 'Rider application submitted', description: 'Identity and vehicle documents received.', time: `${selected.joinedDate || '2026-08-20'}T09:00:00+08:00` }])]
    : [];
  const activeRiders = filtered.filter((rider) => rider.status === 'Active');

  return (
    <AdminLayout>
      <section className="admin-shell-page">
        <PageHeader title="Riders and Delivery Operations" description="Review applications, verify identity and vehicles, manage rider accounts, and monitor delivery operations." />
        {notice && <p className="admin-inline-notice" role="status">{notice}</p>}
        <Tabs items={['Applications', 'Directory', 'Operations']} value={view} onChange={setView} label="Rider management views" />
        <div className="admin-filter-bar">
          <label className="admin-filter-control">Search<input aria-label="Search riders" placeholder="Rider, vehicle, plate, zone, or contact" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
          {view !== 'Applications' && <label className="admin-filter-control">Status<select aria-label="Filter riders by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option>All riders</option><option>Active</option><option>Pending Verification</option><option>Suspended</option><option>Deactivated</option></select></label>}
        </div>
        {view === 'Applications' && <DataTable columns={applicantColumns} rows={applicants} emptyTitle="No rider applications" emptyDescription="There are no applications awaiting review." />}
        {view === 'Directory' && <DataTable columns={directoryColumns} rows={filtered} emptyTitle="No riders found" emptyDescription="Adjust your search or status filter." />}
        {view === 'Operations' && <>
          <div className="admin-roster-summary">
            <div><strong>{activeRiders.filter((rider) => rider.isOnline).length}</strong><span>Online</span></div>
            <div><strong>{activeRiders.filter((rider) => !rider.isOnline).length}</strong><span>Offline</span></div>
            <div><strong>{activeRiders.filter((rider) => rider.onDelivery).length}</strong><span>On delivery</span></div>
            <div><strong>{activeRiders.filter((rider) => rider.activeShift).length}</strong><span>Active shifts</span></div>
            <div><strong>{unassignedOrders.length}</strong><span>Unassigned orders</span></div>
          </div>
          <section className="admin-map-panel" aria-label="Rider location map panel">
            <div><h2>Authorized live locations</h2><p>Demo map panel · location visibility is limited to riders sharing location during an active shift.</p></div>
            <div className="admin-map-grid">{activeRiders.map((rider) => <article key={rider.id} className={rider.isOnline ? 'is-online' : ''}><span aria-hidden="true">●</span><strong>{rider.name}</strong><small>{rider.isOnline ? rider.location : 'Offline · location not shown'}</small></article>)}</div>
          </section>
          <DataTable columns={[
            { key: 'name', label: 'Rider', render: (rider) => <strong>{rider.name}</strong> },
            { key: 'status', label: 'Availability', render: (rider) => rider.isOnline ? (rider.onDelivery ? 'On delivery' : 'Online · available') : 'Offline' },
            { key: 'shifts', label: 'Active shift', render: (rider) => rider.activeShift ? rider.shifts.join(', ') : 'No active shift' },
            { key: 'orders', label: 'Unassigned orders / offers', render: (rider) => `${unassignedOrders.length} / ${rider.offers ?? 0}` },
            { key: 'incidents', label: 'Failed / reassigned', render: (rider) => `${rider.failedDeliveries ?? 0} / ${rider.reassignments ?? 0}` },
            { key: 'cod', label: 'COD', render: (rider) => <>{rider.codStatus}<br />{formatPeso(rider.cashOnHand)}</> },
          ]} rows={filtered} emptyTitle="No rider operations" emptyDescription="No rider records match this filter." />
        </>}
      </section>

      <DetailDrawer open={Boolean(selected)} title={selected?.name || 'Rider details'} onClose={() => setSelected(null)}>
        {selected && <>
          <p className="admin-muted">@{selected.username} · {selected.email}</p>
          <Tabs items={['Application', 'Profile', 'Operations', 'History']} value={detailTab} onChange={setDetailTab} label="Rider detail sections" />
          {detailTab === 'Application' && <div className="admin-drawer-content">
            <ul className="admin-detail-list"><li><strong>Application</strong>{selected.applicationStatus}</li><li><strong>Verification</strong><StatusBadge status={selected.verificationStatus} /></li><li><strong>Vehicle</strong>{selected.vehicle}</li><li><strong>License number</strong>{selected.licenseNumber}</li><li><strong>Assigned zone</strong>{selected.zone}</li></ul>
            <DocumentViewer documents={[selected.idDocument, selected.vehicleDocument].filter(Boolean)} subject={selected.name} status={selected.verificationStatus} />
            {canApprove && selected.applicationStatus !== 'Approved' && <button className="admin-action-button" type="button" onClick={() => askAction(selected, 'Approve application')}>Approve and activate</button>}
            {canReject && selected.applicationStatus !== 'Rejected' && <button className="admin-action-button admin-action-button--danger" type="button" onClick={() => askAction(selected, 'Reject application')}>Reject application</button>}
            {canEdit && <div className="admin-record-panel"><label className="admin-filter-control">Request additional documents<textarea rows="3" value={requestMessage} onChange={(event) => setRequestMessage(event.target.value)} placeholder="Specify required document(s)" /></label><button className="admin-action-button" type="button" disabled={!requestMessage.trim()} onClick={() => askAction(selected, 'Request documents')}>Request documents</button></div>}
          </div>}
          {detailTab === 'Profile' && <div className="admin-drawer-content">
            <ul className="admin-detail-list"><li><strong>Contact</strong>{selected.phone}</li><li><strong>Vehicle</strong>{selected.vehicle}</li><li><strong>Registered</strong>{formatDate(selected.joinedDate || '2026-08-20')}</li><li><strong>Completed deliveries</strong>{selected.totalTrips}</li><li><strong>Account status</strong><StatusBadge status={selected.status} /></li><li><strong>Shifts</strong>{(selected.shifts || []).join(', ')}</li></ul>
            {canEdit && <div className="admin-action-row"><label className="admin-filter-control">Assign delivery zone<select aria-label="Assign rider delivery zone" value={zoneDraft || selected.zone} onChange={(event) => setZoneDraft(event.target.value)}>{ZONES.map((zone) => <option key={zone}>{zone}</option>)}</select></label><Button variant="outline" onClick={saveZone}>Save zone assignment</Button></div>}
            <div className="admin-action-row">{selected.status === 'Active' && canDeactivate && <button className="admin-action-button admin-action-button--danger" type="button" onClick={() => askAction(selected, 'Suspend')}>Suspend</button>}{selected.status !== 'Active' && canActivate && <button className="admin-action-button" type="button" onClick={() => askAction(selected, selected.status === 'Suspended' ? 'Reactivate' : 'Activate')}>Activate / Reactivate</button>}{canDeactivate && selected.status !== 'Deactivated' && <button className="admin-action-button" type="button" onClick={() => askAction(selected, 'Deactivate')}>Deactivate</button>}</div>
          </div>}
          {detailTab === 'Operations' && <div className="admin-drawer-content"><ul className="admin-detail-list"><li><strong>Availability</strong>{selected.isOnline ? (selected.onDelivery ? 'On delivery' : 'Online') : 'Offline'}</li><li><strong>Active shift</strong>{selected.activeShift ? 'Yes' : 'No'} · {(selected.shifts || []).join(', ')}</li><li><strong>Location</strong>{selected.isOnline ? selected.location : 'Not available while offline'}</li><li><strong>Offers</strong>{selected.offers ?? 0}</li><li><strong>Failed deliveries</strong>{selected.failedDeliveries ?? 0}</li><li><strong>Reassignments</strong>{selected.reassignments ?? 0}</li><li><strong>COD status</strong>{selected.codStatus} · {formatPeso(selected.cashOnHand)}</li></ul></div>}
          {detailTab === 'History' && <Timeline items={history} />}
        </>}
      </DetailDrawer>

      <ConfirmDialog
        open={Boolean(pendingAction)}
        title={`${pendingAction?.action || 'Confirm'}?`}
        description="Record the action and reason in demo history. No live rider account or dispatch operation is changed."
        confirmLabel={pendingAction?.action || 'Confirm'}
        requireReauthentication
        requireReason
        onClose={() => setPendingAction(null)}
        onConfirm={applyAction}
      />
    </AdminLayout>
  );
}
