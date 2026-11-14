import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import AdminLayout from '../../../layouts/AdminLayout';
import { DataTable, PageHeader, StatusBadge } from '../components';
import ApplicationReviewModal from '../components/ApplicationReviewModal';
import { hasAdminPermission } from '../constants';
import { useAdminPageSearch } from '../contexts/useAdminSearch';
import useAdminSession from '../contexts/useAdminSession';
import { getRestaurantApplications, getRiderApplications } from '../mocks';
import { formatDate } from '../utils/format';
import './AdminPages.css';

const STATUS_CHIPS = ['All', 'Pending', 'Under Review', 'Needs Revision', 'Approved', 'Rejected'];

function matchesDateRange(dateStr, range) {
  if (range === 'all' || !dateStr) return true;
  const target = new Date(`${dateStr}T00:00:00`).getTime();
  const now = Date.now();
  const days = range === '7d' ? 7 : 30;
  return now - target <= days * 24 * 60 * 60 * 1000;
}

export default function AdminApplicationsPage() {
  const { currentAdmin } = useAdminSession();
  const [searchParams, setSearchParams] = useSearchParams();
  const [statusFilter, setStatusFilter] = useState('All');
  const [dateRange, setDateRange] = useState('all');
  const [revision, setRevision] = useState(0);
  const [selectedApp, setSelectedApp] = useState(null);

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

  const restaurantApps = useMemo(() => {
    void revision;
    return getRestaurantApplications();
  }, [revision]);

  const riderApps = useMemo(() => {
    void revision;
    return getRiderApplications();
  }, [revision]);

  const pendingRestaurantCount = restaurantApps.filter((item) =>
    ['Pending', 'Under Review', 'Needs Revision'].includes(item.reviewStatus),
  ).length;
  const pendingRiderCount = riderApps.filter((item) =>
    ['Pending', 'Under Review', 'Needs Revision'].includes(item.reviewStatus),
  ).length;

  const filteredRestaurants = useMemo(
    () =>
      restaurantApps.filter((item) => {
        if (statusFilter !== 'All' && item.reviewStatus !== statusFilter) return false;
        if (!matchesDateRange(item.joinedDate, dateRange)) return false;
        return true;
      }),
    [restaurantApps, statusFilter, dateRange],
  );

  const filteredRiders = useMemo(
    () =>
      riderApps.filter((item) => {
        if (statusFilter !== 'All' && item.reviewStatus !== statusFilter) return false;
        if (!matchesDateRange(item.joinedDate, dateRange)) return false;
        return true;
      }),
    [riderApps, statusFilter, dateRange],
  );

  function switchType(type) {
    setSearchParams({ type }, { replace: true });
    setSelectedApp(null);
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
            setSelectedApp({ kind: 'restaurant', item });
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
            setSelectedApp({ kind: 'rider', item });
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
          {STATUS_CHIPS.map((status) => (
            <button
              key={status}
              type="button"
              className={`admin-status-chip ${statusFilter === status ? 'is-active' : ''}`}
              aria-pressed={statusFilter === status}
              onClick={() => setStatusFilter(status)}
            >
              {status}
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

        {activeType === 'restaurant' ? (
          <DataTable
            columns={restaurantColumns}
            data={filteredRestaurants}
            tableSearch={globalQuery}
            defaultOrder={[[4, 'desc']]}
            onRowClick={(item) => setSelectedApp({ kind: 'restaurant', item })}
            emptyTitle="No restaurant applications"
            emptyDescription="No restaurant applications match the current filter."
          />
        ) : (
          <DataTable
            columns={riderColumns}
            data={filteredRiders}
            tableSearch={globalQuery}
            defaultOrder={[[4, 'desc']]}
            onRowClick={(item) => setSelectedApp({ kind: 'rider', item })}
            emptyTitle="No rider applications"
            emptyDescription="No rider applications match the current filter."
          />
        )}

        <ApplicationReviewModal
          open={Boolean(selectedApp)}
          kind={selectedApp?.kind || activeType}
          application={selectedApp?.item}
          canApprove={selectedApp?.kind === 'rider' ? canApproveRider : canApproveRestaurant}
          currentAdmin={currentAdmin}
          onClose={() => setSelectedApp(null)}
          onUpdated={() => setRevision((value) => value + 1)}
        />
      </section>
    </AdminLayout>
  );
}
