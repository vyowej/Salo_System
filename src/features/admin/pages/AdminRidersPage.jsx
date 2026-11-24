import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
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
import AdminManageRiderScheduleModal from '../components/AdminManageRiderScheduleModal';
import AdminScheduleRequestReviewModal from '../components/AdminScheduleRequestReviewModal';
import useAdminSession from '../contexts/useAdminSession';
import { useAdminPageSearch } from '../contexts/useAdminSearch';
import { formatDate, formatPeso } from '../utils/format';
import {
  formatScheduleDate,
  getDayLabel,
  getShiftMeta,
} from '../../rider/utils/riderScheduleRequests';
import './AdminPages.css';
import './AdminRidersSchedule.css';

const STATUS_LABELS = {
  active: 'Active',
  approved: 'Approved',
  suspended: 'Suspended',
  inactive: 'Deactivated',
  pending: 'Pending',
  rejected: 'Rejected',
};

function mapRider(row) {
  const rawStatus = String(row.rider_status || '').toLowerCase();
  const statusLabel = STATUS_LABELS[rawStatus] || row.rider_status || 'Pending';
  const vehicleParts = [row.vehicle_brand, row.vehicle_model].filter(Boolean);
  const vehicleLabel = vehicleParts.length > 0
    ? `${vehicleParts.join(' ')} (${row.vehicle_type || 'vehicle'})`
    : (row.vehicle_type || '—');

  return {
    id: row.rider_id,
    rider_id: row.rider_id,
    user_id: row.user_id,
    name: `${row.first_name || ''} ${row.last_name || ''}`.trim() || row.username || '—',
    username: row.username || '—',
    email: row.email || '—',
    phone: row.phone_number || '—',
    vehicle: vehicleLabel,
    vehicleType: row.vehicle_type || '—',
    plateNumber: row.plate_number || '—',
    zone: row.zone || '—',
    shifts: row.preferred_shifts ? String(row.preferred_shifts).split(',').map((s) => s.trim()).filter(Boolean) : [],
    availableDays: row.available_days ? String(row.available_days).split(',').map((s) => s.trim()).filter(Boolean) : [],
    preferredHubs: row.preferred_hubs ? String(row.preferred_hubs).split(',').map((s) => s.trim()).filter(Boolean) : [],
    emergencyContactName: row.emergency_contact_name || '—',
    emergencyContactPhone: row.emergency_contact_phone || '—',
    status: statusLabel,
    rawStatus,
    isOnline: Boolean(row.is_online),
    onDelivery: Boolean(row.on_delivery),
    codPendingAmount: Number(row.cod_pending_amount ?? 0),
    approvedAt: row.approved_at || null,
    joinedDate: row.created_at,
  };
}

export default function AdminRidersPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') === 'schedule-requests' ? 'Schedule Requests' : 'Directory';

  const { permissions } = useAdminSession();
  const { query: globalQuery } = useAdminPageSearch({ scopeLabel: 'Riders', placeholder: 'Search riders by name, phone, zone, status', searchableFields: ['name', 'username', 'email', 'phone', 'vehicle', 'plateNumber', 'zone', 'status'] });
  const [riders, setRiders] = useState([]);
  const [meta, setMeta] = useState({ current_page: 1, last_page: 1, per_page: 15, total: 0 });
  const [unassignedOrdersCount, setUnassignedOrdersCount] = useState(0);
  const [pendingApplicationsCount, setPendingApplicationsCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [view, setView] = useState(initialTab);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const [detailTab, setDetailTab] = useState('Profile');
  const [pendingAction, setPendingAction] = useState(null);
  const [savingAction, setSavingAction] = useState(false);
  const [notice, setNotice] = useState('');

  // Real API state for schedule change requests
  const [scheduleRequests, setScheduleRequests] = useState([]);
  const [scheduleMeta, setScheduleMeta] = useState({ current_page: 1, last_page: 1, per_page: 20, total: 0 });
  const [pendingScheduleCount, setPendingScheduleCount] = useState(0);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleError, setScheduleError] = useState('');
  const [requestStatusFilter, setRequestStatusFilter] = useState('all');
  const [requestSearch, setRequestSearch] = useState('');
  const [requestDateFilter, setRequestDateFilter] = useState('all');
  const [requestPage, setRequestPage] = useState(1);

  // Selected rider schedule drawer state
  const [selectedRiderScheduleData, setSelectedRiderScheduleData] = useState(null);
  const [selectedRiderScheduleLoading, setSelectedRiderScheduleLoading] = useState(false);
  const [selectedRiderScheduleError, setSelectedRiderScheduleError] = useState('');

  const [reviewTarget, setReviewTarget] = useState(null);
  const [manageScheduleRider, setManageScheduleRider] = useState(null);

  const loadScheduleRequests = useCallback(async () => {
    setScheduleLoading(true);
    setScheduleError('');
    try {
      const daysParam = requestDateFilter === '7d' ? 7 : requestDateFilter === '30d' ? 30 : undefined;
      const data = await adminApiService.getRiderScheduleRequests({
        status: requestStatusFilter,
        search: requestSearch.trim() || undefined,
        days: daysParam,
        page: requestPage,
        per_page: 20,
      });
      setScheduleRequests(Array.isArray(data?.items) ? data.items : []);
      setPendingScheduleCount(Number(data?.pending_count ?? 0));
      setScheduleMeta(data?.meta || { current_page: 1, last_page: 1, per_page: 20, total: 0 });
    } catch (err) {
      setScheduleError(err?.message || 'Unable to load rider schedule requests.');
    } finally {
      setScheduleLoading(false);
    }
  }, [requestStatusFilter, requestSearch, requestDateFilter, requestPage]);

  useEffect(() => {
    loadScheduleRequests();
  }, [loadScheduleRequests]);

  const loadSelectedRiderSchedule = useCallback(async (riderId) => {
    if (!riderId) return;
    setSelectedRiderScheduleLoading(true);
    setSelectedRiderScheduleError('');
    try {
      const data = await adminApiService.getRiderSchedule(riderId);
      setSelectedRiderScheduleData(data);
    } catch (err) {
      setSelectedRiderScheduleError(err?.message || 'Unable to load rider schedule.');
    } finally {
      setSelectedRiderScheduleLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selected?.rider_id && detailTab === 'Schedule') {
      loadSelectedRiderSchedule(selected.rider_id);
    }
  }, [selected?.rider_id, detailTab, loadSelectedRiderSchedule]);

  const canActivate = permissions.riders?.includes('activate');
  const canDeactivate = permissions.riders?.includes('deactivate');

  const effectiveSearch = (globalQuery || search).trim();

  const loadRiders = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [ridersData, appsData] = await Promise.all([
        adminApiService.getRiders({
          search: effectiveSearch,
          status: statusFilter,
          page,
          per_page: 15,
        }),
        adminApiService.getApplications({ type: 'rider', per_page: 100 }),
      ]);

      const mapped = (ridersData?.items || []).map(mapRider);
      setRiders(mapped);
      setMeta(ridersData?.meta || { current_page: 1, last_page: 1, per_page: 15, total: mapped.length });
      setUnassignedOrdersCount(Number(ridersData?.operations_summary?.unassigned_ready_orders ?? 0));

      const pendingCount = (appsData?.items || []).filter((item) =>
        ['pending', 'under_review', 'needs_revision'].includes(String(item.application_status || '').toLowerCase())
      ).length;
      setPendingApplicationsCount(pendingCount);
    } catch (err) {
      setError(err?.message || 'Failed to load riders from the server.');
    } finally {
      setLoading(false);
    }
  }, [effectiveSearch, statusFilter, page]);

  useEffect(() => {
    loadRiders();
  }, [loadRiders]);

  function askAction(rider, action) {
    setSelected(rider);
    setPendingAction({ rider, action });
  }

  async function applyAction({ reason }) {
    if (!pendingAction || savingAction) return;
    const { rider, action } = pendingAction;
    const statusMap = {
      Suspend: 'suspended',
      Deactivate: 'inactive',
    };

    setSavingAction(true);
    setError('');
    try {
      let updatedRow = null;
      let fallbackStatus = rider.rawStatus;
      if (action === 'Activate') {
        updatedRow = await adminApiService.activateRider(rider.rider_id);
        fallbackStatus = 'active';
      } else {
        const backendStatus = statusMap[action];
        if (!backendStatus) {
          setPendingAction(null);
          return;
        }
        updatedRow = await adminApiService.updateRiderStatus(rider.rider_id, {
          status: backendStatus,
          reason,
        });
        fallbackStatus = backendStatus;
      }

      const nextRawStatus = updatedRow?.rider_status || fallbackStatus;
      const nextStatusLabel = STATUS_LABELS[String(nextRawStatus).toLowerCase()] || rider.status;
      const updated = {
        ...rider,
        rawStatus: nextRawStatus,
        status: nextStatusLabel,
        approvedAt: updatedRow?.approved_at || rider.approvedAt,
      };
      setRiders((previous) => previous.map((item) => item.id === rider.id ? updated : item));
      setSelected(updated);
      setNotice(`${rider.name}: ${action.toLowerCase()} saved.`);
    } catch (err) {
      setError(err?.message || 'Failed to update rider status.');
    } finally {
      setSavingAction(false);
      setPendingAction(null);
    }
  }

  const handleViewChange = (nextView) => {
    setView(nextView);
    if (nextView === 'Schedule Requests') {
      setSearchParams({ tab: 'schedule-requests' }, { replace: true });
    } else if (searchParams.get('tab')) {
      setSearchParams({}, { replace: true });
    }
  };

  const handleApproveScheduleRequest = async (requestId, remarks) => {
    await adminApiService.approveRiderScheduleRequest(requestId, remarks);
    setReviewTarget(null);
    setNotice(`Schedule change request #${requestId} approved.`);
    await Promise.all([
      loadScheduleRequests(),
      loadRiders(),
      selected?.rider_id ? loadSelectedRiderSchedule(selected.rider_id) : Promise.resolve(),
    ]);
  };

  const handleRejectScheduleRequest = async (requestId, remarks) => {
    await adminApiService.rejectRiderScheduleRequest(requestId, remarks);
    setReviewTarget(null);
    setNotice(`Schedule change request #${requestId} rejected. Rider's approved schedule remains unchanged.`);
    await Promise.all([
      loadScheduleRequests(),
      selected?.rider_id ? loadSelectedRiderSchedule(selected.rider_id) : Promise.resolve(),
    ]);
  };

  const handleSaveDirectScheduleUpdate = async (formPayload) => {
    if (!manageScheduleRider) return;
    const updated = await adminApiService.updateRiderSchedule(manageScheduleRider.rider_id, formPayload);
    setManageScheduleRider(null);
    setNotice(`Approved schedule updated for ${manageScheduleRider.name}.`);
    if (selected?.rider_id === manageScheduleRider.rider_id) {
      setSelectedRiderScheduleData(updated);
    }
    await Promise.all([
      loadScheduleRequests(),
      loadRiders(),
    ]);
  };

  const selectedRiderSchedule = selectedRiderScheduleData?.approved_schedule || (selected ? {
    available_days: selected.availableDays || [],
    preferred_shifts: selected.shifts || [],
    preferred_hubs: selected.preferredHubs || [],
    effective_date: selected.approvedAt || selected.joinedDate || null,
  } : null);

  const selectedRiderUpcomingSchedule = selectedRiderScheduleData?.upcoming_schedule || null;
  const selectedRiderPendingRequest = selectedRiderScheduleData?.pending_request || null;
  const selectedRiderScheduleHistory = Array.isArray(selectedRiderScheduleData?.history)
    ? selectedRiderScheduleData.history
    : [];

  const directoryColumns = [
    { key: 'name', label: 'Rider', render: (rider) => <button className="admin-text-link" type="button" onClick={() => { setSelected(rider); setDetailTab('Profile'); }}><strong>{rider.name}</strong><span>@{rider.username} · {rider.phone}</span></button> },
    { key: 'vehicle', label: 'Vehicle / plate', render: (rider) => <>{rider.vehicle}<br /><span className="admin-muted">{rider.plateNumber !== '—' ? `Plate: ${rider.plateNumber}` : rider.vehicleType}</span></> },
    { key: 'zone', label: 'Zone / shifts', render: (rider) => <>{rider.zone}<br /><span className="admin-muted">{rider.shifts.length > 0 ? rider.shifts.join(', ') : '—'}</span></> },
    { key: 'joinedDate', label: 'Registered', render: (rider) => formatDate(rider.joinedDate) },
    { key: 'status', label: 'Status', render: (rider) => <StatusBadge status={rider.status} /> },
    { key: 'actions', label: 'Actions', render: (rider) => <div className="admin-action-row">
      <button className="admin-action-button" type="button" onClick={() => { setSelected(rider); setDetailTab('Schedule'); }}>Schedule</button>
      {rider.status === 'Active' && canDeactivate && <button className="admin-action-button admin-action-button--danger" type="button" onClick={() => askAction(rider, 'Suspend')}>Suspend</button>}
      {rider.rawStatus === 'approved' && canActivate && <button className="admin-action-button" type="button" onClick={() => askAction(rider, 'Activate')}>Activate</button>}
      {canDeactivate && rider.status !== 'Deactivated' && <button className="admin-action-button" type="button" onClick={() => askAction(rider, 'Deactivate')}>Deactivate</button>}
    </div> },
  ];

  const scheduleRequestColumns = [
    {
      key: 'id',
      label: 'Request',
      render: (req) => (
        <>
          <strong>#{req.id}</strong>
          <br />
          <span className="admin-muted">
            {req.entry_type === 'admin_update' ? 'Admin-Initiated Update' : 'Rider Request'}
          </span>
        </>
      ),
    },
    {
      key: 'rider_name',
      label: 'Rider',
      render: (req) => (
        <>
          <strong>{req.rider_name}</strong>
          <br />
          <span className="admin-muted">@{req.rider_username} · {req.rider_zone}</span>
        </>
      ),
    },
    {
      key: 'schedule',
      label: 'Proposed / Updated Schedule',
      render: (req) => (
        <>
          <span>{(req.available_days || []).map((d) => getDayLabel(d, { short: true })).join(', ') || '—'}</span>
          <br />
          <span className="admin-muted">
            {(req.preferred_shifts || []).map((s) => getShiftMeta(s).label).join(', ') || '—'}
          </span>
        </>
      ),
    },
    { key: 'effective_date', label: 'Effective', render: (req) => formatScheduleDate(req.effective_date) },
    { key: 'submitted_at', label: 'Submitted', render: (req) => formatScheduleDate(req.submitted_at) },
    {
      key: 'status',
      label: 'Status',
      render: (req) => (
        <StatusBadge
          status={
            req.entry_type === 'admin_update'
              ? 'Approved'
              : req.status === 'pending'
                ? 'Pending Review'
                : req.status.charAt(0).toUpperCase() + req.status.slice(1)
          }
        />
      ),
    },
    {
      key: 'actions',
      label: 'Action',
      render: (req) => (
        <button
          className="admin-action-button"
          type="button"
          onClick={() => setReviewTarget(req)}
        >
          {req.status === 'pending' ? 'Review' : 'View'}
        </button>
      ),
    },
  ];

  const history = selected
    ? [
      { id: 'rider-submitted', title: 'Rider registered', description: `Status: ${selected.status} · Zone: ${selected.zone}`, time: selected.joinedDate },
      ...(selected.approvedAt ? [{ id: 'rider-approved', title: 'Rider approved', description: 'Rider account activated.', time: selected.approvedAt }] : []),
    ]
    : [];
  const activeRiders = riders.filter((rider) => rider.status === 'Active');

  return (
    <AdminLayout>
      <section className="admin-shell-page">
        <PageHeader
          title="Riders and Delivery Operations"
          description="Manage approved riders, account status, zone assignments, and delivery operations."
          actions={<Link className="admin-action-button" to="/admin/applications?type=rider">Pending applications ({pendingApplicationsCount})</Link>}
        />
        {notice && <p className="admin-inline-notice" role="status">{notice}</p>}
        {error && (
          <div className="admin-inline-notice" role="alert" style={{ borderColor: 'var(--salo-error)', color: 'var(--salo-error)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
            <span>{error}</span>
            <button className="admin-action-button" type="button" onClick={loadRiders}>Retry</button>
          </div>
        )}
        <Tabs
          items={[
            'Directory',
            'Operations',
            {
              value: 'Schedule Requests',
              label: pendingScheduleCount > 0 ? `Schedule Requests (${pendingScheduleCount})` : 'Schedule Requests',
            },
          ]}
          value={view}
          onChange={handleViewChange}
          label="Rider management views"
        />

        {view === 'Schedule Requests' ? (
          <>
            <div className="admin-filter-bar">
              <label className="admin-filter-control">
                Search requests
                <input
                  aria-label="Search schedule requests"
                  placeholder="Request ID, rider name, username, or reason"
                  value={requestSearch}
                  onChange={(event) => {
                    setRequestSearch(event.target.value);
                    setRequestPage(1);
                  }}
                />
              </label>
              <label className="admin-filter-control">
                Status
                <select
                  aria-label="Filter schedule requests by status"
                  value={requestStatusFilter}
                  onChange={(event) => {
                    setRequestStatusFilter(event.target.value);
                    setRequestPage(1);
                  }}
                >
                  <option value="all">All requests &amp; updates</option>
                  <option value="pending">Pending review</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                  <option value="cancelled">Cancelled</option>
                  <option value="admin_update">Admin-initiated updates</option>
                </select>
              </label>
              <label className="admin-filter-control">
                Submitted
                <select
                  aria-label="Filter schedule requests by submission date"
                  value={requestDateFilter}
                  onChange={(event) => {
                    setRequestDateFilter(event.target.value);
                    setRequestPage(1);
                  }}
                >
                  <option value="all">All dates</option>
                  <option value="7d">Last 7 days</option>
                  <option value="30d">Last 30 days</option>
                </select>
              </label>
            </div>

            {scheduleError ? (
              <div className="admin-inline-notice" role="alert" style={{ borderColor: 'var(--salo-error)', color: 'var(--salo-error)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                <span>{scheduleError}</span>
                <button className="admin-action-button" type="button" onClick={loadScheduleRequests}>Retry</button>
              </div>
            ) : scheduleLoading ? (
              <p className="admin-muted" role="status">Loading schedule requests...</p>
            ) : (
              <>
                <DataTable
                  columns={scheduleRequestColumns}
                  rows={scheduleRequests}
                  rowKey="id"
                  emptyTitle="schedule request"
                  emptyDescription="Adjust your search, status, or submission date filter."
                />
                {scheduleMeta.total > 0 && (
                  <div className="admin-filter-bar" style={{ justifyContent: 'space-between', alignItems: 'center', marginTop: '12px' }}>
                    <span className="admin-muted">
                      Page {scheduleMeta.current_page} of {scheduleMeta.last_page} · {scheduleMeta.total} total request{scheduleMeta.total === 1 ? '' : 's'}
                    </span>
                    <div className="admin-action-row">
                      <button
                        className="admin-action-button"
                        type="button"
                        disabled={scheduleMeta.current_page <= 1}
                        onClick={() => setRequestPage((p) => Math.max(1, p - 1))}
                      >
                        Previous
                      </button>
                      <button
                        className="admin-action-button"
                        type="button"
                        disabled={scheduleMeta.current_page >= scheduleMeta.last_page}
                        onClick={() => setRequestPage((p) => Math.min(scheduleMeta.last_page, p + 1))}
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        ) : (
          <>
            <div className="admin-filter-bar">
              <label className="admin-filter-control">
                Search
                <input
                  aria-label="Search riders"
                  placeholder="Rider, vehicle, plate, zone, or email"
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
                  aria-label="Filter riders by status"
                  value={statusFilter}
                  onChange={(event) => {
                    setStatusFilter(event.target.value);
                    setPage(1);
                  }}
                >
                  <option value="all">All riders</option>
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
              <p className="admin-muted" role="status">Loading riders...</p>
            ) : (
              <>
                {view === 'Directory' && (
                  <DataTable
                    columns={directoryColumns}
                    rows={riders}
                    defaultOrder={[[0, 'asc']]}
                    emptyTitle="No riders found"
                    emptyDescription="Adjust your search or status filter."
                  />
                )}
                {view === 'Operations' && <>
                  <div className="admin-roster-summary">
                    <div><strong>{riders.filter((r) => r.isOnline).length}</strong><span>Online</span></div>
                    <div><strong>{activeRiders.length}</strong><span>Active riders</span></div>
                    <div><strong>{riders.filter((r) => r.onDelivery).length}</strong><span>On delivery</span></div>
                    <div><strong>{unassignedOrdersCount}</strong><span>Unassigned orders</span></div>
                  </div>
                  <section className="admin-map-panel" aria-label="Rider location map panel">
                    <div><h2>Authorized live locations</h2><p>Location visibility is limited to riders sharing location during an active shift.</p></div>
                    <div className="admin-map-grid">{activeRiders.map((rider) => <article key={rider.id}><span aria-hidden="true">●</span><strong>{rider.name}</strong><small>{rider.zone} · {rider.onDelivery ? 'On delivery' : rider.isOnline ? 'Online' : 'Offline'}</small></article>)}</div>
                  </section>
                  <DataTable defaultOrder={[[0, 'asc']]} columns={[
                    { key: 'name', label: 'Rider', render: (rider) => <strong>{rider.name}</strong> },
                    { key: 'status', label: 'Account status', render: (rider) => <StatusBadge status={rider.status} /> },
                    { key: 'shifts', label: 'Preferred shifts', render: (rider) => rider.shifts.length > 0 ? rider.shifts.join(', ') : '—' },
                    { key: 'zone', label: 'Base city', render: (rider) => rider.zone },
                    { key: 'cod', label: 'COD Pending', render: (rider) => formatPeso(rider.codPendingAmount || 0) },
                  ]} rows={riders} emptyTitle="No rider operations" emptyDescription="No rider records match this filter." />
                </>}
                {meta.total > 0 && (
                  <div className="admin-filter-bar" style={{ justifyContent: 'space-between', alignItems: 'center', marginTop: '12px' }}>
                    <span className="admin-muted">
                      Page {meta.current_page} of {meta.last_page} · {meta.total} total rider{meta.total === 1 ? '' : 's'}
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
          </>
        )}
      </section>

      <DetailDrawer open={Boolean(selected)} title={selected?.name || 'Rider details'} onClose={() => { setSelected(null); setSelectedRiderScheduleData(null); }}>
        {selected && <>
          <p className="admin-muted">@{selected.username} · {selected.email}</p>
          <Tabs items={['Profile', 'Schedule', 'History']} value={detailTab === 'Operations' || detailTab === 'Application' ? 'Profile' : detailTab} onChange={setDetailTab} label="Rider detail sections" />
          {detailTab === 'Profile' && <div className="admin-drawer-content">
            <ul className="admin-detail-list">
              <li><strong>Contact</strong>{selected.phone}</li>
              <li><strong>Vehicle</strong>{selected.vehicle}</li>
              <li><strong>Plate number</strong>{selected.plateNumber}</li>
              <li><strong>Base city / Zone</strong>{selected.zone}</li>
              <li><strong>Preferred shifts</strong>{selected.shifts.length > 0 ? selected.shifts.join(', ') : '—'}</li>
              <li><strong>Available days</strong>{selected.availableDays.length > 0 ? selected.availableDays.join(', ') : '—'}</li>
              <li><strong>Emergency contact</strong>{selected.emergencyContactName} ({selected.emergencyContactPhone})</li>
              <li><strong>Registered</strong>{formatDate(selected.joinedDate)}</li>
              <li><strong>Account status</strong><StatusBadge status={selected.status} /></li>
            </ul>
            <div className="admin-action-row">
              {selected.status === 'Active' && canDeactivate && <button className="admin-action-button admin-action-button--danger" type="button" onClick={() => askAction(selected, 'Suspend')}>Suspend</button>}
              {selected.rawStatus === 'approved' && canActivate && <button className="admin-action-button" type="button" onClick={() => askAction(selected, 'Activate')}>Activate</button>}
              {canDeactivate && selected.status !== 'Deactivated' && <button className="admin-action-button" type="button" onClick={() => askAction(selected, 'Deactivate')}>Deactivate</button>}
            </div>
          </div>}
          {detailTab === 'Schedule' && (
            <div className="admin-drawer-content admin-schedule-section">
              {selectedRiderScheduleLoading ? (
                <p className="admin-muted" role="status">Loading rider schedule...</p>
              ) : selectedRiderScheduleError ? (
                <div className="admin-schedule-notice admin-schedule-notice--warning" role="alert" style={{ borderColor: 'var(--salo-error)', color: 'var(--salo-error)' }}>
                  <div className="admin-schedule-header-row">
                    <span>{selectedRiderScheduleError}</span>
                    <button className="admin-action-button" type="button" onClick={() => loadSelectedRiderSchedule(selected.rider_id)}>
                      Retry
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="admin-schedule-header-row">
                    <div>
                      <strong>Current Approved Schedule</strong>
                      <p className="admin-muted" style={{ margin: '2px 0 0' }}>
                        {selectedRiderSchedule?.effective_date
                          ? `Effective ${formatScheduleDate(selectedRiderSchedule.effective_date)}`
                          : 'From approved Rider Application'}
                      </p>
                    </div>
                    <button
                      className="admin-action-button"
                      type="button"
                      onClick={() => setManageScheduleRider(selected)}
                    >
                      Manage Schedule
                    </button>
                  </div>

                  {selectedRiderPendingRequest && (
                    <div className="admin-schedule-notice admin-schedule-notice--warning" role="status">
                      <div className="admin-schedule-header-row">
                        <span>
                          Pending schedule change request <strong>#{selectedRiderPendingRequest.id}</strong> (effective {formatScheduleDate(selectedRiderPendingRequest.effective_date)}).
                        </span>
                        <button
                          className="admin-action-button"
                          type="button"
                          onClick={() => setReviewTarget(selectedRiderPendingRequest)}
                        >
                          Review Request
                        </button>
                      </div>
                    </div>
                  )}

                  {selectedRiderUpcomingSchedule && (
                    <div className="admin-schedule-notice admin-schedule-notice--info" role="note">
                      Upcoming approved schedule effective <strong>{formatScheduleDate(selectedRiderUpcomingSchedule.effective_date)}</strong>:{' '}
                      {(selectedRiderUpcomingSchedule.available_days || []).map((d) => getDayLabel(d, { short: true })).join(', ')} ·{' '}
                      {(selectedRiderUpcomingSchedule.preferred_shifts || []).map((s) => getShiftMeta(s).label).join(', ')}
                    </div>
                  )}

                  <ul className="admin-detail-list">
                    <li>
                      <strong>Available days</strong>
                      {(selectedRiderSchedule?.available_days || []).length > 0
                        ? selectedRiderSchedule.available_days.map((d) => getDayLabel(d, { short: true })).join(', ')
                        : '—'}
                    </li>
                    <li>
                      <strong>Preferred shifts</strong>
                      {(selectedRiderSchedule?.preferred_shifts || []).length > 0
                        ? selectedRiderSchedule.preferred_shifts.map((s) => getShiftMeta(s).label).join(', ')
                        : '—'}
                    </li>
                    <li>
                      <strong>Preferred hubs</strong>
                      {(selectedRiderSchedule?.preferred_hubs || []).length > 0
                        ? selectedRiderSchedule.preferred_hubs.join(', ')
                        : '—'}
                    </li>
                  </ul>

                  <div className="admin-schedule-field-block">
                    <span className="admin-schedule-field-label">Schedule Change History</span>
                    {selectedRiderScheduleHistory.length === 0 ? (
                      <p className="admin-muted">No schedule change requests or updates recorded yet.</p>
                    ) : (
                      selectedRiderScheduleHistory.map((req) => (
                        <div key={req.id} className="admin-schedule-history-card">
                          <div className="admin-schedule-history-top">
                            <strong>
                              {req.entry_type === 'admin_update' ? `Admin Update #${req.id}` : `Request #${req.id}`}
                            </strong>
                            <StatusBadge
                              status={
                                req.entry_type === 'admin_update'
                                  ? 'Approved'
                                  : req.status === 'pending'
                                    ? 'Pending Review'
                                    : req.status.charAt(0).toUpperCase() + req.status.slice(1)
                              }
                            />
                          </div>
                          <span className="admin-muted">
                            Submitted {formatScheduleDate(req.submitted_at)} · Effective {formatScheduleDate(req.effective_date)}
                          </span>
                          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-primary)' }}>
                            {(req.available_days || []).map((d) => getDayLabel(d, { short: true })).join(', ')} ·{' '}
                            {(req.preferred_shifts || []).map((s) => getShiftMeta(s).label).join(', ')}
                          </span>
                          {req.reason && (
                            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
                              Reason: {req.reason}
                            </span>
                          )}
                          {req.admin_remarks && (
                            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
                              Remarks: {req.admin_remarks}
                            </span>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </>
              )}
            </div>
          )}
          {detailTab === 'History' && <Timeline items={history} />}
        </>}
      </DetailDrawer>

      <ConfirmDialog
        open={Boolean(pendingAction)}
        title={`${pendingAction?.action || 'Confirm'}?`}
        description="Record the action and reason in rider history."
        confirmLabel={savingAction ? 'Saving...' : (pendingAction?.action || 'Confirm')}
        requireReauthentication
        requireReason
        onClose={() => setPendingAction(null)}
        onConfirm={applyAction}
      />

      <AdminManageRiderScheduleModal
        open={Boolean(manageScheduleRider)}
        onClose={() => setManageScheduleRider(null)}
        rider={manageScheduleRider}
        approvedSchedule={
          manageScheduleRider && selected?.rider_id === manageScheduleRider.rider_id && selectedRiderScheduleData?.approved_schedule
            ? selectedRiderScheduleData.approved_schedule
            : manageScheduleRider
              ? {
                  available_days: manageScheduleRider.availableDays || [],
                  preferred_shifts: manageScheduleRider.shifts || [],
                  preferred_hubs: manageScheduleRider.preferredHubs || [],
                }
              : null
        }
        hasPendingRequest={
          Boolean(
            manageScheduleRider &&
            selected?.rider_id === manageScheduleRider.rider_id &&
            selectedRiderPendingRequest,
          )
        }
        onSaveDirectUpdate={handleSaveDirectScheduleUpdate}
      />

      <AdminScheduleRequestReviewModal
        open={Boolean(reviewTarget)}
        onClose={() => setReviewTarget(null)}
        request={reviewTarget}
        currentApproved={reviewTarget?.previous_schedule || null}
        onApprove={handleApproveScheduleRequest}
        onReject={handleRejectScheduleRequest}
      />
    </AdminLayout>
  );
}
