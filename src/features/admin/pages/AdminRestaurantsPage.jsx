import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import AdminLayout from '../../../layouts/AdminLayout';
import adminService from '../../../services/adminService';

import Button from '../../../components/common/Button';
import {
  ConfirmDialog,
  DataTable,
  DetailDrawer,
  Modal,
  PageHeader,
  StatusBadge,
  Tabs,
  Timeline,
} from '../components';
import useAdminSession from '../contexts/useAdminSession';
import { useAdminPageSearch } from '../contexts/useAdminSearch';
import { getAdminMock, getRestaurantApplications, syncApplicationsToMockData } from '../mocks';
import { formatDate } from '../utils/format';
import './AdminPages.css';

const _SAVED_RESTAURANTS = adminService.getRestaurants();
const _UNUSED_RESTAURANTS = null;
const INITIAL_RESTAURANTS_REMOVED = (() => { void _UNUSED_RESTAURANTS; return null; })();
void INITIAL_RESTAURANTS_REMOVED;




export default function AdminRestaurantsPage() {
  const { permissions } = useAdminSession();
  const { query: globalQuery } = useAdminPageSearch({ scopeLabel: 'Restaurants', placeholder: 'Search restaurants by name, owner, city, status', searchableFields: ['name', 'ownerName', 'ownerEmail', 'address', 'zone', 'status'] });
  const [restaurants, setRestaurants] = useState(() => {
    syncApplicationsToMockData();
    const saved = adminService.getRestaurants();
    return getAdminMock('restaurants').data.map((restaurant) => ({
      ...restaurant,
      ...(saved.find((s) => s.id === restaurant.id || s.referenceNumber === restaurant.id) || {}),
    }));
  });
  useEffect(() => {
    function refresh() {
      syncApplicationsToMockData();
      const saved = adminService.getRestaurants();
      setRestaurants(getAdminMock('restaurants').data.map((restaurant) => ({
      
        ...(saved.find((s) => s.id === restaurant.id || s.referenceNumber === restaurant.id) || {}),
      })));
    }
    window.addEventListener('salo-admin-data-updated', refresh);
    return () => window.removeEventListener('salo-admin-data-updated', refresh);
  }, []);
  const pendingApplicationsCount = getRestaurantApplications().filter((item) => ['Pending', 'Under Review', 'Needs Revision'].includes(item.reviewStatus)).length;
  const [view, setView] = useState('Directory');
  const [search, setSearch] = useState('');
  const [applicationFilter, setApplicationFilter] = useState('All applications');
  const [selected, setSelected] = useState(null);
  const [detailTab, setDetailTab] = useState('Profile');
  const [requestMessage, setRequestMessage] = useState('');
  const [pendingAction, setPendingAction] = useState(null);
  const [pendingCommission, setPendingCommission] = useState(null);
  const [commissionDraft, setCommissionDraft] = useState('');
  const [notice, setNotice] = useState('');

  // Request Additional Documents Modal State
  const [requestDocModalOpen, setRequestDocModalOpen] = useState(false);
  const [requestDocType, setRequestDocType] = useState('Sanitary Permit / Health Certificate');
  const [customDocName, setCustomDocName] = useState('');
  const [requestDocReason, setRequestDocReason] = useState('');
  const [requestDocInstructions, setRequestDocInstructions] = useState('');
  const [requestDocDueDate, setRequestDocDueDate] = useState('');
  const [requestDocError, setRequestDocError] = useState('');

  const _canApprove = permissions.restaurants?.includes('approve');
  const _canReject = permissions.restaurants?.includes('reject');
  const canEdit = permissions.restaurants?.includes('edit');
  const canActivate = permissions.restaurants?.includes('activate');
  const canDeactivate = permissions.restaurants?.includes('deactivate');

  const matching = useMemo(() => restaurants.filter((restaurant) => {
    const isPartner = restaurant.applicationStatus === 'Approved' || ['Active', 'Suspended', 'Deactivated'].includes(restaurant.status);
    if (!isPartner) return false;
    const term = (globalQuery || search).trim().toLowerCase();
    return !term || [restaurant.name, restaurant.ownerName, restaurant.ownerEmail, restaurant.address, restaurant.zone, restaurant.status]
      .some((value) => String(value || '').toLowerCase().includes(term));
  }), [restaurants, globalQuery, search]);

  const applications = matching.filter((restaurant) => {
    const status = restaurant.applicationStatus || restaurant.status;
    return [
      'Submitted',
      'Pending Review',
      'Under Review',
      'Additional Documents Required',
      'More information requested',
      'Needs Correction',
      'Pending Approval',
    ].includes(status);
  });

  const _filteredApplications = applications.filter((restaurant) => {
    if (applicationFilter === 'All applications') return true;
    return (restaurant.applicationStatus || restaurant.status) === applicationFilter;
  });

  function askAction(restaurant, action) {
    setSelected(restaurant);
    setPendingAction({ restaurant, action });
  }

  function _handleUpdateDocStatus(restaurantId, docId, status, reason) {
    const updatedList = adminService.updateRestaurantDocumentStatus(restaurantId, docId, { status, reason });
    setRestaurants(updatedList);
    const currentRest = updatedList.find((r) => r.id === restaurantId || r.referenceNumber === restaurantId);
    if (currentRest) setSelected(currentRest);
    setNotice(`${selected?.name || 'Restaurant'}: Document marked as ${status}.`);
  }

  function handleSendDocRequest(e) {
    e?.preventDefault();
    const docName = requestDocType === 'Other (Custom Document Name)' ? customDocName.trim() : requestDocType;
    if (!docName) {
      setRequestDocError('Please specify the document name.');
      return;
    }
    if (!requestDocReason.trim()) {
      setRequestDocError('Please provide a reason for the request.');
      return;
    }

    const { updated } = adminService.requestAdditionalDocuments(selected.id, {
      documentName: docName,
      reason: requestDocReason.trim(),
      instructions: requestDocInstructions.trim(),
      dueDate: requestDocDueDate,
    });

    setRestaurants(updated);
    const currentRest = updated.find((r) => r.id === selected.id || r.referenceNumber === selected.id);
    if (currentRest) setSelected(currentRest);

    setNotice(`${selected.name}: Additional document "${docName}" requested. Status updated to Additional Documents Required.`);
    setRequestDocModalOpen(false);
    setRequestDocReason('');
    setRequestDocInstructions('');
    setCustomDocName('');
    setRequestDocDueDate('');
    setRequestDocError('');
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
    setNotice(`${restaurant.name}: ${action.toLowerCase()} recorded.`);
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
    setNotice(`${restaurant.name} commission rate updated to ${rate}%. Historical order totals are not recalculated.`);
  }

  const _appColumns = [
    { key: 'name', label: 'Application', render: (restaurant) => <button className="admin-text-link" type="button" onClick={() => { setSelected(restaurant); setDetailTab('Application'); }}><strong>{restaurant.name}</strong><span>Owner: {restaurant.ownerName}</span></button> },
    { key: 'address', label: 'Physical location' },
    { key: 'applicationStatus', label: 'Application', render: (restaurant) => {
      const applicationStatus = restaurant.applicationStatus || restaurant.status;
      const needsAction = ['Submitted', 'Pending Review', 'Under Review', 'Additional Documents Required', 'Pending Approval', 'More information requested'].includes(applicationStatus);
      return <StatusBadge status={applicationStatus} className={needsAction ? 'admin-status-badge--action' : ''} />;
    } },
    { key: 'verificationStatus', label: 'Verification', render: (restaurant) => <StatusBadge status={restaurant.verificationStatus || 'Pending'} /> },
    { key: 'joinedDate', label: 'Submitted', render: (restaurant) => formatDate(restaurant.joinedDate) },
    { key: 'review', label: 'Review', render: (restaurant) => <button className="admin-action-button" type="button" onClick={() => { setSelected(restaurant); setDetailTab('Application'); }}>Review application</button> },
  ];

  void _appColumns;
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
      ...(selected.verificationStatus === 'Verified' ? [{ id: 'verified', title: 'Business documents verified', description: 'Verification completed.', time: `${selected.joinedDate}T10:00:00+08:00` }] : []),
    ])]
    : [];

  return (
    <AdminLayout>
      <section className="admin-shell-page">
        <PageHeader
          title="Restaurant Partners"
          description="Manage approved restaurant partners, service coverage, account status, and operating performance."
          actions={<Link className="admin-action-button" to="/admin/applications?type=restaurant">Pending applications ({pendingApplicationsCount})</Link>}
        />
        {notice && <p className="admin-inline-notice" role="status">{notice}</p>}
        <Tabs items={['Directory', 'Monitoring']} value={view} onChange={setView} label="Restaurant management views" />
        <div className="admin-filter-bar">
          <label className="admin-filter-control">Search<input aria-label="Search restaurants" placeholder="Restaurant, owner, location, or email" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
          {view === 'Applications' && (
            <label className="admin-filter-control">
              Application status
              <select aria-label="Filter restaurant applications" value={applicationFilter} onChange={(event) => setApplicationFilter(event.target.value)}>
                <option>All applications</option>
                <option>Submitted</option>
                <option>Pending Review</option>
                <option>Under Review</option>
                <option>Additional Documents Required</option>
                <option>More information requested</option>
              </select>
            </label>
          )}
        </div>
        {view === 'Directory' && <DataTable columns={directoryColumns} rows={matching} tableSearch={globalQuery} defaultOrder={[[0, 'asc']]} emptyTitle="No restaurants found" emptyDescription="Adjust your search to see restaurant partners." />}
        {view === 'Monitoring' && <DataTable tableSearch={globalQuery} defaultOrder={[[0, 'asc']]} columns={[
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
          <Tabs items={['Profile', 'Monitoring', 'History']} value={detailTab === 'Application' ? 'Profile' : detailTab} onChange={setDetailTab} label="Restaurant detail sections" />
          {detailTab === 'Profile' && <div className="admin-drawer-content"><ul className="admin-detail-list"><li><strong>Address</strong>{selected.address}</li><li><strong>Service locations</strong>{(selected.serviceCoverage || [selected.zone]).join(', ')}</li><li><strong>Contact</strong>{selected.phone}</li><li><strong>Registered</strong>{formatDate(selected.joinedDate)}</li><li><strong>Orders</strong>{selected.ordersCount}</li><li><strong>Reservations</strong>{selected.reservationsCount}</li><li><strong>Commission rate</strong>{selected.commissionRate}%</li></ul>{canEdit && <div className="admin-record-panel"><label className="admin-filter-control">Update commission rate (%)<input type="number" min="0" max="100" step="0.5" value={commissionDraft || selected.commissionRate} onChange={(event) => setCommissionDraft(event.target.value)} /></label><p>Commission changes apply prospectively; historical order fee snapshots are not recalculated.</p><button className="admin-action-button" type="button" onClick={() => { const rate = Number(commissionDraft || selected.commissionRate); if (!Number.isFinite(rate) || rate < 0 || rate > 100) { setNotice('Enter a commission rate from 0 to 100 percent.'); return; } setCommissionDraft(String(rate)); setPendingCommission(selected); }}>Review commission change</button></div>}</div>}
          {detailTab === 'Monitoring' && <div className="admin-drawer-content"><ul className="admin-detail-list"><li><strong>Acceptance rate</strong>{selected.acceptanceRate ?? 0}%</li><li><strong>Cancellation frequency</strong>{selected.cancellationRate ?? 0}%</li><li><strong>Availability</strong>{selected.operatingStatus || selected.status}</li><li><strong>Menu availability</strong>{selected.menuAvailability ?? 0}%</li><li><strong>Complaints</strong>{selected.complaints ?? 0}</li><li><strong>Rating</strong>{selected.rating || 'Not rated'}</li></ul></div>}
          {detailTab === 'History' && <Timeline items={history} />}
        </>}
      </DetailDrawer>

      {/* Request Additional Documents Modal */}
      <Modal
        open={requestDocModalOpen}
        title="Request Additional Documents"
        onClose={() => setRequestDocModalOpen(false)}
        size="md"
        footer={(
          <div className="admin-page-header__actions">
            <Button variant="ghost" onClick={() => setRequestDocModalOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleSendDocRequest}>Send Document Request</Button>
          </div>
        )}
      >
        <form onSubmit={handleSendDocRequest} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)' }}>
            Request supporting documents from <strong>{selected?.name}</strong>. The application status will be updated to <em>Additional Documents Required</em>.
          </p>

          <label className="admin-filter-control">
            Document requested <span style={{ color: 'var(--salo-error)' }}>*</span>
            <select
              value={requestDocType}
              onChange={(e) => setRequestDocType(e.target.value)}
              style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border-primary)' }}
            >
              <option value="Sanitary Permit / Health Certificate">Sanitary Permit / Health Certificate</option>
              <option value="Fire Safety Inspection Certificate (FSIC)">Fire Safety Inspection Certificate (FSIC)</option>
              <option value="Barangay Business Clearance">Barangay Business Clearance</option>
              <option value="BIR Form 2303 (Certificate of Registration)">BIR Form 2303 (Certificate of Registration)</option>
              <option value="Updated Mayor's / Business Permit">Updated Mayor's / Business Permit</option>
              <option value="Secretary's Certificate / Board Resolution">Secretary's Certificate / Board Resolution</option>
              <option value="Proof of Bank Account Ownership">Proof of Bank Account Ownership</option>
              <option value="Other (Custom Document Name)">Other (Custom Document Name)</option>
            </select>
          </label>

          {requestDocType === 'Other (Custom Document Name)' && (
            <label className="admin-filter-control">
              Custom Document Name <span style={{ color: 'var(--salo-error)' }}>*</span>
              <input
                type="text"
                placeholder="e.g. Commissary Lease Agreement"
                value={customDocName}
                onChange={(e) => setCustomDocName(e.target.value)}
                style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border-primary)' }}
              />
            </label>
          )}

          <label className="admin-filter-control">
            Reason for request <span style={{ color: 'var(--salo-error)' }}>*</span>
            <textarea
              rows="3"
              placeholder="Explain why this document is required for partner onboarding..."
              value={requestDocReason}
              onChange={(e) => {
                setRequestDocReason(e.target.value);
                setRequestDocError('');
              }}
              style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border-primary)' }}
            />
          </label>

          <label className="admin-filter-control">
            Instructions for applicant (optional)
            <textarea
              rows="2"
              placeholder="e.g. Ensure the document is dated 2026 and official municipal stamp is legible..."
              value={requestDocInstructions}
              onChange={(e) => setRequestDocInstructions(e.target.value)}
              style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border-primary)' }}
            />
          </label>

          <label className="admin-filter-control">
            Optional submission due date
            <input
              type="date"
              value={requestDocDueDate}
              onChange={(e) => setRequestDocDueDate(e.target.value)}
              style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border-primary)' }}
            />
          </label>

          {requestDocError && (
            <p style={{ color: 'var(--salo-error)', fontSize: '12px', margin: 0 }} role="alert">
              {requestDocError}
            </p>
          )}
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(pendingAction)}
        title={`${pendingAction?.action || 'Confirm'}?`}
        description="Record the decision and reason in the application history."
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
