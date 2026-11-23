import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import AdminLayout from '../../../layouts/AdminLayout';
import Button from '../../../components/common/Button';
import adminApiService from '../../../services/adminApiService';
import {
  DataTable,
  DetailDrawer,
  PageHeader,
  StatCard,
  StateView,
  StatusBadge,
  Timeline,
  showAdminToast,
} from '../components';
import { useAdminPageSearch } from '../contexts/useAdminSearch';
import { formatDateTime, formatPeso } from '../utils/format';
import {
  DEPOSIT_STATUS_OPTIONS,
  RESERVATION_ATTENTION_OPTIONS,
  RESERVATION_GROUP_OPTIONS,
  RESERVATION_STATUS_OPTIONS,
  buildAdminReservationsQuery,
  formatAttentionLabel,
  getAttentionTone,
  validateDateRange,
} from '../utils/adminReservationsHelpers';
import './AdminPages.css';
import './AdminReservationsPage.css';

export default function AdminReservationsPage() {
  const { id: routeReservationId } = useParams();
  const navigate = useNavigate();

  const { query: globalQuery } = useAdminPageSearch({
    scopeLabel: 'Reservations',
    placeholder: 'Search by reference, customer, guest, or restaurant',
  });

  const [reservations, setReservations] = useState([]);
  const [meta, setMeta] = useState({ current_page: 1, last_page: 1, per_page: 15, total: 0 });
  const [summary, setSummary] = useState(null);
  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [group, setGroup] = useState('all');
  const [attention, setAttention] = useState('all');
  const [depositStatus, setDepositStatus] = useState('all');
  const [needsReview, setNeedsReview] = useState(false);
  const [restaurantId, setRestaurantId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [direction, setDirection] = useState('desc');
  const [perPage, setPerPage] = useState(15);
  const [page, setPage] = useState(1);

  const [selectedDetail, setSelectedDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [detailNotFound, setDetailNotFound] = useState(false);
  const [reviewNote, setReviewNote] = useState('');
  const [resolvingReview, setResolvingReview] = useState(false);
  const [reviewError, setReviewError] = useState('');

  const listSeqRef = useRef(0);
  const statsSeqRef = useRef(0);
  const detailSeqRef = useRef(0);

  const effectiveSearch = (globalQuery || search).trim();
  const dateRangeError = validateDateRange(dateFrom, dateTo);
  const hasActiveFilters = Boolean(
    effectiveSearch ||
      status !== 'all' ||
      group !== 'all' ||
      attention !== 'all' ||
      depositStatus !== 'all' ||
      restaurantId ||
      dateFrom ||
      dateTo,
  );

  const loadReservations = useCallback(async () => {
    if (dateRangeError) {
      setError(dateRangeError);
      setLoading(false);
      return;
    }

    const seq = ++listSeqRef.current;
    setLoading(true);
    setError('');

    try {
      const params = buildAdminReservationsQuery({
        search: effectiveSearch,
        status,
        group,
        attention,
        depositStatus,
        restaurantId,
        dateFrom,
        dateTo,
        page,
        perPage,
        direction,
      });
      if (needsReview) {
        params.needs_review = 1;
      }

      const data = await adminApiService.getReservations(params);
      if (seq !== listSeqRef.current) return;

      const items = Array.isArray(data?.items) ? data.items : [];
      setReservations(items);
      setMeta(
        data?.meta || {
          current_page: page,
          last_page: 1,
          per_page: perPage,
          total: items.length,
        },
      );
      setSummary(data?.summary || null);
    } catch (err) {
      if (seq !== listSeqRef.current) return;
      setError(err?.message || 'Unable to load platform reservations.');
    } finally {
      if (seq === listSeqRef.current) {
        setLoading(false);
      }
    }
  }, [attention, dateFrom, dateRangeError, dateTo, depositStatus, direction, effectiveSearch, group, needsReview, page, perPage, restaurantId, status]);

  const loadStats = useCallback(async () => {
    if (dateRangeError) return;

    const seq = ++statsSeqRef.current;
    setStatsLoading(true);
    try {
      const params = {};
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      if (restaurantId) params.restaurant_id = restaurantId;
      const data = await adminApiService.getReservationStats(params);
      if (seq !== statsSeqRef.current) return;
      setStats(data);
    } catch {
      if (seq !== statsSeqRef.current) return;
    } finally {
      if (seq === statsSeqRef.current) {
        setStatsLoading(false);
      }
    }
  }, [dateFrom, dateRangeError, dateTo, restaurantId]);

  useEffect(() => {
    loadReservations();
  }, [loadReservations]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const loadDetailById = useCallback(async (reservationId) => {
    const cleanId = String(reservationId || '').trim();
    if (!/^\d+$/.test(cleanId) || Number(cleanId) <= 0) {
      setSelectedDetail(null);
      setDetailNotFound(true);
      setDetailError('');
      setDetailLoading(false);
      return;
    }

    const seq = ++detailSeqRef.current;
    setDetailLoading(true);
    setDetailError('');
    setDetailNotFound(false);

    try {
      const detail = await adminApiService.getReservationDetail(cleanId);
      if (seq !== detailSeqRef.current) return;
      if (!detail) {
        setSelectedDetail(null);
        setDetailNotFound(true);
      } else {
        setSelectedDetail(detail);
      }
    } catch (err) {
      if (seq !== detailSeqRef.current) return;
      setSelectedDetail(null);
      if (err?.status === 404) {
        setDetailNotFound(true);
        showAdminToast('Reservation not found.', 'error');
      } else {
        setDetailError(err?.message || 'Unable to load reservation details.');
      }
    } finally {
      if (seq === detailSeqRef.current) {
        setDetailLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (routeReservationId) {
      loadDetailById(routeReservationId);
    } else {
      setSelectedDetail(null);
      setDetailNotFound(false);
      setDetailError('');
      setDetailLoading(false);
    }
  }, [routeReservationId, loadDetailById]);

  const openDetail = (reservation) => {
    navigate(`/admin/reservations/${reservation.reservation_id}`);
  };

  const closeDetail = () => {
    navigate('/admin/reservations');
  };

  const clearFilters = () => {
    setSearch('');
    setStatus('all');
    setGroup('all');
    setAttention('all');
    setDepositStatus('all');
    setRestaurantId('');
    setDateFrom('');
    setDateTo('');
    setDirection('desc');
    setPage(1);
  };

  const handleRefresh = () => {
    loadReservations();
    loadStats();
    if (routeReservationId) {
      loadDetailById(routeReservationId);
    }
  };

  const columns = [
    {
      key: 'reservation_reference',
      label: 'Reference',
      render: (row) => (
        <button
          type="button"
          className="admin-text-link"
          onClick={() => openDetail(row)}
        >
          <strong>{row.reservation_reference}</strong>
          <span>#{row.reservation_id}</span>
        </button>
      ),
    },
    {
      key: 'restaurant_name',
      label: 'Restaurant',
      render: (row) => (
        <div>
          <strong>{row.restaurant_name}</strong>
          {row.table?.table_name && (
            <div className="admin-muted">{row.table.table_name}</div>
          )}
        </div>
      ),
    },
    {
      key: 'customer_name',
      label: 'Guest',
      render: (row) => (
        <div>
          <span>{row.contact_name || row.customer_name}</span>
          {row.contact_phone && (
            <div className="admin-muted">{row.contact_phone}</div>
          )}
        </div>
      ),
    },
    {
      key: 'reservation_start',
      label: 'Schedule',
      render: (row) => (
        <div>
          <span>{row.reservation_start ? formatDateTime(row.reservation_start) : '—'}</span>
          <div className="admin-muted">{row.party_size} guest{row.party_size === 1 ? '' : 's'}</div>
        </div>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (row) => (
        <div style={{ display: 'grid', gap: 4 }}>
          <StatusBadge status={row.status_label || row.status} />
          {row.attention && (
            <span className={`admin-attention-pill admin-attention-pill--${getAttentionTone(row.attention)}`}>
              {formatAttentionLabel(row.attention)}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'deposit_amount',
      label: 'Fees / Deposit',
      render: (row) => (
        <div>
          <span>{row.deposit_amount > 0 ? formatPeso(row.deposit_amount) : 'No deposit'}</span>
          <div className="admin-muted">
            {row.deposit_amount > 0 ? String(row.deposit_display_status || row.deposit_status).replace('_', ' ') : `Fee: ${formatPeso(row.service_fee)}`}
          </div>
        </div>
      ),
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (row) => (
        <button
          type="button"
          className="admin-action-button"
          onClick={() => openDetail(row)}
        >
          Inspect
        </button>
      ),
    },
  ];

  const hasRangeVolume = (stats?.totals?.total ?? 0) > 0;
  const maxDailyTotal = Math.max(
    1,
    ...(stats?.by_day || []).map((day) => Number(day.total || 0)),
  );
  const maxHourTotal = Math.max(
    1,
    ...(stats?.by_hour || []).map((hr) => Number(hr.total || 0)),
  );

  return (
    <AdminLayout>
      <section className="admin-shell-page">
        <PageHeader
          title="Reservations"
          description="Monitor platform-wide table reservations, live operational flags, and restaurant booking health."
          actions={(
            <Button variant="secondary" size="sm" onClick={handleRefresh} disabled={loading}>
              {loading && reservations.length > 0 ? 'Refreshing...' : 'Refresh'}
            </Button>
          )}
        />

        {stats && (
          <>
            <div className="admin-stat-grid" style={{ marginBottom: 'var(--space-4)' }}>
              <StatCard
                label="Reservations (range)"
                value={stats.totals.total}
                hint={`${stats.totals.covers_total} covers · avg ${stats.totals.average_party_size} guests · ${stats.date_from} to ${stats.date_to}`}
              />
              <StatCard
                label="Active upcoming"
                value={stats.active_upcoming}
                hint={`Confirmation rate: ${stats.rates.confirmation_rate}%`}
              />
              <StatCard
                label="No-show / Cancellation"
                value={`${stats.rates.no_show_rate}% / ${stats.rates.cancellation_rate}%`}
                hint={`Completion rate: ${stats.rates.completion_rate}%`}
              />
              <StatCard
                label="Needs attention (now)"
                value={stats.attention_count}
                danger={stats.attention_counts.no_show_candidate + stats.attention_counts.overdue_seated > 0}
                warning={stats.attention_counts.pending_expiring > 0}
                hint={`${stats.attention_counts.pending_expiring} expiring · ${stats.attention_counts.no_show_candidate} no-show · ${stats.attention_counts.overdue_seated} overdue`}
              />
              <StatCard
                label="Deposits paid / Fees"
                value={formatPeso(stats.deposits.total_deposit_amount_paid)}
                hint={`${stats.deposits.paid_count}/${stats.deposits.required_count} paid · ${formatPeso(stats.service_fee_total)} completed fees`}
              />
            </div>

            <div className="admin-reservations-panels">
              <div className="admin-reservations-chart-card">
                <div className="admin-reservations-chart-header">
                  <h3>Daily reservation volume</h3>
                  <span className="admin-muted">
                    {statsLoading ? 'Updating...' : `${stats.by_day.length} day${stats.by_day.length === 1 ? '' : 's'} in range`}
                  </span>
                </div>
                {!hasRangeVolume ? (
                  <p className="admin-muted">No reservations recorded in this date range.</p>
                ) : (
                  <div className="admin-reservations-bars" role="img" aria-label="Daily reservation volume chart">
                    {stats.by_day.slice(-14).map((day) => {
                      const heightPct = day.total > 0
                        ? Math.max(8, Math.round((Number(day.total || 0) / maxDailyTotal) * 100))
                        : 2;
                      return (
                        <div
                          key={day.date}
                          className="admin-reservations-bar-col"
                          title={`${day.date}: ${day.total} total (${day.completed} completed, ${day.cancelled_or_missed} cancelled/missed, ${day.covers} covers)`}
                        >
                          <div
                            className="admin-reservations-bar"
                            style={{ height: `${heightPct}%`, opacity: day.total > 0 ? 1 : 0.2 }}
                          />
                          <span className="admin-reservations-bar-label">{day.date.slice(5)}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="admin-reservations-chart-card">
                <div className="admin-reservations-chart-header">
                  <h3>Peak start hours (Manila)</h3>
                  <span className="admin-muted">00:00 – 23:00</span>
                </div>
                {!hasRangeVolume ? (
                  <p className="admin-muted">No hourly booking distribution in this date range.</p>
                ) : (
                  <div className="admin-reservations-bars" role="img" aria-label="Peak reservation start hours chart">
                    {stats.by_hour.map((hr) => {
                      const heightPct = hr.total > 0
                        ? Math.max(8, Math.round((Number(hr.total || 0) / maxHourTotal) * 100))
                        : 2;
                      return (
                        <div
                          key={hr.hour}
                          className="admin-reservations-bar-col"
                          title={`${hr.label}: ${hr.total} reservation${hr.total === 1 ? '' : 's'}`}
                        >
                          <div
                            className="admin-reservations-bar"
                            style={{ height: `${heightPct}%`, opacity: hr.total > 0 ? 1 : 0.15 }}
                          />
                          <span className="admin-reservations-bar-label">{String(hr.hour).padStart(2, '0')}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="admin-reservations-chart-card">
                <div className="admin-reservations-chart-header">
                  <h3>Top restaurants by volume</h3>
                  {restaurantId && (
                    <button
                      type="button"
                      className="admin-action-button"
                      onClick={() => {
                        setRestaurantId('');
                        setPage(1);
                      }}
                    >
                      Clear restaurant filter
                    </button>
                  )}
                </div>
                {stats.top_restaurants.length === 0 ? (
                  <p className="admin-muted">No restaurant booking activity in this range.</p>
                ) : (
                  <ul className="admin-reservations-top-list">
                    {stats.top_restaurants.map((rest) => (
                      <li key={rest.restaurant_id} className="admin-reservations-top-item">
                        <button
                          type="button"
                          className="admin-text-link"
                          onClick={() => {
                            setRestaurantId(String(rest.restaurant_id));
                            setPage(1);
                          }}
                        >
                          <strong>{rest.name}</strong>
                          <span>{rest.completed} completed · {rest.no_show_rate}% no-show</span>
                        </button>
                        <strong>{rest.total}</strong>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="admin-reservations-status-strip" aria-label="Quick status counts">
              {Object.entries(stats.totals.by_status).map(([key, count]) => (
                <button
                  key={key}
                  type="button"
                  className={`admin-reservations-status-chip${status === key ? ' admin-reservations-status-chip--active' : ''}`}
                  onClick={() => {
                    setStatus((prev) => (prev === key ? 'all' : key));
                    setPage(1);
                  }}
                >
                  <span>{key.replace('_', ' ')}</span>
                  <strong>{count}</strong>
                </button>
              ))}
            </div>
          </>
        )}

        <div className="admin-filter-bar" role="search" aria-label="Filter reservations">
          <label className="admin-filter-control">
            Search
            <input
              type="search"
              aria-label="Search reservations"
              placeholder="Reference, guest, phone, email, restaurant"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          </label>

          <label className="admin-filter-control">
            Group
            <select
              aria-label="Filter by reservation group"
              value={group}
              onChange={(event) => {
                setGroup(event.target.value);
                setPage(1);
              }}
            >
              {RESERVATION_GROUP_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </label>

          <label className="admin-filter-control">
            Status
            <select
              aria-label="Filter by reservation status"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
            >
              {RESERVATION_STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </label>

          <label className="admin-filter-control">
            Attention
            <select
              aria-label="Filter by attention flag"
              value={attention}
              onChange={(event) => {
                setAttention(event.target.value);
                setPage(1);
              }}
            >
              {RESERVATION_ATTENTION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </label>

          <label className="admin-filter-control">
            Deposit
            <select
              aria-label="Filter by deposit status"
              value={depositStatus}
              onChange={(event) => {
                setDepositStatus(event.target.value);
                setPage(1);
              }}
            >
              {DEPOSIT_STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </label>

          <label className="admin-filter-control" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="checkbox"
              checked={needsReview}
              onChange={(event) => {
                setNeedsReview(event.target.checked);
                setPage(1);
              }}
            />
            <span>Needs review only</span>
          </label>

          <label className="admin-filter-control">
            From date
            <input
              type="date"
              aria-label="Filter from date"
              value={dateFrom}
              onChange={(event) => {
                setDateFrom(event.target.value);
                setPage(1);
              }}
            />
          </label>

          <label className="admin-filter-control">
            To date
            <input
              type="date"
              aria-label="Filter to date"
              value={dateTo}
              onChange={(event) => {
                setDateTo(event.target.value);
                setPage(1);
              }}
            />
          </label>

          <label className="admin-filter-control">
            Sort
            <select
              aria-label="Sort direction"
              value={direction}
              onChange={(event) => {
                setDirection(event.target.value);
                setPage(1);
              }}
            >
              <option value="desc">Newest first</option>
              <option value="asc">Oldest first</option>
            </select>
          </label>

          <label className="admin-filter-control">
            Per page
            <select
              aria-label="Reservations per page"
              value={perPage}
              onChange={(event) => {
                setPerPage(Number(event.target.value));
                setPage(1);
              }}
            >
              <option value={15}>15</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
          </label>

          {hasActiveFilters && (
            <button
              type="button"
              className="admin-action-button"
              onClick={clearFilters}
              style={{ alignSelf: 'flex-end' }}
            >
              Clear filters
            </button>
          )}
        </div>

        {summary && (
          <div className="admin-muted" style={{ marginBottom: 10 }}>
            Filtered total: <strong>{summary.total}</strong> reservation{summary.total === 1 ? '' : 's'} ·{' '}
            <strong>{summary.total_guests}</strong> guests · {summary.active_count} active · {summary.pending_count} pending · {summary.completed_count} completed
          </div>
        )}

        {error && reservations.length > 0 && (
          <div role="alert" className="admin-error-banner" style={{ marginBottom: 12 }}>
            {error}
          </div>
        )}

        {loading && reservations.length === 0 ? (
          <StateView state="loading" title="Loading reservations..." description="Fetching platform-wide reservation records." />
        ) : error && reservations.length === 0 ? (
          <StateView
            state="error"
            title="Unable to load reservations"
            description={error}
            action={<Button variant="primary" size="sm" onClick={loadReservations}>Retry</Button>}
          />
        ) : reservations.length === 0 ? (
          <StateView
            state="empty"
            title={hasActiveFilters ? 'No matching reservations found' : 'No reservations yet'}
            description={
              hasActiveFilters
                ? 'Try adjusting your search or filter criteria.'
                : 'Customer table reservations will appear here once booked.'
            }
            action={
              hasActiveFilters ? (
                <Button variant="outline" size="sm" onClick={clearFilters}>Clear filters</Button>
              ) : null
            }
          />
        ) : (
          <>
            <DataTable
              columns={columns}
              rows={reservations}
              emptyTitle="No reservations found"
              emptyDescription="No reservations match your current filters."
            />

            {meta.total > 0 && (
              <div className="admin-filter-bar" style={{ justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                <span className="admin-muted">
                  Page {meta.current_page} of {meta.last_page} · {meta.total} total reservation{meta.total === 1 ? '' : 's'}
                </span>
                <div className="admin-action-row">
                  <button
                    className="admin-action-button"
                    type="button"
                    disabled={loading || meta.current_page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </button>
                  <button
                    className="admin-action-button"
                    type="button"
                    disabled={loading || meta.current_page >= meta.last_page}
                    onClick={() => setPage((p) => Math.min(meta.last_page || 1, p + 1))}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        <DetailDrawer
          open={Boolean(routeReservationId)}
          title={selectedDetail ? `Reservation ${selectedDetail.reservation_reference}` : `Reservation #${routeReservationId || ''}`}
          onClose={closeDetail}
        >
          {detailLoading ? (
            <StateView state="loading" title="Loading reservation details..." />
          ) : detailNotFound ? (
            <StateView
              state="empty"
              title="Reservation not found"
              description="No matching reservation record was found for this ID."
              action={<Button variant="outline" size="sm" onClick={closeDetail}>Back to reservations</Button>}
            />
          ) : detailError ? (
            <StateView
              state="error"
              title="Unable to load reservation"
              description={detailError}
              action={<Button variant="primary" size="sm" onClick={() => loadDetailById(routeReservationId)}>Retry</Button>}
            />
          ) : selectedDetail ? (
            <div className="admin-drawer-content">
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <StatusBadge status={selectedDetail.status_label || selectedDetail.status} />
                {selectedDetail.needs_admin_review && (
                  <span className="admin-attention-pill admin-attention-pill--warning">
                    Needs Admin Review
                  </span>
                )}
                {selectedDetail.attention && (
                  <span className={`admin-attention-pill admin-attention-pill--${getAttentionTone(selectedDetail.attention)}`}>
                    {formatAttentionLabel(selectedDetail.attention)}
                  </span>
                )}
              </div>

              {(selectedDetail.needs_admin_review || selectedDetail.admin_review_resolved) && (
                <div className="admin-record-panel" style={{ borderLeft: '3px solid var(--color-warning, #d97706)', paddingLeft: 12 }}>
                  <h3>{selectedDetail.needs_admin_review ? 'Deposit Review Required' : 'Admin Review Resolved'}</h3>
                  {selectedDetail.admin_review_reason && (
                    <p style={{ margin: '0 0 8px' }}>{selectedDetail.admin_review_reason}</p>
                  )}
                  {selectedDetail.admin_review_resolved ? (
                    <p style={{ margin: 0, fontSize: '0.88rem', opacity: 0.85 }}>
                      Resolved note: {selectedDetail.admin_review_resolved_note || '—'}
                    </p>
                  ) : (
                    <form
                      onSubmit={async (e) => {
                        e.preventDefault();
                        if (reviewNote.trim().length < 5) {
                          setReviewError('Please enter a resolution note (at least 5 characters).');
                          return;
                        }
                        setResolvingReview(true);
                        setReviewError('');
                        try {
                          const res = await adminApiService.resolveReservationReview(selectedDetail.reservation_id, reviewNote.trim());
                          setSelectedDetail((prev) => prev ? {
                            ...prev,
                            needs_admin_review: false,
                            admin_review_resolved: true,
                            admin_review_resolved_note: res?.resolved_note || reviewNote.trim(),
                          } : prev);
                          setReviewNote('');
                          loadReservations();
                        } catch (err) {
                          setReviewError(err?.message || 'Unable to resolve reservation review.');
                        } finally {
                          setResolvingReview(false);
                        }
                      }}
                      style={{ display: 'grid', gap: 8 }}
                    >
                      {reviewError && <div className="admin-inline-error" role="alert">{reviewError}</div>}
                      <input
                        type="text"
                        minLength={5}
                        maxLength={500}
                        placeholder="Record admin review note (note-only, does not move money)..."
                        value={reviewNote}
                        onChange={(e) => setReviewNote(e.target.value)}
                        required
                      />
                      <div>
                        <Button type="submit" variant="primary" size="sm" disabled={resolvingReview}>
                          {resolvingReview ? 'Saving...' : 'Mark Review Resolved'}
                        </Button>
                      </div>
                    </form>
                  )}
                </div>
              )}

              <ul className="admin-detail-list">
                <li>
                  <strong>Restaurant</strong>
                  {selectedDetail.restaurant_name}
                </li>
                <li>
                  <strong>Table</strong>
                  {selectedDetail.table?.table_name
                    ? `${selectedDetail.table.table_name}${selectedDetail.table.dining_area ? ` (${selectedDetail.table.dining_area})` : ''}`
                    : 'Unassigned'}
                </li>
                <li>
                  <strong>Guest</strong>
                  {selectedDetail.contact_name}
                  {selectedDetail.contact_phone ? ` · ${selectedDetail.contact_phone}` : ''}
                </li>
                <li>
                  <strong>Customer email</strong>
                  {selectedDetail.customer_email || '—'}
                </li>
                <li>
                  <strong>Schedule</strong>
                  {selectedDetail.reservation_start ? formatDateTime(selectedDetail.reservation_start) : '—'}
                </li>
                <li>
                  <strong>Party size</strong>
                  {selectedDetail.party_size} guest{selectedDetail.party_size === 1 ? '' : 's'}
                </li>
                <li>
                  <strong>Deposit</strong>
                  {selectedDetail.deposit_amount > 0
                    ? `${formatPeso(selectedDetail.deposit_amount)} (${String(selectedDetail.deposit_display_status || selectedDetail.deposit_status).replace('_', ' ')})`
                    : 'None'}
                </li>
                <li>
                  <strong>Service fee</strong>
                  {formatPeso(selectedDetail.service_fee)}
                </li>
              </ul>

              {selectedDetail.customer_history && (
                <div className="admin-record-panel">
                  <h3>Customer platform history</h3>
                  <p style={{ margin: 0 }}>
                    {selectedDetail.customer_history.total_reservations} total ·{' '}
                    {selectedDetail.customer_history.visits} completed ·{' '}
                    {selectedDetail.customer_history.no_shows} no-shows ·{' '}
                    {selectedDetail.customer_history.cancellations} cancellations
                  </p>
                </div>
              )}

              {selectedDetail.restaurant_settings && (
                <div className="admin-record-panel">
                  <h3>Restaurant reservation settings</h3>
                  <p style={{ margin: 0 }}>
                    {selectedDetail.restaurant_settings.duration_minutes}m slot ·{' '}
                    {selectedDetail.restaurant_settings.min_notice_hours}h notice ·{' '}
                    {selectedDetail.restaurant_settings.cancellation_cutoff_minutes}m cancel cutoff ·{' '}
                    {selectedDetail.restaurant_settings.auto_confirm ? 'Auto-confirm' : 'Manual approval'}
                  </p>
                </div>
              )}

              {selectedDetail.special_requests && (
                <div className="admin-record-panel">
                  <h3>Special requests</h3>
                  <p style={{ margin: 0 }}>{selectedDetail.special_requests}</p>
                </div>
              )}

              {(selectedDetail.cancellation_reason || selectedDetail.rejection_reason) && (
                <div className="admin-record-panel">
                  <h3>{selectedDetail.rejection_reason ? 'Rejection reason' : 'Cancellation reason'}</h3>
                  <p style={{ margin: 0 }}>
                    {selectedDetail.rejection_reason || selectedDetail.cancellation_reason}
                    {selectedDetail.cancelled_by ? ` (by ${selectedDetail.cancelled_by})` : ''}
                  </p>
                </div>
              )}

              <div className="admin-record-panel">
                <h3>Status timeline</h3>
                <Timeline
                  items={(selectedDetail.status_history || []).map((entry) => ({
                    id: entry.history_id,
                    title: `${entry.from_status ? `${entry.from_status} → ` : ''}${entry.to_status}`,
                    description: `${entry.actor_name ? `${entry.actor_name} (${entry.changed_by_role || 'system'})` : (entry.changed_by_role || 'system')}${entry.note ? ` · ${entry.note}` : ''}`,
                    time: entry.created_at,
                  }))}
                />
              </div>
            </div>
          ) : null}
        </DetailDrawer>
      </section>
    </AdminLayout>
  );
}
