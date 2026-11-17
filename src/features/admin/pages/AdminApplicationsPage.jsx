import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import AdminLayout from '../../../layouts/AdminLayout';
import { DataTable, PageHeader, StatusBadge, showAdminToast } from '../components';
import ApplicationReviewModal from '../components/ApplicationReviewModal';
import { hasAdminPermission } from '../constants';
import { useAdminPageSearch } from '../contexts/useAdminSearch';
import useAdminSession from '../contexts/useAdminSession';
import adminApiService from '../../../services/adminApiService';
import { mapBackendApplicationStatus } from '../../../services/applicationService';
import { formatDate } from '../utils/format';
import './AdminPages.css';

const STATUS_CHIPS = [
  { label: 'All', value: 'all' },
  { label: 'Submitted', value: 'submitted' },
  { label: 'Pending Review', value: 'pending_review' },
  { label: 'Under Review', value: 'under_review' },
  { label: 'Additional Info Required', value: 'additional_documents_required' },
  { label: 'Resubmitted', value: 'resubmitted' },
  { label: 'Approved', value: 'approved' },
  { label: 'Rejected', value: 'rejected' },
];

function mapListItem(item, kind) {
  return {
    ...item,
    kind,
    applicationId: item.reference_number,
    ownerName: item.owner_name || item.name,
    vehicle: item.vehicle_type ? item.vehicle_type.replace('_', ' ').toUpperCase() : '',
    joinedDate: item.submitted_at ? String(item.submitted_at).slice(0, 10) : '',
    verifiedDocsCount: Number(item.verified_docs_count ?? 0),
    totalDocsCount: Number(item.total_docs_count ?? 0),
    reviewStatus: mapBackendApplicationStatus(item.application_status) || item.application_status,
  };
}

export default function AdminApplicationsPage() {
  const { currentAdmin } = useAdminSession();
  const [searchParams, setSearchParams] = useSearchParams();
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateRange, setDateRange] = useState('all');
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [selectedApp, setSelectedApp] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [restaurantApps, setRestaurantApps] = useState([]);
  const [riderApps, setRiderApps] = useState([]);
  const [restaurantMeta, setRestaurantMeta] = useState({ current_page: 1, last_page: 1, total: 0 });
  const [riderMeta, setRiderMeta] = useState({ current_page: 1, last_page: 1, total: 0 });

  const canViewRestaurants = hasAdminPermission(currentAdmin.role, 'restaurants', 'view')
    || hasAdminPermission(currentAdmin.role, 'applications', 'view');
  const canViewRiders = hasAdminPermission(currentAdmin.role, 'riders', 'view')
    || hasAdminPermission(currentAdmin.role, 'applications', 'view');
  const canApproveRestaurant = hasAdminPermission(currentAdmin.role, 'restaurants', 'approve')
    || hasAdminPermission(currentAdmin.role, 'applications', 'approve');
  const canApproveRider = hasAdminPermission(currentAdmin.role, 'riders', 'approve')
    || hasAdminPermission(currentAdmin.role, 'applications', 'approve');

  const rawType = searchParams.get('type');
  const activeType = rawType === 'rider' && canViewRiders
    ? 'rider'
    : canViewRestaurants
      ? 'restaurant'
      : 'rider';

  const { query: globalQuery } = useAdminPageSearch({
    scopeLabel: activeType === 'restaurant' ? 'Restaurant Applications' : 'Rider Applications',
    placeholder:
      activeType === 'restaurant'
        ? 'Search restaurant applications by ID, restaurant, owner, or city'
        : 'Search rider applications by ID, applicant, vehicle, or city',
    searchableFields: ['applicationId', 'name', 'ownerName', 'zone', 'vehicle', 'reviewStatus'],
  });

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');

    (async () => {
      try {
        const params = {
          status: statusFilter,
          date_range: dateRange,
          search: globalQuery || undefined,
          page,
          per_page: 25,
        };

        const [restRes, riderRes] = await Promise.all([
          canViewRestaurants ? adminApiService.getApplications({ ...params, type: 'restaurant' }) : Promise.resolve({ items: [], meta: {} }),
          canViewRiders ? adminApiService.getApplications({ ...params, type: 'rider' }) : Promise.resolve({ items: [], meta: {} }),
        ]);

        if (!active) return;
        setRestaurantApps((restRes.items || []).map((item) => mapListItem(item, 'restaurant')));
        setRiderApps((riderRes.items || []).map((item) => mapListItem(item, 'rider')));
        setRestaurantMeta(restRes.meta || { current_page: 1, last_page: 1, total: 0 });
        setRiderMeta(riderRes.meta || { current_page: 1, last_page: 1, total: 0 });
      } catch (err) {
        if (active) setError(err?.message || 'Failed to load applications from server.');
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [statusFilter, dateRange, globalQuery, page, revision, canViewRestaurants, canViewRiders]);

  async function openApplicationDetail(kind, item) {
    try {
      const detail = await adminApiService.getApplicationDetail(kind, item.id);
      setSelectedApp({ kind, item: detail });
    } catch (err) {
      showAdminToast(err?.message || 'Unable to load application details.', 'danger');
    }
  }

  const pendingRestaurantCount = useMemo(
    () => restaurantApps.filter((item) => ['submitted', 'pending_review', 'under_review', 'needs_correction', 'additional_documents_required', 'resubmitted'].includes(item.application_status)).length,
    [restaurantApps],
  );
  const pendingRiderCount = useMemo(
    () => riderApps.filter((item) => ['submitted', 'pending_review', 'under_review', 'needs_correction', 'additional_documents_required', 'resubmitted'].includes(item.application_status)).length,
    [riderApps],
  );

  function switchType(type) {
    setSearchParams({ type }, { replace: true });
    setSelectedApp(null);
    setPage(1);
  }

  const restaurantColumns = [
    { key: 'applicationId', title: 'Application ID' },
    { key: 'name', title: 'Restaurant name' },
    { key: 'ownerName', title: 'Owner' },
    { key: 'zone', title: 'City / zone' },
    {
      key: 'joinedDate',
      title: 'Submitted',
      sortValue: (item) => new Date(item.joinedDate).getTime(),
      render: (item) => formatDate(item.joinedDate),
    },
    {
      key: 'verifiedDocsCount',
      title: 'Documents',
      render: (item) => `${item.verifiedDocsCount}/${item.totalDocsCount} verified`,
    },
    {
      key: 'reviewStatus',
      title: 'Status',
      render: (item) => <StatusBadge status={item.reviewStatus} />,
    },
    {
      key: 'actions',
      title: 'Actions',
      orderable: false,
      searchable: false,
      render: (item) => (
        <button
          type="button"
          className="admin-action-button"
          onClick={(event) => {
            event.stopPropagation();
            openApplicationDetail('restaurant', item);
          }}
        >
          Review
        </button>
      ),
    },
  ];

  const riderColumns = [
    { key: 'applicationId', title: 'Application ID' },
    { key: 'name', title: 'Applicant name' },
    { key: 'zone', title: 'City / zone' },
    { key: 'vehicle', title: 'Vehicle type' },
    {
      key: 'joinedDate',
      title: 'Submitted',
      sortValue: (item) => new Date(item.joinedDate).getTime(),
      render: (item) => formatDate(item.joinedDate),
    },
    {
      key: 'verifiedDocsCount',
      title: 'Documents',
      render: (item) => `${item.verifiedDocsCount}/${item.totalDocsCount} verified`,
    },
    {
      key: 'reviewStatus',
      title: 'Status',
      render: (item) => <StatusBadge status={item.reviewStatus} />,
    },
    {
      key: 'actions',
      title: 'Actions',
      orderable: false,
      searchable: false,
      render: (item) => (
        <button
          type="button"
          className="admin-action-button"
          onClick={(event) => {
            event.stopPropagation();
            openApplicationDetail('rider', item);
          }}
        >
          Review
        </button>
      ),
    },
  ];

  return (
    <AdminLayout>
      <section className="admin-shell-page">
        <PageHeader
          title="Applications"
          description="Review and verify restaurant and rider onboarding submissions."
          actions={(
            <div className="admin-segmented-tabs" role="tablist" aria-label="Application type">
              {canViewRestaurants && (
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeType === 'restaurant'}
                  className={`admin-segmented-tab ${activeType === 'restaurant' ? 'is-active' : ''}`}
                  onClick={() => switchType('restaurant')}
                >
                  <span>Restaurant Applications</span>
                  <span className="admin-segmented-tab__badge">{pendingRestaurantCount}</span>
                </button>
              )}
              {canViewRiders && (
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeType === 'rider'}
                  className={`admin-segmented-tab ${activeType === 'rider' ? 'is-active' : ''}`}
                  onClick={() => switchType('rider')}
                >
                  <span>Rider Applications</span>
                  <span className="admin-segmented-tab__badge">{pendingRiderCount}</span>
                </button>
              )}
            </div>
          )}
        />

        <div className="admin-status-chips" role="group" aria-label="Filter applications by status">
          {STATUS_CHIPS.map((chip) => (
            <button
              key={chip.value}
              type="button"
              className={`admin-status-chip ${statusFilter === chip.value ? 'is-active' : ''}`}
              aria-pressed={statusFilter === chip.value}
              onClick={() => {
                setStatusFilter(chip.value);
                setPage(1);
              }}
            >
              {chip.label}
            </button>
          ))}
          <label className="admin-filter-control" style={{ marginLeft: 'auto' }}>
            <span className="sr-only">Submitted date range</span>
            <select value={dateRange} onChange={(event) => setDateRange(event.target.value)} aria-label="Submitted date range">
              <option value="all">All dates</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
            </select>
          </label>
        </div>

        {error && <p role="alert" style={{ color: '#b91c1c', marginBottom: 12 }}>{error}</p>}
        {loading && <p className="admin-muted" style={{ marginBottom: 12 }}>Loading applications...</p>}

        {activeType === 'restaurant' ? (
          <DataTable
            columns={restaurantColumns}
            data={restaurantApps}
            tableSearch={globalQuery}
            defaultOrder={[[4, 'desc']]}
            onRowClick={(item) => openApplicationDetail('restaurant', item)}
            emptyTitle="No restaurant applications"
            emptyDescription="No restaurant applications match the current filter."
          />
        ) : (
          <DataTable
            columns={riderColumns}
            data={riderApps}
            tableSearch={globalQuery}
            defaultOrder={[[4, 'desc']]}
            onRowClick={(item) => openApplicationDetail('rider', item)}
            emptyTitle="No rider applications"
            emptyDescription="No rider applications match the current filter."
          />
        )}

        {((activeType === 'restaurant' ? restaurantMeta : riderMeta).last_page > 1) && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
            <span className="admin-muted">
              Page {(activeType === 'restaurant' ? restaurantMeta : riderMeta).current_page} of {(activeType === 'restaurant' ? restaurantMeta : riderMeta).last_page}
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                className="admin-action-button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </button>
              <button
                type="button"
                className="admin-action-button"
                disabled={page >= ((activeType === 'restaurant' ? restaurantMeta : riderMeta).last_page || 1)}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </div>
        )}

        <ApplicationReviewModal
          open={Boolean(selectedApp)}
          kind={selectedApp?.kind || activeType}
          application={selectedApp?.item}
          canApprove={selectedApp?.kind === 'rider' ? canApproveRider : canApproveRestaurant}
          onClose={() => setSelectedApp(null)}
          onUpdated={() => setRevision((value) => value + 1)}
        />
      </section>
    </AdminLayout>
  );
}
