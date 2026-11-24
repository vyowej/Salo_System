import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import AdminLayout from '../../../layouts/AdminLayout';
import { PageHeader, showAdminToast } from '../components';
import AdminChangeRequestsPanel from '../components/AdminChangeRequestsPanel';
import { ApplicationReviewDrawer, StatusChip } from '../components/applications';
import {
  APPLICATION_FILTER_TABS,
  countApplicationsByFilter,
  formatShortSubmittedDate,
  isNeedsActionStatus,
  matchesApplicationFilter,
} from '../constants/applicationDocuments';
import { hasAdminPermission } from '../constants';
import { useAdminPageSearch } from '../contexts/useAdminSearch';
import useAdminSession from '../contexts/useAdminSession';
import adminApiService from '../../../services/adminApiService';
import { mapBackendApplicationStatus } from '../../../services/applicationService';
import './AdminPages.css';
import '../components/applications/AdminApplications.css';

function mapListItem(item, kind) {
  return {
    ...item,
    kind,
    applicationId: item.reference_number,
    ownerName: item.owner_name || item.name,
    vehicle: item.vehicle_type ? item.vehicle_type.replace(/_/g, ' ') : '',
    joinedDate: item.submitted_at ? String(item.submitted_at) : '',
    verifiedDocsCount: Number(item.verified_docs_count ?? 0),
    totalDocsCount: Number(item.total_docs_count ?? 0),
    reviewStatus: mapBackendApplicationStatus(item.application_status) || item.application_status,
  };
}

function getEmptyMessage(statusFilter, searchQuery) {
  if (searchQuery) {
    return 'No applications match your search.';
  }
  switch (statusFilter) {
    case 'needs_action':
      return 'Nothing needs your review right now.';
    case 'waiting':
      return 'No applications are waiting for an applicant.';
    case 'approved':
      return 'No approved applications yet.';
    case 'rejected':
      return 'No rejected applications.';
    case 'all':
    default:
      return 'No applications found.';
  }
}

async function fetchAllApplicationsByType(type) {
  const first = await adminApiService.getApplications({
    type,
    status: 'all',
    per_page: 100,
    page: 1,
  });
  const items = [...(first?.items || [])];
  const lastPage = Number(first?.meta?.last_page || 1);
  if (lastPage > 1) {
    const rest = await Promise.all(
      Array.from({ length: lastPage - 1 }, (_, idx) =>
        adminApiService.getApplications({
          type,
          status: 'all',
          per_page: 100,
          page: idx + 2,
        }),
      ),
    );
    for (const res of rest) {
      if (Array.isArray(res?.items)) {
        items.push(...res.items);
      }
    }
  }
  return items;
}

export default function AdminApplicationsPage() {
  const { currentAdmin } = useAdminSession();
  const [searchParams, setSearchParams] = useSearchParams();
  const [statusFilter, setStatusFilter] = useState('needs_action');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [revision, setRevision] = useState(0);
  const [selectedApp, setSelectedApp] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [restaurantApps, setRestaurantApps] = useState([]);
  const [riderApps, setRiderApps] = useState([]);
  const loadedTabsRef = useRef({ restaurant: false, rider: false });

  const canViewRestaurants = hasAdminPermission(currentAdmin.role, 'restaurants', 'view')
    || hasAdminPermission(currentAdmin.role, 'applications', 'view');
  const canViewRiders = hasAdminPermission(currentAdmin.role, 'riders', 'view')
    || hasAdminPermission(currentAdmin.role, 'applications', 'view');
  const canApproveRestaurant = hasAdminPermission(currentAdmin.role, 'restaurants', 'approve')
    || hasAdminPermission(currentAdmin.role, 'applications', 'approve');
  const canApproveRider = hasAdminPermission(currentAdmin.role, 'riders', 'approve')
    || hasAdminPermission(currentAdmin.role, 'applications', 'approve');

  const rawType = searchParams.get('type');
  const activeType = rawType === 'changes'
    ? 'changes'
    : rawType === 'rider' && canViewRiders
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
        const shouldFetchRestaurant = Boolean(
          canViewRestaurants && (activeType === 'restaurant' || !loadedTabsRef.current.restaurant),
        );
        const shouldFetchRider = Boolean(
          canViewRiders && (activeType === 'rider' || !loadedTabsRef.current.rider),
        );

        const [restItems, riderItems] = await Promise.all([
          shouldFetchRestaurant ? fetchAllApplicationsByType('restaurant') : Promise.resolve(null),
          shouldFetchRider ? fetchAllApplicationsByType('rider') : Promise.resolve(null),
        ]);

        if (!active) return;
        if (restItems) {
          loadedTabsRef.current.restaurant = true;
          setRestaurantApps(restItems.map((item) => mapListItem(item, 'restaurant')));
        }
        if (riderItems) {
          loadedTabsRef.current.rider = true;
          setRiderApps(riderItems.map((item) => mapListItem(item, 'rider')));
        }
      } catch (err) {
        if (active) setError(err?.message || 'Failed to load applications from server.');
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [activeType, revision, canViewRestaurants, canViewRiders]);

  async function openApplicationDetail(kind, item) {
    try {
      const detail = await adminApiService.getApplicationDetail(kind, item.id);
      setSelectedApp({ kind, item: detail });
    } catch (err) {
      showAdminToast(err?.message || 'Unable to load application details.', 'danger');
    }
  }

  const needsActionRestaurantCount = useMemo(
    () => restaurantApps.filter((item) => isNeedsActionStatus(item.application_status)).length,
    [restaurantApps],
  );
  const needsActionRiderCount = useMemo(
    () => riderApps.filter((item) => isNeedsActionStatus(item.application_status)).length,
    [riderApps],
  );

  const activeItems = activeType === 'rider' ? riderApps : restaurantApps;

  const searchedItems = useMemo(() => {
    const q = String(globalQuery || '').trim().toLowerCase();
    const sorted = [...activeItems].sort((a, b) => {
      const timeA = a.joinedDate ? new Date(a.joinedDate).getTime() : 0;
      const timeB = b.joinedDate ? new Date(b.joinedDate).getTime() : 0;
      return timeB - timeA;
    });

    if (!q) return sorted;
    return sorted.filter((item) => (
      [
        item.applicationId,
        item.name,
        item.ownerName,
        item.zone,
        item.vehicle,
        item.email,
        item.reviewStatus,
      ]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(q))
    ));
  }, [activeItems, globalQuery]);

  const filterCounts = useMemo(
    () => countApplicationsByFilter(searchedItems),
    [searchedItems],
  );

  const filteredItems = useMemo(
    () => searchedItems.filter((item) => matchesApplicationFilter(item.application_status, statusFilter)),
    [searchedItems, statusFilter],
  );

  const totalItems = filteredItems.length;
  const lastPage = Math.max(1, Math.ceil(totalItems / perPage));
  const currentPage = Math.min(page, lastPage);
  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * perPage;
    return filteredItems.slice(start, start + perPage);
  }, [filteredItems, currentPage, perPage]);

  useEffect(() => {
    setPage(1);
  }, [globalQuery, statusFilter, perPage, activeType]);

  function switchType(type) {
    setSearchParams({ type }, { replace: true });
    setSelectedApp(null);
    setPage(1);
  }

  function renderDocsProgress(item) {
    const total = item.totalDocsCount;
    const verified = item.verifiedDocsCount;
    const pct = total > 0 ? Math.min(100, Math.round((verified / total) * 100)) : 0;
    const isComplete = total > 0 && verified >= total;
    return (
      <div className="admin-app-docs-progress">
        <span className="admin-app-docs-progress__text">
          {verified}/{total}
        </span>
        <div className="admin-app-docs-progress__track" aria-hidden="true">
          <div
            className={`admin-app-docs-progress__fill ${isComplete ? 'is-complete' : ''}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    );
  }

  function renderActionButton(item) {
    const needsAction = isNeedsActionStatus(item.application_status);
    return (
      <button
        type="button"
        className={`admin-app-row-btn ${needsAction ? 'admin-app-row-btn--primary' : 'admin-app-row-btn--secondary'}`}
        onClick={(event) => {
          event.stopPropagation();
          openApplicationDetail(item.kind, item);
        }}
      >
        {needsAction ? 'Review' : 'View'}
      </button>
    );
  }

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
                  {needsActionRestaurantCount > 0 && (
                    <span className="admin-segmented-tab__badge">{needsActionRestaurantCount}</span>
                  )}
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
                  {needsActionRiderCount > 0 && (
                    <span className="admin-segmented-tab__badge">{needsActionRiderCount}</span>
                  )}
                </button>
              )}
              <button
                type="button"
                role="tab"
                aria-selected={activeType === 'changes'}
                className={`admin-segmented-tab ${activeType === 'changes' ? 'is-active' : ''}`}
                onClick={() => switchType('changes')}
              >
                <span>Settings &amp; Account Requests</span>
              </button>
            </div>
          )}
        />

        {activeType === 'changes' ? (
          <AdminChangeRequestsPanel canApprove={canApproveRestaurant || canApproveRider} />
        ) : (
          <>
            <div className="admin-app-filters" role="group" aria-label="Filter applications by status">
              {APPLICATION_FILTER_TABS.map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  className={`admin-app-filter-btn ${statusFilter === tab.value ? 'is-active' : ''}`}
                  aria-pressed={statusFilter === tab.value}
                  onClick={() => setStatusFilter(tab.value)}
                >
                  <span>{tab.label}</span>
                  <span className="admin-app-filter-btn__count">{filterCounts[tab.value] ?? 0}</span>
                </button>
              ))}
            </div>

            {error && (
              <div className="admin-app-drawer__error" role="alert">
                {error}
              </div>
            )}

            {loading ? (
              <div className="admin-app-empty" role="status">
                <p>Loading applications...</p>
              </div>
            ) : paginatedItems.length === 0 ? (
              <div className="admin-app-empty" role="status">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
                  <path d="M9 12l2 2 4-4" />
                  <circle cx="12" cy="12" r="9" />
                </svg>
                <p>{getEmptyMessage(statusFilter, globalQuery)}</p>
              </div>
            ) : (
              <div className="admin-app-table-card">
                <div className="admin-app-table-wrap">
                  <table className="admin-app-table">
                    <thead>
                      <tr>
                        <th scope="col">{activeType === 'restaurant' ? 'Restaurant' : 'Applicant'}</th>
                        <th scope="col">City</th>
                        <th scope="col">Submitted</th>
                        <th scope="col">Documents</th>
                        <th scope="col">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedItems.map((item) => (
                        <tr
                          key={`${item.kind}-${item.id}`}
                          className="admin-app-table__row"
                          tabIndex={0}
                          onClick={() => openApplicationDetail(item.kind, item)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              openApplicationDetail(item.kind, item);
                            }
                          }}
                        >
                          <td>
                            <div className="admin-app-name-cell">
                              <span className="admin-app-name-cell__primary">{item.name}</span>
                              <span className="admin-app-name-cell__secondary">
                                {item.kind === 'restaurant'
                                  ? item.ownerName
                                  : (item.vehicle || item.email || '—')}
                              </span>
                            </div>
                          </td>
                          <td>{item.zone || '—'}</td>
                          <td>{formatShortSubmittedDate(item.joinedDate)}</td>
                          <td>{renderDocsProgress(item)}</td>
                          <td>
                            <div className="admin-app-status-actions">
                              <StatusChip status={item.application_status} label={item.reviewStatus} />
                              {renderActionButton(item)}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="admin-app-mobile-list">
                  {paginatedItems.map((item) => (
                    <article
                      key={`${item.kind}-${item.id}-mobile`}
                      className="admin-app-mobile-card"
                      onClick={() => openApplicationDetail(item.kind, item)}
                    >
                      <div className="admin-app-mobile-card__top">
                        <div className="admin-app-name-cell">
                          <span className="admin-app-name-cell__primary">{item.name}</span>
                          <span className="admin-app-name-cell__secondary">
                            {item.kind === 'restaurant'
                              ? item.ownerName
                              : (item.vehicle || item.email || '—')}
                          </span>
                        </div>
                        <StatusChip status={item.application_status} label={item.reviewStatus} />
                      </div>
                      <div className="admin-app-mobile-card__meta">
                        <span>{item.zone || '—'}</span>
                        <span>{formatShortSubmittedDate(item.joinedDate)}</span>
                      </div>
                      <div className="admin-app-mobile-card__footer">
                        {renderDocsProgress(item)}
                        {renderActionButton(item)}
                      </div>
                    </article>
                  ))}
                </div>

                <footer className="admin-app-table-footer">
                  <div className="admin-app-table-footer__meta">
                    <span>
                      Showing {(currentPage - 1) * perPage + 1}–{Math.min(currentPage * perPage, totalItems)} of {totalItems}
                    </span>
                    <label className="admin-app-per-page">
                      <span>Per page</span>
                      <select
                        value={perPage}
                        onChange={(event) => setPerPage(Number(event.target.value))}
                        aria-label="Rows per page"
                      >
                        <option value={10}>10</option>
                        <option value={25}>25</option>
                        <option value={50}>50</option>
                      </select>
                    </label>
                  </div>

                  {lastPage > 1 && (
                    <div className="admin-app-pagination">
                      <button
                        type="button"
                        className="admin-app-page-btn"
                        disabled={currentPage <= 1}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                      >
                        Previous
                      </button>
                      <span className="admin-app-per-page">
                        Page {currentPage} of {lastPage}
                      </span>
                      <button
                        type="button"
                        className="admin-app-page-btn"
                        disabled={currentPage >= lastPage}
                        onClick={() => setPage((p) => Math.min(lastPage, p + 1))}
                      >
                        Next
                      </button>
                    </div>
                  )}
                </footer>
              </div>
            )}

            <ApplicationReviewDrawer
              open={Boolean(selectedApp)}
              kind={selectedApp?.kind || activeType}
              application={selectedApp?.item}
              canApprove={selectedApp?.kind === 'rider' ? canApproveRider : canApproveRestaurant}
              onClose={() => setSelectedApp(null)}
              onUpdated={(updatedApp) => {
                if (updatedApp) {
                  setSelectedApp((prev) => (prev ? { ...prev, item: updatedApp } : null));
                }
                setRevision((value) => value + 1);
              }}
            />
          </>
        )}
      </section>
    </AdminLayout>
  );
}
