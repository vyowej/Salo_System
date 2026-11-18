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
import { formatDate, formatPeso } from '../utils/format';
import './AdminPages.css';

const ORDERS = [];

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
    emergencyContactName: row.emergency_contact_name || '—',
    emergencyContactPhone: row.emergency_contact_phone || '—',
    status: statusLabel,
    rawStatus,
    approvedAt: row.approved_at || null,
    joinedDate: row.created_at,
  };
}

export default function AdminRidersPage() {
  const { permissions } = useAdminSession();
  const { query: globalQuery } = useAdminPageSearch({ scopeLabel: 'Riders', placeholder: 'Search riders by name, phone, zone, status', searchableFields: ['name', 'username', 'email', 'phone', 'vehicle', 'plateNumber', 'zone', 'status'] });
  const [riders, setRiders] = useState([]);
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

  const unassignedOrders = ORDERS.filter((order) => !order.riderId && !['Completed', 'Cancelled'].includes(order.status));

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

  const directoryColumns = [
    { key: 'name', label: 'Rider', render: (rider) => <button className="admin-text-link" type="button" onClick={() => { setSelected(rider); setDetailTab('Profile'); }}><strong>{rider.name}</strong><span>@{rider.username} · {rider.phone}</span></button> },
    { key: 'vehicle', label: 'Vehicle / plate', render: (rider) => <>{rider.vehicle}<br /><span className="admin-muted">{rider.plateNumber !== '—' ? `Plate: ${rider.plateNumber}` : rider.vehicleType}</span></> },
    { key: 'zone', label: 'Zone / shifts', render: (rider) => <>{rider.zone}<br /><span className="admin-muted">{rider.shifts.length > 0 ? rider.shifts.join(', ') : '—'}</span></> },
    { key: 'joinedDate', label: 'Registered', render: (rider) => formatDate(rider.joinedDate) },
    { key: 'status', label: 'Status', render: (rider) => <StatusBadge status={rider.status} /> },
    { key: 'actions', label: 'Actions', render: (rider) => <div className="admin-action-row">
      {rider.status === 'Active' && canDeactivate && <button className="admin-action-button admin-action-button--danger" type="button" onClick={() => askAction(rider, 'Suspend')}>Suspend</button>}
      {rider.rawStatus === 'approved' && canActivate && <button className="admin-action-button" type="button" onClick={() => askAction(rider, 'Activate')}>Activate</button>}
      {canDeactivate && rider.status !== 'Deactivated' && <button className="admin-action-button" type="button" onClick={() => askAction(rider, 'Deactivate')}>Deactivate</button>}
    </div> },
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
        <Tabs items={['Directory', 'Operations']} value={view} onChange={setView} label="Rider management views" />
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
                <div><strong>0</strong><span>Online</span></div>
                <div><strong>{activeRiders.length}</strong><span>Active riders</span></div>
                <div><strong>0</strong><span>On delivery</span></div>
                <div><strong>{unassignedOrders.length}</strong><span>Unassigned orders</span></div>
              </div>
              <section className="admin-map-panel" aria-label="Rider location map panel">
                <div><h2>Authorized live locations</h2><p>Location visibility is limited to riders sharing location during an active shift.</p></div>
                <div className="admin-map-grid">{activeRiders.map((rider) => <article key={rider.id}><span aria-hidden="true">●</span><strong>{rider.name}</strong><small>{rider.zone} · Offline</small></article>)}</div>
              </section>
              <DataTable defaultOrder={[[0, 'asc']]} columns={[
                { key: 'name', label: 'Rider', render: (rider) => <strong>{rider.name}</strong> },
                { key: 'status', label: 'Account status', render: (rider) => <StatusBadge status={rider.status} /> },
                { key: 'shifts', label: 'Preferred shifts', render: (rider) => rider.shifts.length > 0 ? rider.shifts.join(', ') : '—' },
                { key: 'zone', label: 'Base city', render: (rider) => rider.zone },
                { key: 'cod', label: 'COD', render: () => formatPeso(0) },
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
      </section>

      <DetailDrawer open={Boolean(selected)} title={selected?.name || 'Rider details'} onClose={() => setSelected(null)}>
        {selected && <>
          <p className="admin-muted">@{selected.username} · {selected.email}</p>
          <Tabs items={['Profile', 'History']} value={detailTab === 'Operations' || detailTab === 'Application' ? 'Profile' : detailTab} onChange={setDetailTab} label="Rider detail sections" />
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
    </AdminLayout>
  );
}
