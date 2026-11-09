import { useMemo, useState } from 'react';
import AdminLayout from '../../../layouts/AdminLayout';
import adminService from '../../../services/adminService';
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
import { formatDate } from '../utils/format';
import './AdminPages.css';

const SAVED_RESTAURANTS = adminService.getRestaurants();
const INITIAL_RESTAURANTS = getAdminMock('restaurants').data.map((restaurant) => ({
  ...restaurant,
  ...(SAVED_RESTAURANTS.find((saved) => saved.id === restaurant.id) || {}),
}));

export default function AdminRestaurantsPage() {
  const { permissions } = useAdminSession();
  const [restaurants, setRestaurants] = useState(INITIAL_RESTAURANTS);
  const [view, setView] = useState('Applications');
  const [search, setSearch] = useState('');
  const [applicationFilter, setApplicationFilter] = useState('All applications');
  const [selected, setSelected] = useState(null);
  const [detailTab, setDetailTab] = useState('Application');
  const [requestMessage, setRequestMessage] = useState('');
  const [pendingAction, setPendingAction] = useState(null);
  const [pendingCommission, setPendingCommission] = useState(null);
  const [commissionDraft, setCommissionDraft] = useState('');
  const [notice, setNotice] = useState('');
  const canApprove = permissions.restaurants?.includes('approve');
  const canReject = permissions.restaurants?.includes('reject');
  const canEdit = permissions.restaurants?.includes('edit');
  const canActivate = permissions.restaurants?.includes('activate');
  const canDeactivate = permissions.restaurants?.includes('deactivate');
  const matching = useMemo(() => restaurants.filter((restaurant) => {
    const term = search.trim().toLowerCase();
    return !term || [restaurant.name, restaurant.ownerName, restaurant.ownerEmail, restaurant.address, restaurant.zone]
      .some((value) => String(value || '').toLowerCase().includes(term));
  }), [restaurants, search]);
  const applications = matching.filter((restaurant) => ['Pending Review', 'More information requested'].includes(restaurant.applicationStatus) || restaurant.status === 'Pending Approval');
  const filteredApplications = applications.filter((restaurant) => applicationFilter === 'All applications' || restaurant.applicationStatus === applicationFilter);

  function askAction(restaurant, action) {
    setSelected(restaurant);
    setPendingAction({ restaurant, action });
  }

  function applyAction({ reason }) {
    const { restaurant, action } = pendingAction;
    let updated = { ...restaurant };
    const event = { id: `rest-history-${Date.now()}`, title: action, description: `${reason}${action === 'Request more information' ? ` · Message: ${requestMessage.trim()}` : ''}`, time: new Date().toISOString() };
    if (action === 'Approve application') updated = { ...updated, status: 'Active', applicationStatus: 'Approved', verificationStatus: 'Verified', operatingStatus: 'Open' };
    if (action === 'Reject application') updated = { ...updated, status: 'Rejected', applicationStatus: 'Rejected', operatingStatus: 'Not operating' };
    if (action === 'Request more information') updated = { ...updated, applicationStatus: 'More information requested' };
    if (action === 'Suspend operations') updated = { ...updated, status: 'Suspended', operatingStatus: 'Suspended' };
    if (action === 'Deactivate operations') updated = { ...updated, status: 'Deactivated', operatingStatus: 'Deactivated' };
    if (action === 'Activate' || action === 'Reactivate') updated = { ...updated, status: 'Active', operatingStatus: 'Open' };
    updated.applicationHistory = [...(updated.applicationHistory || []), event];
    setRestaurants((previous) => previous.map((item) => item.id === restaurant.id ? updated : item));
    if (['Approve application', 'Reject application', 'Suspend operations', 'Deactivate operations', 'Activate', 'Reactivate'].includes(action)) {
      adminService.updateRestaurantStatus(restaurant.id, updated.status, {
        applicationStatus: updated.applicationStatus,
        verificationStatus: updated.verificationStatus,
        operatingStatus: updated.operatingStatus,
      });
    }
    setSelected(updated);
    setRequestMessage('');
    setPendingAction(null);
    setNotice(`${restaurant.name}: ${action.toLowerCase()} recorded in demo data.`);
  }

  function confirmCommissionChange({ reason }) {
    const rate = Number(commissionDraft);
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
      setNotice('Enter a commission rate from 0 to 100 percent.');
      setPendingCommission(null);
      return;
    }
    const restaurant = pendingCommission;
    const updated = { ...restaurant, commissionRate: rate, commissionChangeReason: reason };
    setRestaurants((previous) => previous.map((item) => item.id === restaurant.id ? updated : item));
    adminService.updateRestaurantCommission(restaurant.id, rate);
    setSelected(updated);
    setPendingCommission(null);
    setNotice(`${restaurant.name} commission rate updated to ${rate}% in demo data. Historical order totals are not recalculated.`);
  }

  const appColumns = [
    { key: 'name', label: 'Application', render: (restaurant) => <button className="admin-text-link" type="button" onClick={() => { setSelected(restaurant); setDetailTab('Application'); }}><strong>{restaurant.name}</strong><span>Owner: {restaurant.ownerName}</span></button> },
    { key: 'address', label: 'Physical location' },
    { key: 'applicationStatus', label: 'Application', render: (restaurant) => <StatusBadge status={restaurant.applicationStatus || restaurant.status} /> },
    { key: 'verificationStatus', label: 'Verification', render: (restaurant) => <StatusBadge status={restaurant.verificationStatus} /> },
    { key: 'joinedDate', label: 'Submitted', render: (restaurant) => formatDate(restaurant.joinedDate) },
    { key: 'review', label: 'Review', render: (restaurant) => <button className="admin-action-button" type="button" onClick={() => { setSelected(restaurant); setDetailTab('Application'); }}>Review application</button> },
  ];
  const directoryColumns = [
    { key: 'name', label: 'Restaurant', render: (restaurant) => <button className="admin-text-link" type="button" onClick={() => { setSelected(restaurant); setDetailTab('Profile'); }}><strong>{restaurant.name}</strong><span>{restaurant.ownerName} · {restaurant.ownerEmail}</span></button> },
    { key: 'address', label: 'Physical address / coverage', render: (restaurant) => <>{restaurant.address}<br /><span className="admin-muted">Delivery: {(restaurant.serviceCoverage || [restaurant.zone]).join(', ')}</span></> },
    { key: 'status', label: 'Account / operating', render: (restaurant) => <><StatusBadge status={restaurant.status} /><br /><span className="admin-muted">{restaurant.operatingStatus || '—'} · {restaurant.applicationStatus || '—'} · {restaurant.verificationStatus || '—'}</span></> },
    { key: 'activity', label: 'Orders / reservations', render: (restaurant) => `${restaurant.ordersCount} / ${restaurant.reservationsCount}` },
    { key: 'commissionRate', label: 'Commission', render: (restaurant) => `${restaurant.commissionRate}%` },
    { key: 'rating', label: 'Rating / registered', render: (restaurant) => `${restaurant.rating || '—'} · ${formatDate(restaurant.joinedDate)}` },
    { key: 'actions', label: 'Actions', render: (restaurant) => <div className="admin-action-row">
      {restaurant.status === 'Active' && canDeactivate && <button className="admin-action-button admin-action-button--danger" type="button" onClick={() => askAction(restaurant, 'Suspend operations')}>Suspend</button>}
      {restaurant.status === 'Suspended' && canActivate && <button className="admin-action-button" type="button" onClick={() => askAction(restaurant, 'Reactivate')}>Reactivate</button>}
      {restaurant.status !== 'Deactivated' && restaurant.status !== 'Active' && restaurant.status !== 'Suspended' && canActivate && <button className="admin-action-button" type="button" onClick={() => askAction(restaurant, 'Activate')}>Activate</button>}
      {canDeactivate && restaurant.status !== 'Deactivated' && <button className="admin-action-button" type="button" onClick={() => askAction(restaurant, 'Deactivate operations')}>Deactivate</button>}
    </div> },
  ];
  const history = selected
    ? [...(selected.applicationHistory || [
      { id: 'submitted', title: 'Application submitted', description: 'Business information and supporting documents received.', time: `${selected.joinedDate}T09:00:00+08:00` },
      ...(selected.verificationStatus === 'Verified' ? [{ id: 'verified', title: 'Business documents verified', description: 'Demo verification record.', time: `${selected.joinedDate}T10:00:00+08:00` }] : []),
    ])]
    : [];

  return (
    <AdminLayout>
      <section className="admin-shell-page">
        <PageHeader title="Restaurant Partners" description="Review onboarding, business verification, service coverage, account status, and operating performance." />
        {notice && <p className="admin-inline-notice" role="status">{notice}</p>}
        <Tabs items={['Applications', 'Directory', 'Monitoring']} value={view} onChange={setView} label="Restaurant management views" />
        <div className="admin-filter-bar">
          <label className="admin-filter-control">Search<input aria-label="Search restaurants" placeholder="Restaurant, owner, location, or email" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
          {view === 'Applications' && <label className="admin-filter-control">Application status<select aria-label="Filter restaurant applications" value={applicationFilter} onChange={(event) => setApplicationFilter(event.target.value)}><option>All applications</option><option>Pending Review</option><option>More information requested</option></select></label>}
        </div>
        {view === 'Applications' && <DataTable columns={appColumns} rows={filteredApplications} emptyTitle="No restaurant applications" emptyDescription="There are no applications matching the selected filter." />}
        {view === 'Directory' && <DataTable columns={directoryColumns} rows={matching} emptyTitle="No restaurants found" emptyDescription="Adjust your search to see restaurant partners." />}
        {view === 'Monitoring' && <DataTable columns={[
          { key: 'name', label: 'Restaurant', render: (restaurant) => <strong>{restaurant.name}</strong> },
          { key: 'acceptanceRate', label: 'Acceptance rate', render: (restaurant) => `${restaurant.acceptanceRate ?? 0}%` },
          { key: 'cancellationRate', label: 'Cancellation frequency', render: (restaurant) => `${restaurant.cancellationRate ?? 0}%` },
          { key: 'operatingStatus', label: 'Availability', render: (restaurant) => restaurant.operatingStatus || restaurant.status },
          { key: 'menuAvailability', label: 'Menu available', render: (restaurant) => `${restaurant.menuAvailability ?? 0}%` },
          { key: 'complaints', label: 'Complaints' },
          { key: 'rating', label: 'Rating / reservations', render: (restaurant) => `${restaurant.rating || '—'} / ${restaurant.reservationsCount}` },
        ]} rows={matching} emptyTitle="No monitoring records" emptyDescription="Restaurant monitoring records are not available." />}
      </section>

      <DetailDrawer open={Boolean(selected)} title={selected?.name || 'Restaurant details'} onClose={() => setSelected(null)}>
        {selected && <>
          <p className="admin-muted">{selected.ownerName} · {selected.ownerEmail}</p>
          <Tabs items={['Application', 'Profile', 'Monitoring', 'History']} value={detailTab} onChange={setDetailTab} label="Restaurant detail sections" />
          {detailTab === 'Application' && <div className="admin-drawer-content">
            <ul className="admin-detail-list">
              <li><strong>Business / owner</strong>{selected.name} · {selected.ownerName}</li>
              <li><strong>Physical location</strong>{selected.address}</li>
              <li><strong>Delivery coverage</strong>{(selected.serviceCoverage || [selected.zone]).join(', ')}</li>
              <li><strong>Application / verification</strong>{selected.applicationStatus || selected.status} · {selected.verificationStatus || 'Pending'}</li>
            </ul>
            <DocumentViewer documents={selected.documents || ['Business permit', 'Owner identification']} subject={selected.ownerName} status={selected.verificationStatus || 'Pending'} />
            {canApprove && selected.applicationStatus !== 'Approved' && <button className="admin-action-button" type="button" onClick={() => askAction(selected, 'Approve application')}>Approve</button>}
            {canReject && selected.applicationStatus !== 'Rejected' && <button className="admin-action-button admin-action-button--danger" type="button" onClick={() => askAction(selected, 'Reject application')}>Reject</button>}
            {canEdit && <div className="admin-record-panel"><label className="admin-filter-control">Request additional information<textarea rows="3" value={requestMessage} onChange={(event) => setRequestMessage(event.target.value)} placeholder="Specify which information is needed" /></label><button className="admin-action-button" type="button" disabled={!requestMessage.trim()} onClick={() => askAction(selected, 'Request more information')}>Send request</button></div>}
            <p className="admin-shell-note">Suspension prevents new transactions according to the configured demo behavior. Existing orders and reservations remain available for authorized resolution.</p>
          </div>}
          {detailTab === 'Profile' && <div className="admin-drawer-content"><ul className="admin-detail-list"><li><strong>Address</strong>{selected.address}</li><li><strong>Service locations</strong>{(selected.serviceCoverage || [selected.zone]).join(', ')}</li><li><strong>Contact</strong>{selected.phone}</li><li><strong>Registered</strong>{formatDate(selected.joinedDate)}</li><li><strong>Orders</strong>{selected.ordersCount}</li><li><strong>Reservations</strong>{selected.reservationsCount}</li><li><strong>Commission rate</strong>{selected.commissionRate}%</li></ul>{canEdit && <div className="admin-record-panel"><label className="admin-filter-control">Update commission rate (%)<input type="number" min="0" max="100" step="0.5" value={commissionDraft || selected.commissionRate} onChange={(event) => setCommissionDraft(event.target.value)} /></label><p>Commission changes apply prospectively; historical order fee snapshots are not recalculated.</p><button className="admin-action-button" type="button" onClick={() => { const rate = Number(commissionDraft || selected.commissionRate); if (!Number.isFinite(rate) || rate < 0 || rate > 100) { setNotice('Enter a commission rate from 0 to 100 percent.'); return; } setCommissionDraft(String(rate)); setPendingCommission(selected); }}>Review commission change</button></div>}</div>}
          {detailTab === 'Monitoring' && <div className="admin-drawer-content"><ul className="admin-detail-list"><li><strong>Acceptance rate</strong>{selected.acceptanceRate ?? 0}%</li><li><strong>Cancellation frequency</strong>{selected.cancellationRate ?? 0}%</li><li><strong>Availability</strong>{selected.operatingStatus || selected.status}</li><li><strong>Menu availability</strong>{selected.menuAvailability ?? 0}%</li><li><strong>Complaints</strong>{selected.complaints ?? 0}</li><li><strong>Rating</strong>{selected.rating || 'Not rated'}</li></ul></div>}
          {detailTab === 'History' && <Timeline items={history} />}
        </>}
      </DetailDrawer>

      <ConfirmDialog
        open={Boolean(pendingAction)}
        title={`${pendingAction?.action || 'Confirm'}?`}
        description="Record the decision and reason in the demo application history. No live restaurant account is changed."
        confirmLabel={pendingAction?.action || 'Confirm'}
        requireReauthentication
        requireReason
        onClose={() => setPendingAction(null)}
        onConfirm={applyAction}
      />
      <ConfirmDialog
        open={Boolean(pendingCommission)}
        title="Confirm restaurant commission change"
        description={`Set ${commissionDraft || pendingCommission?.commissionRate}% commission for ${pendingCommission?.name || 'this restaurant'}. Historical order totals remain unchanged.`}
        confirmLabel="Update commission"
        requireReauthentication
        requireReason
        onClose={() => setPendingCommission(null)}
        onConfirm={confirmCommissionChange}
      />
    </AdminLayout>
  );
}
