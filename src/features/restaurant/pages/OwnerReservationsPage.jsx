import { useCallback, useEffect, useMemo, useState } from 'react';
import OwnerLayout from '../../../layouts/OwnerLayout';
import ownerService from '../../../services/ownerService';
import Button from '../../../components/common/Button';
import Badge from '../../../components/common/Badge';
import { EmptyState, ErrorState, LoadingSpinner } from '../../../components/feedback';
import { useRestaurantAccess } from '../access/useRestaurantAccess';
import './OwnerReservationsPage.css';

const QUICK_FILTERS = [
  ['new', 'New requests'],
  ['Pending', 'Pending'],
  ['Approved', 'Approved'],
  ['Confirmed', 'Confirmed'],
  ['today', 'Today'],
  ['upcoming', 'Upcoming'],
  ['Cancelled', 'Cancelled'],
  ['Completed', 'Completed'],
  ['No-Show', 'No-show'],
];

const CALENDAR_MODES = ['day', 'week', 'month'];

function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function statusVariant(status = '') {
  if (['Pending', 'Awaiting Payment'].includes(status)) return 'warning';
  if (['Approved', 'Confirmed', 'Seated'].includes(status)) return 'success';
  if (status === 'Completed') return 'info';
  if (['Cancelled', 'Rejected', 'No-Show', 'Expired'].includes(status)) return 'default';
  return 'default';
}

function getCalendarDays(mode, anchorDate) {
  const start = new Date(anchorDate);
  if (mode === 'week') {
    start.setDate(start.getDate() - start.getDay());
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return date;
    });
  }
  if (mode === 'month') {
    start.setDate(1);
    start.setDate(start.getDate() - start.getDay());
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return date;
    });
  }
  return [new Date(anchorDate)];
}

export default function OwnerReservationsPage() {
  const access = useRestaurantAccess();
  const { selectedRestaurantId } = access;
  const [reservations, setReservations] = useState([]);
  const [tablesByReservation, setTablesByReservation] = useState({});
  const [loadingTablesFor, setLoadingTablesFor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [quickFilter, setQuickFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [tableChoices, setTableChoices] = useState({});
  const [rejectReasons, setRejectReasons] = useState({});
  const [cancelReasons, setCancelReasons] = useState({});
  const [calendarMode, setCalendarMode] = useState('day');
  const [calendarDate, setCalendarDate] = useState(() => new Date());
  const [savingAction, setSavingAction] = useState(false);

  const can = (permission) => access.canAccess([permission]);

  const loadReservations = useCallback(() => {
    setLoading(true);
    setError('');
    try {
      setReservations(ownerService.getReservations(selectedRestaurantId));
    } catch (loadError) {
      setError(loadError.message || 'Unable to load reservations.');
    } finally {
      setLoading(false);
    }
  }, [selectedRestaurantId]);

  useEffect(() => {
    loadReservations();
    window.addEventListener('salo:demoStoreUpdated', loadReservations);
    return () => window.removeEventListener('salo:demoStoreUpdated', loadReservations);
  }, [loadReservations]);

  const runAction = (action) => {
    setError('');
    setSavingAction(true);
    try {
      action();
      loadReservations();
    } catch (actionError) {
      setError(actionError.message || 'Unable to update this reservation.');
    } finally {
      setSavingAction(false);
    }
  };

  const loadTableChoices = (reservation) => {
    setError('');
    setLoadingTablesFor(reservation.id);
    try {
      const choices = ownerService.getReservationTables(selectedRestaurantId, reservation.id);
      setTablesByReservation((existing) => ({ ...existing, [reservation.id]: choices }));
      setTableChoices((existing) => ({
        ...existing,
        [reservation.id]: reservation.assignedTable?.id || '',
      }));
    } catch (tableError) {
      setError(tableError.message || 'Unable to load available tables.');
    } finally {
      setLoadingTablesFor(null);
    }
  };

  const todayKey = localDateKey(new Date());
  const counts = useMemo(() => {
    const active = reservations.filter((entry) => !['Cancelled', 'Rejected', 'Completed', 'No-Show', 'Expired'].includes(entry.status));
    return {
      new: reservations.filter((entry) => entry.status === 'Pending' && !entry.reviewedAt).length,
      Pending: reservations.filter((entry) => entry.status === 'Pending').length,
      Approved: reservations.filter((entry) => entry.status === 'Approved').length,
      Confirmed: reservations.filter((entry) => entry.status === 'Confirmed').length,
      today: active.filter((entry) => entry.date === todayKey).length,
      upcoming: active.filter((entry) => entry.date > todayKey).length,
      Cancelled: reservations.filter((entry) => entry.status === 'Cancelled').length,
      Completed: reservations.filter((entry) => entry.status === 'Completed').length,
      'No-Show': reservations.filter((entry) => entry.status === 'No-Show').length,
    };
  }, [reservations, todayKey]);

  const filteredReservations = useMemo(() => reservations.filter((reservation) => {
    const term = search.trim().toLowerCase();
    const tableText = reservation.assignedTable?.name || reservation.assignedTable?.id || '';
    const matchesSearch = !term || [
      reservation.id,
      reservation.reference,
      reservation.guestName,
      reservation.guestEmail,
      reservation.guestPhone,
      tableText,
    ].some((value) => String(value || '').toLowerCase().includes(term));
    const matchesStatus = statusFilter === 'all' || reservation.status === statusFilter;
    const matchesDate = !dateFilter || reservation.date === dateFilter;
    const matchesQuick = quickFilter === 'all'
      || (quickFilter === 'new' && reservation.status === 'Pending' && !reservation.reviewedAt)
      || quickFilter === 'today' && reservation.date === todayKey
      || quickFilter === 'upcoming' && reservation.date > todayKey
      || reservation.status === quickFilter;
    return matchesSearch && matchesStatus && matchesDate && matchesQuick;
  }), [reservations, search, statusFilter, dateFilter, quickFilter, todayKey]);

  const calendarDays = useMemo(() => getCalendarDays(calendarMode, calendarDate), [calendarMode, calendarDate]);
  const calendarReservations = useMemo(() => {
    const dates = new Set(calendarDays.map(localDateKey));
    return filteredReservations.filter((reservation) => dates.has(reservation.date));
  }, [calendarDays, filteredReservations]);

  const openDetails = (reservation) => {
    if (expandedId === reservation.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(reservation.id);
    if (can('reservations.assignTables')) loadTableChoices(reservation);
  };

  const updateStatus = (reservation, status, details) => runAction(() => (
    ownerService.updateReservationStatus(reservation.id, status, selectedRestaurantId, details)
  ));

  const assignTable = (reservation) => {
    const tableId = tableChoices[reservation.id];
    if (!tableId) {
      setError('Select an available table before assigning it.');
      return;
    }
    runAction(() => ownerService.assignReservationTable(reservation.id, tableId, selectedRestaurantId));
  };

  const moveCalendar = (direction) => {
    setCalendarDate((previous) => {
      const next = new Date(previous);
      if (calendarMode === 'day') next.setDate(next.getDate() + direction);
      else if (calendarMode === 'week') next.setDate(next.getDate() + direction * 7);
      else next.setMonth(next.getMonth() + direction);
      return next;
    });
  };

  const openReservationFromCalendar = (reservation) => {
    setQuickFilter('all');
    setStatusFilter('all');
    setSearch('');
    setDateFilter('');
    setExpandedId(reservation.id);
    if (can('reservations.assignTables')) loadTableChoices(reservation);
  };

  const displayedCalendarReservations = [...calendarReservations].sort((a, b) => (
    `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`)
  ));

  return (
    <OwnerLayout>
      <main className="owner-reservations">
        <header className="reservation-page-header">
          <div>
            <span className="reservation-eyebrow">Guest operations</span>
            <h1 className="page-title">Reservations</h1>
            <p className="page-subtitle">Review requests, coordinate tables, and track each guest visit.</p>
          </div>
          {counts.new > 0 && (
            <button type="button" className="reservation-needs-action" onClick={() => setQuickFilter('new')}>
              <span className="reservation-live-dot" />
              {counts.new} new request{counts.new === 1 ? '' : 's'} need action
            </button>
          )}
        </header>

        {error && <div className="reservation-error" role="alert">{error}</div>}
        {loading ? <LoadingSpinner size="lg" label="Loading reservations..." />
          : error && reservations.length === 0 ? <ErrorState description={error} onRetry={loadReservations} />
            : (
              <>
                <section className="reservation-count-grid" aria-label="Reservation summaries">
                  {QUICK_FILTERS.map(([id, label]) => (
                    <button
                      type="button"
                      key={id}
                      className={`reservation-count-card ${quickFilter === id ? 'is-selected' : ''}`}
                      onClick={() => setQuickFilter(quickFilter === id ? 'all' : id)}
                    >
                      <span>{label}</span>
                      <strong>{counts[id]}</strong>
                    </button>
                  ))}
                </section>

                <section className="reservation-calendar-panel" aria-label="Reservation calendar">
                  <div className="reservation-calendar-toolbar">
                    <div className="reservation-calendar-heading">
                      <h2>Calendar</h2>
                      <span>{calendarMode === 'day'
                        ? calendarDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
                        : calendarDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                      </span>
                    </div>
                    <div className="reservation-calendar-controls">
                      <div className="reservation-view-switch" role="group" aria-label="Calendar view">
                        {CALENDAR_MODES.map((mode) => (
                          <button
                            key={mode}
                            type="button"
                            aria-pressed={calendarMode === mode}
                            className={calendarMode === mode ? 'is-active' : ''}
                            onClick={() => setCalendarMode(mode)}
                          >
                            {mode[0].toUpperCase() + mode.slice(1)}
                          </button>
                        ))}
                      </div>
                      <div className="reservation-calendar-arrows">
                        <button type="button" aria-label="Previous period" onClick={() => moveCalendar(-1)}>‹</button>
                        <button type="button" onClick={() => setCalendarDate(new Date())}>Today</button>
                        <button type="button" aria-label="Next period" onClick={() => moveCalendar(1)}>›</button>
                      </div>
                    </div>
                  </div>

                  {calendarMode === 'day' ? (
                    <div className="reservation-agenda">
                      {displayedCalendarReservations.length ? displayedCalendarReservations.map((reservation) => (
                        <CalendarReservation key={reservation.id} reservation={reservation} onOpen={openReservationFromCalendar} />
                      )) : <p className="reservation-calendar-empty">No reservations scheduled for this day.</p>}
                    </div>
                  ) : (
                    <>
                      <div className={`reservation-calendar-grid is-${calendarMode}`}>
                        {calendarDays.map((date) => {
                          const dateKey = localDateKey(date);
                          const dayReservations = displayedCalendarReservations.filter((item) => item.date === dateKey);
                          return (
                            <div key={dateKey} className={`reservation-calendar-cell ${calendarMode === 'month' && date.getMonth() !== calendarDate.getMonth() ? 'is-outside-month' : ''}`}>
                              <button type="button" className="reservation-calendar-date" onClick={() => { setCalendarDate(date); setCalendarMode('day'); }}>
                                <span>{date.toLocaleDateString(undefined, { weekday: 'short' })}</span>
                                <strong>{date.getDate()}</strong>
                              </button>
                              <div className="reservation-calendar-cell-items">
                                {dayReservations.map((reservation) => (
                                  <CalendarReservation key={reservation.id} reservation={reservation} onOpen={openReservationFromCalendar} compact />
                                ))}
                                {!dayReservations.length && <span className="reservation-cell-empty">—</span>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <div className="reservation-agenda reservation-mobile-agenda">
                        {displayedCalendarReservations.length ? displayedCalendarReservations.map((reservation) => (
                          <CalendarReservation key={reservation.id} reservation={reservation} onOpen={openReservationFromCalendar} />
                        )) : <p className="reservation-calendar-empty">No reservations in this period.</p>}
                      </div>
                    </>
                  )}
                </section>

                <section className="reservation-list-panel">
                  <div className="reservation-list-heading">
                    <div>
                      <h2>Reservation list</h2>
                      <span>{filteredReservations.length} result{filteredReservations.length === 1 ? '' : 's'}</span>
                    </div>
                    <button type="button" className="reservation-clear-filters" onClick={() => {
                      setQuickFilter('all');
                      setStatusFilter('all');
                      setSearch('');
                      setDateFilter('');
                    }}>
                      Clear filters
                    </button>
                  </div>

                  <div className="reservation-filters">
                    <label>
                      <span>Search reference, guest, or table</span>
                      <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="e.g. RES-5501 or Table 2" />
                    </label>
                    <label>
                      <span>Status</span>
                      <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                        <option value="all">All statuses</option>
                        {['Pending', 'Approved', 'Awaiting Payment', 'Confirmed', 'Arrived', 'Seated', 'Completed', 'Rejected', 'Cancelled', 'No-Show', 'Expired'].map((status) => (
                          <option key={status} value={status}>{status}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Date</span>
                      <input type="date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} />
                    </label>
                  </div>

                  {filteredReservations.length === 0 ? (
                    <EmptyState
                      title={reservations.length ? 'No matching reservations' : 'No reservations yet'}
                      description={reservations.length ? 'Change or clear the current filters.' : 'Customer reservation requests will appear here.'}
                    />
                  ) : (
                    <div className="reservation-record-list">
                      {filteredReservations.map((reservation) => (
                        <ReservationCard
                          key={reservation.id}
                          reservation={reservation}
                          expanded={expandedId === reservation.id}
                          can={can}
                          saving={savingAction}
                          tableChoices={tablesByReservation[reservation.id] || []}
                          selectedTable={tableChoices[reservation.id] || ''}
                          loadingTables={loadingTablesFor === reservation.id}
                          rejectionReason={rejectReasons[reservation.id] || ''}
                          cancellationReason={cancelReasons[reservation.id] || ''}
                          onToggle={() => openDetails(reservation)}
                          onTableChange={(value) => setTableChoices((previous) => ({ ...previous, [reservation.id]: value }))}
                          onLoadTables={() => loadTableChoices(reservation)}
                          onAssign={() => assignTable(reservation)}
                          onStatus={(status, details) => updateStatus(reservation, status, details)}
                          onRejectReason={(value) => setRejectReasons((previous) => ({ ...previous, [reservation.id]: value }))}
                          onCancellationReason={(value) => setCancelReasons((previous) => ({ ...previous, [reservation.id]: value }))}
                          onPayment={() => runAction(() => ownerService.recordReservationPayment(reservation.id, selectedRestaurantId))}
                          onConfirmTable={() => runAction(() => ownerService.confirmReservationTable(reservation.id, selectedRestaurantId))}
                          onCancelDecision={(decision) => runAction(() => ownerService.resolveReservationCancellation(
                            reservation.id,
                            decision,
                            selectedRestaurantId,
                            cancelReasons[reservation.id] || '',
                          ))}
                        />
                      ))}
                    </div>
                  )}
                </section>
              </>
            )}
      </main>
    </OwnerLayout>
  );
}

function CalendarReservation({ reservation, onOpen, compact = false }) {
  return (
    <button type="button" className={`reservation-calendar-item ${compact ? 'is-compact' : ''}`} onClick={() => onOpen(reservation)}>
      <strong>{reservation.time}</strong>
      <span>{reservation.assignedTable?.name || reservation.guestName}</span>
      {!compact && <small>{reservation.guestName} · {reservation.assignedTable?.name || 'Unassigned table'}</small>}
    </button>
  );
}

function ReservationCard({
  reservation,
  expanded,
  can,
  saving,
  tableChoices,
  selectedTable,
  loadingTables,
  rejectionReason,
  cancellationReason,
  onToggle,
  onTableChange,
  onLoadTables,
  onAssign,
  onStatus,
  onRejectReason,
  onCancellationReason,
  onPayment,
  onConfirmTable,
  onCancelDecision,
}) {
  const canTable = can('reservations.assignTables');
  const canApprove = can('reservations.approve');
  const canReject = can('reservations.reject');
  const canUpdate = can('reservations.updateStatus');
  const canArrival = can('reservations.manageArrival');
  const guestCount = reservation.partySize ?? reservation.guests ?? 0;
  const tableName = reservation.assignedTable?.name || reservation.assignedTable?.id || 'Not assigned';
  const paymentStatus = reservation.paymentStatus || 'Pending';

  return (
    <article className={`reservation-record ${expanded ? 'is-expanded' : ''}`}>
      <div className="reservation-record-main">
        <div className="reservation-record-identity">
          <span className="reservation-record-icon" aria-hidden="true">♧</span>
          <div>
            <div className="reservation-record-title">
              <h3>{reservation.guestName}</h3>
              <Badge variant={statusVariant(reservation.status)} size="sm" dot>{reservation.status}</Badge>
              {reservation.status === 'Pending' && !reservation.reviewedAt && <span className="reservation-needs-badge">Needs action</span>}
            </div>
            <p>#{reservation.reference || reservation.id} · {guestCount} guests · {reservation.date} at {reservation.time}</p>
            <p>{tableName} · Payment: {paymentStatus}</p>
          </div>
        </div>
        <div className="reservation-record-actions">
          {reservation.status === 'Pending' && canApprove && (
            <Button size="sm" variant="primary" disabled={saving} onClick={() => onStatus('Approved')}>Approve</Button>
          )}
          <Button size="sm" variant="outline" onClick={onToggle}>{expanded ? 'Close details' : 'Details'}</Button>
        </div>
      </div>

      {expanded && (
        <div className="reservation-details">
          <section className="reservation-details-grid" aria-label="Reservation details">
            <Detail label="Reference" value={reservation.reference || reservation.id} />
            <Detail label="Customer" value={reservation.guestName} />
            <Detail label="Contact" value={[reservation.guestPhone, reservation.guestEmail].filter(Boolean).join(' · ') || 'Not provided'} />
            <Detail label="Date and time" value={`${reservation.date} · ${reservation.time}`} />
            <Detail label="Guests" value={guestCount} />
            <Detail label="Assigned table" value={tableName} />
            <Detail label="Dining area" value={reservation.assignedTable?.area || reservation.seatingArea || 'Not specified'} />
            <Detail label="Special requests" value={reservation.specialRequests || 'None'} />
            <Detail label="Fee / deposit" value={`₱${Number(reservation.fee ?? reservation.depositAmount ?? 0).toLocaleString()}`} />
            <Detail label="Payment status" value={paymentStatus} />
            <Detail label="Payment method" value={reservation.paymentMethod || 'Not recorded'} />
            <Detail label="Payment reference" value={reservation.paymentReference || 'Not recorded'} />
            <Detail label="Payment deadline" value={reservation.paymentDeadline || 'Not configured'} />
            <Detail label="Refund information" value={reservation.refundStatus || (reservation.paymentStatus === 'Paid' ? 'No refund recorded' : 'No payment to refund')} />
            <Detail label="Submitted" value={reservation.submittedAt || reservation.createdAt || 'Not recorded'} />
          </section>

          <section className="reservation-action-section">
            <h4>Approval and payment</h4>
            {reservation.status === 'Pending' && canReject && (
              <div className="reservation-inline-action">
                <label>
                  <span>Rejection reason (required)</span>
                  <input value={rejectionReason} onChange={(event) => onRejectReason(event.target.value)} placeholder="Explain why this request cannot be accepted" />
                </label>
                <Button size="sm" variant="danger-outline" disabled={saving || !rejectionReason.trim()} onClick={() => onStatus('Rejected', { reason: rejectionReason })}>Reject request</Button>
              </div>
            )}
            {reservation.status === 'Approved' && canUpdate && (
              <Button size="sm" variant="outline" disabled={saving} onClick={onPayment}>Mark awaiting payment</Button>
            )}
            {reservation.status === 'Awaiting Payment' && canUpdate && (
              <Button size="sm" variant="outline" disabled={saving} onClick={onPayment}>Record demo payment and confirm</Button>
            )}
            {['Pending', 'Approved', 'Awaiting Payment', 'Confirmed'].includes(reservation.status) && canTable && (
              <div className="reservation-inline-action">
                <label>
                  <span>Available tables for {guestCount} guests</span>
                  <select
                    value={selectedTable}
                    onFocus={() => { if (!tableChoices.length && !loadingTables) onLoadTables(); }}
                    onChange={(event) => onTableChange(event.target.value)}
                  >
                    <option value="">Select a table</option>
                    {tableChoices.map((table) => <option key={table.id} value={table.id}>{table.name} · {table.area} · up to {table.capacity}</option>)}
                  </select>
                </label>
                {loadingTables && <span className="reservation-inline-note">Loading tables…</span>}
                <Button size="sm" variant="secondary" disabled={saving || !selectedTable} onClick={onAssign}>Assign table</Button>
              </div>
            )}
          </section>

          <section className="reservation-action-section">
            <h4>Arrival and visit</h4>
            {reservation.status === 'Confirmed' && canArrival && (
              <Button size="sm" variant="primary" disabled={saving || !reservation.assignedTable} onClick={() => onStatus('Arrived')}>Mark arrived</Button>
            )}
            {reservation.status === 'Arrived' && canArrival && (
              <div className="reservation-inline-action">
                {!reservation.tableConfirmedAt
                  ? <Button size="sm" variant="outline" disabled={saving || !reservation.assignedTable} onClick={onConfirmTable}>Confirm assigned table</Button>
                  : <Button size="sm" variant="primary" disabled={saving} onClick={() => onStatus('Seated')}>Mark seated</Button>}
                {!reservation.tableConfirmedAt && <Button size="sm" variant="ghost" disabled={saving} onClick={() => onStatus('No-Show')}>Mark no-show</Button>}
              </div>
            )}
            {reservation.status === 'Seated' && canArrival && (
              <Button size="sm" variant="primary" disabled={saving} onClick={() => onStatus('Completed')}>Complete visit</Button>
            )}
          </section>

          {reservation.cancellationRequest?.status === 'requested' && (
            <section className="reservation-cancellation-review">
              <div>
                <h4>Customer cancellation request</h4>
                <p>Reason: {reservation.cancellationRequest.reason || 'No reason provided'}</p>
                <p>Fee: ₱{Number(reservation.fee ?? reservation.depositAmount ?? 0).toLocaleString()} · Payment: {paymentStatus} · Refund: {reservation.refundStatus || 'Pending review'}</p>
              </div>
              {canUpdate && (
                <div className="reservation-cancellation-actions">
                  <label>
                    <span>Decline reason (required when declining)</span>
                    <input value={cancellationReason} onChange={(event) => onCancellationReason(event.target.value)} placeholder="Reason for declining" />
                  </label>
                  <div>
                    <Button size="sm" variant="danger-outline" disabled={saving || !cancellationReason.trim()} onClick={() => onCancelDecision('decline')}>Decline request</Button>
                    <Button size="sm" variant="primary" disabled={saving} onClick={() => onCancelDecision('approve')}>Approve cancellation</Button>
                  </div>
                </div>
              )}
            </section>
          )}

          <section className="reservation-history">
            <h4>Status history</h4>
            {reservation.statusHistory?.length ? (
              <ol>
                {reservation.statusHistory.map((entry, index) => (
                  <li key={`${entry.status}-${entry.timestamp || index}`}>
                    <strong>{entry.status}</strong>
                    <time>{entry.timestamp ? new Date(entry.timestamp).toLocaleString() : 'Time not recorded'}</time>
                    {entry.reason && <span>{entry.reason}</span>}
                  </li>
                ))}
              </ol>
            ) : <p>No status history is available.</p>}
          </section>
        </div>
      )}
    </article>
  );
}

function Detail({ label, value }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
