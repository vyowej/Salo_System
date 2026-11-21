import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AdminLayout from '../../../layouts/AdminLayout';
import adminApiService from '../../../services/adminApiService';

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
import { useAdminPageSearch } from '../contexts/useAdminSearch';
import { formatDate } from '../utils/format';
import './AdminPages.css';

const STATUS_LABELS = {
  active: 'Active',
  approved: 'Approved',
  suspended: 'Suspended',
  inactive: 'Deactivated',
  pending: 'Pending',
  rejected: 'Rejected',
};

const APPLICATION_STATUS_LABELS = {
  pending: 'Pending Review',
  under_review: 'Under Review',
  needs_revision: 'Needs Revision',
  approved: 'Approved',
  rejected: 'Rejected',
};

function mapRestaurant(row) {
  const rawStatus = String(row.restaurant_status || '').toLowerCase();
  const rawAppStatus = String(row.application_status || '').toLowerCase();
  const statusLabel = STATUS_LABELS[rawStatus] || row.restaurant_status || 'Pending';
  const appStatusLabel = APPLICATION_STATUS_LABELS[rawAppStatus] || (row.application_status || '—');
  const addressParts = [row.street, row.barangay_name, row.zone].filter(Boolean);

  return {
    id: row.restaurant_id,
    restaurant_id: row.restaurant_id,
    name: row.restaurant_name,
    registeredName: row.registered_name,
    businessType: row.business_type,
    ownershipStructure: row.ownership_structure,
    ownerName: row.owner_name || '—',
    ownerEmail: row.owner_email || row.business_email || '—',
    businessEmail: row.business_email,
    phone: row.contact_phone || '—',
    address: addressParts.join(', ') || row.zone || '—',
    zone: row.zone || '—',
    serviceCoverage: row.zone ? [row.zone] : [],
    status: statusLabel,
    rawStatus,
    isPublished: Boolean(row.is_published),
    lastPublishedAt: row.last_published_at || null,
    applicationStatus: appStatusLabel,
    verificationStatus: rawAppStatus === 'approved' ? 'Verified' : (rawAppStatus === 'rejected' ? 'Rejected' : 'Pending'),
    operatingStatus: rawStatus === 'active'
      ? 'Open'
      : rawStatus === 'suspended'
        ? 'Suspended'
        : rawStatus === 'inactive'
          ? 'Deactivated'
          : 'Not operating',
    referenceNumber: row.reference_number || null,
    joinedDate: row.created_at,
    offersDelivery: Boolean(row.offers_delivery),
    offersPickup: Boolean(row.offers_pickup),
    offersDineIn: Boolean(row.offers_dine_in),
  };
}

export default function AdminRestaurantsPage() {
  const { permissions } = useAdminSession();
  const { query: globalQuery } = useAdminPageSearch({ scopeLabel: 'Restaurants', placeholder: 'Search restaurants by name, owner, city, status', searchableFields: ['name', 'ownerName', 'ownerEmail', 'address', 'zone', 'status'] });
  const [restaurants, setRestaurants] = useState([]);
  const [meta, setMeta] = useState({ current_page: 1, last_page: 1, per_page: 15, total: 0 });
  const [pendingApplicationsCount, setPendingApplicationsCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [view, setView] = useState('Directory');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const [detailTab, setDetailTab] = useState('Profile');
  const [pendingAction, setPendingAction] = useState(null);
  const [savingAction, setSavingAction] = useState(false);
  const [notice, setNotice] = useState('');

  const canActivate = permissions.restaurants?.includes('activate');
  const canDeactivate = permissions.restaurants?.includes('deactivate');

  const effectiveSearch = (globalQuery || search).trim();

  const loadRestaurants = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [restData, appData] = await Promise.all([
        adminApiService.getRestaurants({
          search: effectiveSearch,
          status: statusFilter,
          page,
          per_page: 15,
        }),
        adminApiService.getApplications({ type: 'restaurant', per_page: 100 }),
      ]);

      const mapped = (restData?.items || []).map(mapRestaurant);
      setRestaurants(mapped);
      setMeta(restData?.meta || { current_page: 1, last_page: 1, per_page: 15, total: mapped.length });

      const pendingCount = (appData?.items || []).filter((item) =>
        ['pending', 'under_review', 'needs_revision'].includes(String(item.application_status || '').toLowerCase())
      ).length;
      setPendingApplicationsCount(pendingCount);
    } catch (err) {
      setError(err?.message || 'Failed to load restaurants from the server.');
    } finally {
      setLoading(false);
    }
  }, [effectiveSearch, statusFilter, page]);

  useEffect(() => {
    loadRestaurants();
  }, [loadRestaurants]);
  function askAction(restaurant, action) {
    setSelected(restaurant);
    setPendingAction({ restaurant, action });
  }

  async function applyAction({ reason }) {
    if (!pendingAction || savingAction) return;
    const { restaurant, action } = pendingAction;
    const statusMap = {
      'Suspend operations': 'suspended',
      'Deactivate operations': 'inactive',
      Activate: 'active',
      Reactivate: 'active',
    };
    const backendStatus = statusMap[action];
    if (!backendStatus) {
      setPendingAction(null);
      return;
    }

    setSavingAction(true);
    setError('');
    try {
      const updatedRow = await adminApiService.updateRestaurantStatus(restaurant.restaurant_id, {
        status: backendStatus,
        reason,
      });
      const nextStatusLabel = STATUS_LABELS[String(updatedRow?.restaurant_status || backendStatus).toLowerCase()] || restaurant.status;
      const updated = {
        ...restaurant,
        rawStatus: updatedRow?.restaurant_status || backendStatus,
        status: nextStatusLabel,
        operatingStatus: backendStatus === 'active' ? 'Open' : (backendStatus === 'suspended' ? 'Suspended' : 'Deactivated'),
      };
      setRestaurants((previous) => previous.map((item) => item.id === restaurant.id ? updated : item));
      setSelected(updated);
      setNotice(`${restaurant.name}: ${action.toLowerCase()} saved.`);
    } catch (err) {
      setError(err?.message || 'Failed to update restaurant status.');
    } finally {
      setSavingAction(false);
      setPendingAction(null);
    }
  }

  const directoryColumns = [
    { key: 'name', label: 'Restaurant', render: (restaurant) => <button className="admin-text-link" type="button" onClick={() => { setSelected(restaurant); setDetailTab('Profile'); }}><strong>{restaurant.name}</strong><span>{restaurant.ownerName} · {restaurant.ownerEmail}</span></button> },
    { key: 'address', label: 'Physical address / coverage', render: (restaurant) => <>{restaurant.address}<br /><span className="admin-muted">City: {restaurant.zone}</span></> },
    { key: 'status', label: 'Account / operating', render: (restaurant) => <><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}><StatusBadge status={restaurant.status} /><StatusBadge status={restaurant.isPublished ? 'Published' : 'Not published'} /></div><span className="admin-muted">{restaurant.operatingStatus || '—'} · {restaurant.applicationStatus || '—'} · {restaurant.verificationStatus || '—'}</span></> },
    { key: 'businessType', label: 'Business type', render: (restaurant) => restaurant.businessType || '—' },
    { key: 'services', label: 'Services', render: (restaurant) => [restaurant.offersDelivery && 'Delivery', restaurant.offersPickup && 'Pickup', restaurant.offersDineIn && 'Dine-in'].filter(Boolean).join(', ') || '—' },
    { key: 'joinedDate', label: 'Registered', render: (restaurant) => formatDate(restaurant.joinedDate) },
    { key: 'actions', label: 'Actions', render: (restaurant) => <div className="admin-action-row">
      {restaurant.status === 'Active' && canDeactivate && <button className="admin-action-button admin-action-button--danger" type="button" onClick={() => askAction(restaurant, 'Suspend operations')}>Suspend</button>}
      {restaurant.status === 'Suspended' && canActivate && <button className="admin-action-button" type="button" onClick={() => askAction(restaurant, 'Reactivate')}>Reactivate</button>}
      {restaurant.status !== 'Deactivated' && restaurant.status !== 'Active' && restaurant.status !== 'Suspended' && canActivate && <button className="admin-action-button" type="button" onClick={() => askAction(restaurant, 'Activate')}>Activate</button>}
      {canDeactivate && restaurant.status !== 'Deactivated' && <button className="admin-action-button" type="button" onClick={() => askAction(restaurant, 'Deactivate operations')}>Deactivate</button>}
    </div> },
  ];

  const history = selected
    ? [
      { id: 'submitted', title: 'Restaurant registered', description: `Status: ${selected.status} · Application: ${selected.applicationStatus}`, time: selected.joinedDate },
      ...(selected.verificationStatus === 'Verified' ? [{ id: 'verified', title: 'Business documents verified', description: 'Application approved by administrator.', time: selected.joinedDate }] : []),
    ]
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
        {error && (
          <div className="admin-inline-notice" role="alert" style={{ borderColor: 'var(--salo-error)', color: 'var(--salo-error)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
            <span>{error}</span>
            <button className="admin-action-button" type="button" onClick={loadRestaurants}>Retry</button>
          </div>
        )}
        <Tabs items={['Directory', 'Monitoring']} value={view} onChange={setView} label="Restaurant management views" />
        <div className="admin-filter-bar">
          <label className="admin-filter-control">
            Search
            <input
              aria-label="Search restaurants"
              placeholder="Restaurant, city, reference, or email"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          </label>
          <label className="admin-filter-control">
            Status
            <select
              aria-label="Filter restaurant status"
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(event.target.value);
                setPage(1);
              }}
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="approved">Approved</option>
              <option value="pending">Pending</option>
              <option value="suspended">Suspended</option>
              <option value="inactive">Deactivated</option>
              <option value="rejected">Rejected</option>
            </select>
          </label>
        </div>
        {loading ? (
          <p className="admin-muted" role="status">Loading restaurant partners...</p>
        ) : (
          <>
            {view === 'Directory' && (
              <DataTable
                columns={directoryColumns}
                rows={restaurants}
                defaultOrder={[[0, 'asc']]}
                emptyTitle="No restaurants found"
                emptyDescription="Adjust your search or status filter to see restaurant partners."
              />
            )}
            {view === 'Monitoring' && (
              <DataTable
                defaultOrder={[[0, 'asc']]}
                columns={[
                  { key: 'name', label: 'Restaurant', render: (restaurant) => <strong>{restaurant.name}</strong> },
                  { key: 'status', label: 'Account status', render: (restaurant) => <StatusBadge status={restaurant.status} /> },
                  { key: 'operatingStatus', label: 'Availability', render: (restaurant) => restaurant.operatingStatus || restaurant.status },
                  { key: 'zone', label: 'City / Zone', render: (restaurant) => restaurant.zone },
                  { key: 'services', label: 'Services', render: (restaurant) => [restaurant.offersDelivery && 'Delivery', restaurant.offersPickup && 'Pickup', restaurant.offersDineIn && 'Dine-in'].filter(Boolean).join(', ') || '—' },
                ]}
                rows={restaurants}
                emptyTitle="No monitoring records"
                emptyDescription="Restaurant monitoring records are not available."
              />
            )}
            {meta.total > 0 && (
              <div className="admin-filter-bar" style={{ justifyContent: 'space-between', alignItems: 'center', marginTop: '12px' }}>
                <span className="admin-muted">
                  Page {meta.current_page} of {meta.last_page} · {meta.total} total restaurant{meta.total === 1 ? '' : 's'}
                </span>
                <div className="admin-action-row">
                  <button
                    className="admin-action-button"
                    type="button"
                    disabled={meta.current_page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </button>
                  <button
                    className="admin-action-button"
                    type="button"
                    disabled={meta.current_page >= meta.last_page}
                    onClick={() => setPage((p) => Math.min(meta.last_page, p + 1))}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </section>

      <DetailDrawer open={Boolean(selected)} title={selected?.name || 'Restaurant details'} onClose={() => setSelected(null)}>
        {selected && <>
          <p className="admin-muted">{selected.ownerName} · {selected.ownerEmail}</p>
          <Tabs items={['Profile', 'History']} value={detailTab === 'Monitoring' || detailTab === 'Application' ? 'Profile' : detailTab} onChange={setDetailTab} label="Restaurant detail sections" />
          {detailTab === 'Profile' && (
            <div className="admin-drawer-content">
              <ul className="admin-detail-list">
                <li><strong>Reference</strong>{selected.referenceNumber || '—'}</li>
                <li><strong>Business type</strong>{selected.businessType || '—'}</li>
                <li><strong>Ownership</strong>{selected.ownershipStructure || '—'}</li>
                <li><strong>Address</strong>{selected.address}</li>
                <li><strong>City / Zone</strong>{selected.zone}</li>
                <li><strong>Contact phone</strong>{selected.phone}</li>
                <li><strong>Business email</strong>{selected.businessEmail || '—'}</li>
                <li><strong>Account status</strong>{selected.status}</li>
                <li><strong>Application status</strong>{selected.applicationStatus}</li>
                <li><strong>Registered</strong>{formatDate(selected.joinedDate)}</li>
              </ul>
            </div>
          )}
          {detailTab === 'History' && <Timeline items={history} />}
        </>}
      </DetailDrawer>

      <ConfirmDialog
        open={Boolean(pendingAction)}
        title={`${pendingAction?.action || 'Confirm'}?`}
        description="Record the status change and reason in the audit log."
        confirmLabel={savingAction ? 'Saving...' : (pendingAction?.action || 'Confirm')}
        requireReauthentication
        requireReason
        onClose={() => setPendingAction(null)}
        onConfirm={applyAction}
      />
    </AdminLayout>
  );
}
