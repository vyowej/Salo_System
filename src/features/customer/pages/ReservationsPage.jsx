import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import CustomerLayout from '../../../layouts/CustomerLayout';
import customerService from '../../../services/customerService';
import publicRestaurantService from '../../../services/publicRestaurantService';
import ReservationPreOrderSection from '../components/ReservationPreOrderSection';
import Button from '../../../components/common/Button';
import Badge from '../../../components/common/Badge';
import Modal from '../../../components/common/Modal';
import { formatTimeUntilExpiry } from '../../../utils/reservationExpiryUtils';
import {
  AlertIcon,
  CalendarIcon,
  ClipboardIcon,
  CreditCardIcon,
  PhoneIcon,
  SearchIcon,
  TableIcon,
  UsersIcon,
} from '../../../components/common/ReservationIcons';
import './CustomerRecords.css';
import './CustomerReservationsPage.css';

function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatManilaDateTime(isoString) {
  if (!isoString) return '';
  try {
    const dt = new Date(isoString);
    if (Number.isNaN(dt.getTime())) return isoString;
    return dt.toLocaleString('en-PH', {
      timeZone: 'Asia/Manila',
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return isoString;
  }
}

export default function ReservationsPage() {
  const [reservations, setReservations] = useState([]);
  const [serverSummary, setServerSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successBanner, setSuccessBanner] = useState('');

  // Primary View Mode: 'calendar' (Default) | 'list'
  const [viewMode, setViewMode] = useState('calendar');

  // Calendar State
  const [calendarDate, setCalendarDate] = useState(() => new Date());
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(() => localDateKey(new Date()));

  // Filters & Search (for list view)
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('date-asc');

  // Modals state
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [selectedRes, setSelectedRes] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState('');

  const [detailsRes, setDetailsRes] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [depositChannel, setDepositChannel] = useState('gcash');
  const [depositBusy, setDepositBusy] = useState(false);
  const [depositError, setDepositError] = useState('');
  const [copiedId, setCopiedId] = useState(null);

  // Pre-order edit modal state
  const [preOrderModalOpen, setPreOrderModalOpen] = useState(false);
  const [preOrderRestaurant, setPreOrderRestaurant] = useState(null);
  const [preOrderMenuLoading, setPreOrderMenuLoading] = useState(false);
  const [preOrderEditItems, setPreOrderEditItems] = useState([]);
  const [preOrderEditNotes, setPreOrderEditNotes] = useState('');
  const [preOrderBusy, setPreOrderBusy] = useState(false);
  const [preOrderError, setPreOrderError] = useState('');

  const todayKey = localDateKey(new Date());

  const loadReservations = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await customerService.getReservations({ perPage: 100 });
      const items = Array.isArray(result) ? result : (result?.items || []);
      setReservations(items);
      if (result?.summary) {
        setServerSummary(result.summary);
      }
    } catch (loadError) {
      setError(loadError?.message || 'Unable to load your reservations.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadReservations();
  }, [loadReservations]);

  // Summary counts
  const counts = useMemo(() => {
    let upcoming = 0;
    let pending = 0;
    let completed = 0;
    let cancelled = 0;

    reservations.forEach((r) => {
      const s = r.status;
      if (['Approved', 'Awaiting Payment', 'Confirmed', 'Arrived', 'Seated'].includes(s)) {
        upcoming += 1;
      } else if (s === 'Pending') {
        pending += 1;
      } else if (s === 'Completed') {
        completed += 1;
      } else if (['Cancelled', 'Rejected', 'No-Show', 'Expired'].includes(s)) {
        cancelled += 1;
      }
    });

    if (serverSummary) {
      return {
        all: Number(serverSummary.total ?? reservations.length),
        upcoming: Number(serverSummary.upcoming ?? upcoming),
        pending: Number(serverSummary.pending ?? pending),
        completed: Number(serverSummary.completed ?? completed),
        cancelled: Number(serverSummary.cancelledOrDeclined ?? serverSummary.cancelled_or_declined ?? cancelled),
      };
    }

    return {
      all: reservations.length,
      upcoming,
      pending,
      completed,
      cancelled,
    };
  }, [reservations, serverSummary]);

  // Calendar matrix days
  const calendarDays = useMemo(() => {
    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();

    const firstDay = new Date(year, month, 1);
    const startOffset = (firstDay.getDay() + 6) % 7; // Monday = 0
    const totalDays = new Date(year, month + 1, 0).getDate();

    const days = [];
    const prevMonthDays = new Date(year, month, 0).getDate();

    for (let i = startOffset - 1; i >= 0; i--) {
      days.push({
        date: new Date(year, month - 1, prevMonthDays - i),
        isOutsideMonth: true,
      });
    }

    for (let d = 1; d <= totalDays; d++) {
      days.push({
        date: new Date(year, month, d),
        isOutsideMonth: false,
      });
    }

    const targetLength = days.length > 35 ? 42 : 35;
    let nextDay = 1;
    while (days.length < targetLength) {
      days.push({
        date: new Date(year, month + 1, nextDay++),
        isOutsideMonth: true,
      });
    }

    return days;
  }, [calendarDate]);

  // Map of customer reservations by dateKey
  const customerReservationMap = useMemo(() => {
    const map = {};
    reservations.forEach((r) => {
      if (!r.date) return;
      if (!map[r.date]) map[r.date] = [];
      map[r.date].push(r);
    });
    return map;
  }, [reservations]);

  // Bookings on selected calendar date
  const selectedDateBookings = useMemo(() => {
    return customerReservationMap[selectedCalendarDate] || [];
  }, [customerReservationMap, selectedCalendarDate]);

  // Filter & sort logic for List view
  const filteredReservations = useMemo(() => {
    return reservations
      .filter((res) => {
        if (statusFilter === 'upcoming') {
          if (!res.isUpcoming && !['Pending', 'Approved', 'Awaiting Payment', 'Confirmed', 'Arrived', 'Seated'].includes(res.status)) {
            return false;
          }
        } else if (statusFilter === 'pending') {
          if (res.status !== 'Pending') return false;
        } else if (statusFilter === 'confirmed') {
          if (!['Approved', 'Confirmed'].includes(res.status)) return false;
        } else if (statusFilter === 'completed') {
          if (res.status !== 'Completed') return false;
        } else if (statusFilter === 'cancelled') {
          if (!['Cancelled', 'Rejected', 'No-Show', 'Expired'].includes(res.status)) return false;
        }

        if (search.trim()) {
          const q = search.trim().toLowerCase();
          const matchRestaurant = res.restaurantName?.toLowerCase().includes(q);
          const matchRef = (res.reference || res.id || '')?.toLowerCase().includes(q);
          const matchArea = res.seatingArea?.toLowerCase().includes(q);
          const matchNote = res.specialRequests?.toLowerCase().includes(q);
          if (!matchRestaurant && !matchRef && !matchArea && !matchNote) return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'date-desc') {
          return new Date(`${b.date}T${b.time || '00:00'}`) - new Date(`${a.date}T${a.time || '00:00'}`);
        }
        if (sortBy === 'guests-desc') {
          return (Number(b.guests) || 0) - (Number(a.guests) || 0);
        }
        return new Date(`${a.date}T${a.time || '00:00'}`) - new Date(`${b.date}T${b.time || '00:00'}`);
      });
  }, [reservations, statusFilter, search, sortBy]);

  // Calendar navigation
  const moveMonth = (step) => {
    const next = new Date(calendarDate);
    next.setMonth(next.getMonth() + step);
    setCalendarDate(next);
  };

  const jumpToToday = () => {
    const now = new Date();
    setCalendarDate(now);
    setSelectedCalendarDate(localDateKey(now));
  };

  const handleOpenDetails = async (res) => {
    setDetailsRes(res);
    setDepositError('');
    const numericId = res.reservationId || res.id;
    if (!numericId) return;

    setDetailsLoading(true);
    try {
      const full = await customerService.getReservation(numericId);
      if (full) {
        setDetailsRes(full);
      }
    } catch {
      // Keep list item details if detail fetch fails
    } finally {
      setDetailsLoading(false);
    }
  };

  const refreshDetailsFromServer = async (numericId) => {
    const [full] = await Promise.all([
      customerService.getReservation(numericId),
      loadReservations(),
    ]);
    if (full) setDetailsRes(full);
  };

  const handleInitiateDeposit = async () => {
    if (!detailsRes || depositBusy) return;
    const numericId = detailsRes.reservationId || detailsRes.id;
    setDepositBusy(true);
    setDepositError('');
    try {
      const idemKey = `resdep-${numericId}-${Date.now()}`;
      await customerService.initiateReservationDeposit(numericId, {
        paymentMethod: depositChannel,
        idempotencyKey: idemKey,
      });
      await refreshDetailsFromServer(numericId);
    } catch (err) {
      setDepositError(err?.message || 'Unable to initiate deposit payment.');
    } finally {
      setDepositBusy(false);
    }
  };

  const handleConfirmSandboxDeposit = async (paymentId) => {
    if (!detailsRes || depositBusy) return;
    const numericId = detailsRes.reservationId || detailsRes.id;
    setDepositBusy(true);
    setDepositError('');
    try {
      await customerService.confirmPayment(paymentId);
      await refreshDetailsFromServer(numericId);
      setSuccessBanner('Deposit payment confirmed and reservation is now confirmed.');
    } catch (err) {
      setDepositError(err?.message || 'Unable to confirm deposit payment.');
    } finally {
      setDepositBusy(false);
    }
  };

  const handleFailSandboxDeposit = async (paymentId) => {
    if (!detailsRes || depositBusy) return;
    const numericId = detailsRes.reservationId || detailsRes.id;
    setDepositBusy(true);
    setDepositError('');
    try {
      await customerService.failPayment(paymentId, 'Customer simulated payment failure.');
      await refreshDetailsFromServer(numericId);
    } catch (err) {
      setDepositError(err?.message || 'Unable to update payment status.');
    } finally {
      setDepositBusy(false);
    }
  };

  const handleCancelClick = (res) => {
    setSelectedRes(res);
    setCancelReason('');
    setCancelError('');
    setCancelModalOpen(true);
  };

  const handleConfirmCancel = async () => {
    if (!selectedRes || cancelling) return;
    const targetId = selectedRes.reservationId || selectedRes.id;
    setCancelling(true);
    setCancelError('');

    try {
      const updated = await customerService.cancelReservation(targetId, cancelReason.trim());
      setCancelModalOpen(false);
      setSelectedRes(null);
      const cancelledRef = updated?.reference || selectedRes.reference || selectedRes.id;
      const isPaidCancel =
        selectedRes.depositStatus === 'paid' ||
        Boolean(updated?.depositUnderReview) ||
        updated?.depositStatus === 'paid';
      setSuccessBanner(
        isPaidCancel
          ? `Reservation ${cancelledRef} has been cancelled. Your paid deposit is not automatically refunded and is now under admin review.`
          : `Reservation ${cancelledRef} has been cancelled.`,
      );
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('salo:notificationsUpdated'));
      }
      await loadReservations();
    } catch (err) {
      setCancelError(err?.message || 'Unable to cancel this reservation.');
    } finally {
      setCancelling(false);
    }
  };

  const copyRefToClipboard = (ref) => {
    if (!ref) return;
    try {
      navigator.clipboard.writeText(ref);
      setCopiedId(ref);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Fallback
    }
  };

  const clearAllFilters = () => {
    setSearch('');
    setStatusFilter('all');
    setSortBy('date-asc');
  };

  const isFilterActive = search.trim() !== '' || statusFilter !== 'all' || sortBy !== 'date-asc';

  return (
    <CustomerLayout>
      <div className="customer-res-page">
        {/* ── Page Header ────────────────────────────────────────────── */}
        <header className="customer-res-header">
          <div className="customer-res-header__titles">
            <span className="customer-res-header__badge">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Calendar-Based Dining
            </span>
            <h1 className="customer-res-header__title">Reservations</h1>
            <p className="customer-res-header__desc">
              Visually track your dining schedule, monitor live table confirmations, and plan your gatherings on the interactive calendar.
            </p>
          </div>

          <div className="customer-res-header__actions">
            <Link to="/customer/restaurants" style={{ textDecoration: 'none' }}>
              <Button variant="primary" size="md">
                + Book Another Table
              </Button>
            </Link>
          </div>
        </header>

        {error && (
          <div role="alert" className="form-error" style={{ marginBottom: 'var(--space-2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>{error}</span>
            <Button variant="outline" size="sm" onClick={loadReservations}>
              Retry
            </Button>
          </div>
        )}

        {successBanner && (
          <div
            role="status"
            style={{
              marginBottom: 'var(--space-2)',
              padding: '12px 16px',
              borderRadius: 'var(--radius-md)',
              background: 'rgba(16, 185, 129, 0.12)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              color: '#065f46',
              fontSize: 13,
              fontWeight: 600,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span>{successBanner}</span>
            <button
              type="button"
              onClick={() => setSuccessBanner('')}
              style={{ background: 'none', border: 'none', color: 'inherit', fontWeight: 700, cursor: 'pointer' }}
            >
              Dismiss
            </button>
          </div>
        )}

        {/* ── Summary Metric Cards ────────────────────────────────────── */}
        <section className="customer-res-metrics" aria-label="Reservation Summary Overview">
          <button
            type="button"
            className={`customer-res-metric-card ${statusFilter === 'upcoming' ? 'is-active' : ''}`}
            onClick={() => setStatusFilter(statusFilter === 'upcoming' ? 'all' : 'upcoming')}
          >
            <div className="customer-res-metric-card__icon-badge customer-res-metric-card__icon-badge--green">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M9 11l3 3L22 4" />
                <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
              </svg>
            </div>
            <div className="customer-res-metric-card__body">
              <span className="customer-res-metric-card__label">Upcoming Bookings</span>
              <span className="customer-res-metric-card__count">{counts.upcoming}</span>
            </div>
          </button>

          <button
            type="button"
            className={`customer-res-metric-card ${statusFilter === 'pending' ? 'is-active' : ''}`}
            onClick={() => setStatusFilter(statusFilter === 'pending' ? 'all' : 'pending')}
          >
            <div className="customer-res-metric-card__icon-badge customer-res-metric-card__icon-badge--orange">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
            <div className="customer-res-metric-card__body">
              <span className="customer-res-metric-card__label">Pending Approval</span>
              <span className="customer-res-metric-card__count">{counts.pending}</span>
            </div>
          </button>

          <button
            type="button"
            className={`customer-res-metric-card ${statusFilter === 'completed' ? 'is-active' : ''}`}
            onClick={() => setStatusFilter(statusFilter === 'completed' ? 'all' : 'completed')}
          >
            <div className="customer-res-metric-card__icon-badge customer-res-metric-card__icon-badge--blue">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            </div>
            <div className="customer-res-metric-card__body">
              <span className="customer-res-metric-card__label">Completed Gatherings</span>
              <span className="customer-res-metric-card__count">{counts.completed}</span>
            </div>
          </button>

          <button
            type="button"
            className={`customer-res-metric-card ${statusFilter === 'cancelled' ? 'is-active' : ''}`}
            onClick={() => setStatusFilter(statusFilter === 'cancelled' ? 'all' : 'cancelled')}
          >
            <div className="customer-res-metric-card__icon-badge customer-res-metric-card__icon-badge--red">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            </div>
            <div className="customer-res-metric-card__body">
              <span className="customer-res-metric-card__label">Cancelled / Declined</span>
              <span className="customer-res-metric-card__count">{counts.cancelled}</span>
            </div>
          </button>
        </section>

        {/* ── Primary Calendar Navigation Bar ────────────────────────── */}
        <section className="customer-cal-nav" aria-label="Customer Calendar Controls">
          <div className="customer-cal-nav__left">
            <h2 className="customer-cal-nav__title">
              {calendarDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </h2>
            <div className="customer-cal-nav__controls">
              <button
                type="button"
                className="customer-cal-nav__btn"
                onClick={() => moveMonth(-1)}
                aria-label="Previous Month"
              >
                ‹
              </button>
              <button
                type="button"
                className="customer-cal-nav__today-btn"
                onClick={jumpToToday}
              >
                Today
              </button>
              <button
                type="button"
                className="customer-cal-nav__btn"
                onClick={() => moveMonth(1)}
                aria-label="Next Month"
              >
                ›
              </button>
            </div>
          </div>

          {/* View Mode Switcher */}
          <div className="customer-cal-nav__view-switcher" role="group" aria-label="View Switcher">
            <button
              type="button"
              className={`customer-cal-nav__tab ${viewMode === 'calendar' ? 'is-active' : ''}`}
              onClick={() => setViewMode('calendar')}
            >
              <CalendarIcon size={15} /> Reservation Calendar
            </button>
            <button
              type="button"
              className={`customer-cal-nav__tab ${viewMode === 'list' ? 'is-active' : ''}`}
              onClick={() => setViewMode('list')}
            >
              <ClipboardIcon size={15} /> All Bookings List
            </button>
          </div>
        </section>

        {/* ── Visual Legend for Customer Calendar ─────────────────────── */}
        {viewMode === 'calendar' && (
          <div className="customer-cal-legend">
            <span className="customer-cal-legend__item">
              <span className="customer-cal-legend__dot customer-cal-legend__dot--confirmed" />
              Confirmed Booking
            </span>
            <span className="customer-cal-legend__item">
              <span className="customer-cal-legend__dot customer-cal-legend__dot--pending" />
              Pending Host Approval
            </span>
            <span className="customer-cal-legend__item">
              <span className="customer-cal-legend__dot customer-cal-legend__dot--completed" />
              Completed Dining
            </span>
            <span className="customer-cal-legend__item">
              <span className="customer-cal-legend__dot customer-cal-legend__dot--cancelled" />
              Cancelled / Declined
            </span>
            <span className="customer-cal-legend__item">
              <span className="customer-cal-legend__dot customer-cal-legend__dot--selected" />
              Selected Date
            </span>
          </div>
        )}

        {/* ── MAIN CONTENT BASED ON VIEW MODE ─────────────────────────── */}
        {loading ? (
          <p role="status">Loading reservations…</p>
        ) : viewMode === 'calendar' ? (
          /* ── 1. CALENDAR VIEW (Primary) ─────────────────────────────── */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
            <div className="customer-month-card">
              <div className="customer-month-header">
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
                  <span key={d}>{d}</span>
                ))}
              </div>

              <div className="customer-month-matrix">
                {calendarDays.map((item, idx) => {
                  const key = localDateKey(item.date);
                  const isSelected = key === selectedCalendarDate;
                  const isToday = key === todayKey;
                  const dayBookings = customerReservationMap[key] || [];

                  return (
                    <button
                      key={idx}
                      type="button"
                      className={`customer-month-cell ${item.isOutsideMonth ? 'is-outside' : ''} ${isSelected ? 'is-selected' : ''} ${isToday ? 'is-today' : ''}`}
                      onClick={() => setSelectedCalendarDate(key)}
                    >
                      <div className="customer-month-cell__header">
                        <span className="customer-month-cell__num">{item.date.getDate()}</span>
                      </div>

                      {!item.isOutsideMonth && dayBookings.length > 0 && (
                        <div className="customer-month-cell__chips">
                          {dayBookings.map((b) => {
                            const isConf = ['Approved', 'Confirmed', 'Arrived', 'Seated'].includes(b.status);
                            const isPend = b.status === 'Pending' || b.status === 'Awaiting Payment';
                            const isComp = b.status === 'Completed';
                            const chipType = isConf ? 'confirmed' : isPend ? 'pending' : isComp ? 'completed' : 'cancelled';

                            return (
                              <span
                                key={b.reservationId || b.id}
                                className={`customer-month-chip customer-month-chip--${chipType}`}
                                title={`${b.restaurantName} at ${b.time} (${b.status})`}
                              >
                                {b.time} · {b.restaurantName}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Selected Date Schedule Panel */}
            <div className="customer-date-schedule">
              <div className="customer-date-schedule__header">
                <div>
                  <h3 className="customer-date-schedule__title">
                    <CalendarIcon size={15} /> Schedule for {new Date(`${selectedCalendarDate}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                  </h3>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {selectedDateBookings.length === 0
                      ? 'No table reservations scheduled on this date.'
                      : `${selectedDateBookings.length} ${selectedDateBookings.length === 1 ? 'reservation' : 'reservations'} scheduled.`}
                  </span>
                </div>

                <Link to="/customer/restaurants" style={{ textDecoration: 'none' }}>
                  <Button variant="outline" size="sm">
                    Find a Restaurant Table
                  </Button>
                </Link>
              </div>

              {selectedDateBookings.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 'var(--space-8) var(--space-4)', background: 'var(--surface-secondary)', borderRadius: 12 }}>
                  <p style={{ margin: '0 0 var(--space-3)', color: 'var(--text-muted)', fontSize: 13 }}>
                    You have no bookings for this date. Check availability at top Filipino restaurants!
                  </p>
                  <Link to="/customer/restaurants" style={{ textDecoration: 'none' }}>
                    <Button variant="primary" size="sm">
                      Browse Restaurants &amp; Reserve
                    </Button>
                  </Link>
                </div>
              ) : (
                <div className="customer-res-list">
                  {selectedDateBookings.map((res) => {
                    const isConfirmed = ['Approved', 'Confirmed', 'Arrived', 'Seated', 'Completed'].includes(res.status);
                    const isPending = res.status === 'Pending' || res.status === 'Awaiting Payment';
                    const isCancelledOrRejected = ['Cancelled', 'Rejected', 'No-Show', 'Expired'].includes(res.status);
                    const badgeVariant = isConfirmed ? 'success' : isPending ? 'warning' : isCancelledOrRejected ? 'error' : 'default';

                    const canRequestCancel = Boolean(res.canCancel);
                    const refLabel = res.reference || res.id;
                    const restaurantInitial = (res.restaurantName || 'R').charAt(0).toUpperCase();

                    return (
                      <article
                        key={res.reservationId || res.id}
                        className="customer-res-card customer-reservation-card brand-card brand-card--green"
                      >
                        <div className="customer-res-card__header customer-reservation-card__heading">
                          <div className="customer-res-card__title-area">
                            <div className="customer-res-card__avatar">
                              {restaurantInitial}
                            </div>
                            <div className="customer-res-card__titles">
                              <div className="customer-reservation-card__title-row">
                                <h2 className="customer-res-card__restaurant-name">
                                  <Link to={`/customer/restaurants/${res.restaurantId || ''}`}>
                                    {res.restaurantName}
                                  </Link>
                                </h2>
                                <Badge variant={badgeVariant} dot size="sm">
                                  {res.status}
                                </Badge>
                              </div>
                              <div className="customer-res-card__meta-bar customer-reservation-card__meta">
                                <span>Booking Ref:</span>
                                <span className="customer-res-card__ref-pill">
                                  {refLabel}
                                  <button
                                    type="button"
                                    className="customer-res-card__copy-btn"
                                    title="Copy booking reference"
                                    onClick={() => copyRefToClipboard(refLabel)}
                                  >
                                    {copiedId === refLabel ? '✓' : '⧉'}
                                  </button>
                                </span>
                                <span>·</span>
                                <span>Area: <strong>{res.seatingArea}</strong></span>
                              </div>
                            </div>
                          </div>

                          <div className="customer-res-card__header-right customer-reservation-card__actions">
                            {canRequestCancel && (
                              <Button variant="danger-outline" size="sm" onClick={() => handleCancelClick(res)}>
                                Cancel reservation
                              </Button>
                            )}
                          </div>
                        </div>

                        {res.status === 'Rejected' && (
                          <div className="customer-res-card__alert customer-res-card__alert--danger" role="alert">
                            <AlertIcon size={16} />
                            <div>
                              <strong>Reservation Declined by Restaurant</strong>
                              <span style={{ display: 'block', marginTop: 2 }}>
                                {res.rejectionReason || 'The restaurant was unable to accommodate this reservation request.'}
                              </span>
                            </div>
                          </div>
                        )}

                        <div className="customer-res-card__details customer-reservation-card__details">
                          <div className="customer-res-detail-item">
                            <span className="customer-res-detail-item__label"><CalendarIcon size={13} /> Date &amp; Time</span>
                            <p className="customer-res-detail-item__value">{res.date} at {res.time}</p>
                          </div>
                          <div className="customer-res-detail-item">
                            <span className="customer-res-detail-item__label"><UsersIcon size={13} /> Party Size</span>
                            <p className="customer-res-detail-item__value">{res.guests} {res.guests === 1 ? 'Guest' : 'Guests'}</p>
                          </div>
                          <div className="customer-res-detail-item">
                            <span className="customer-res-detail-item__label"><TableIcon size={13} /> Seating &amp; Table</span>
                            <p className="customer-res-detail-item__value">
                              {res.seatingArea}
                              {res.assignedTable && ` · Table ${res.assignedTable.name || res.assignedTable.id}`}
                            </p>
                          </div>
                          <div className="customer-res-detail-item">
                            <span className="customer-res-detail-item__label"><CreditCardIcon size={13} /> Reservation fee / payment</span>
                            <p className="customer-res-detail-item__value">
                              ₱{Number(res.depositAmount > 0 ? res.depositAmount : res.serviceFee).toLocaleString('en-PH')} · {res.paymentStatus}
                            </p>
                          </div>
                        </div>

                        {res.preOrder && (
                          <div style={{ padding: '6px 20px', fontSize: 12, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <Badge variant={res.preOrder.orderStatus === 'ready' || res.preOrder.orderStatus === 'completed' ? 'success' : res.preOrder.orderStatus === 'cancelled' || res.preOrder.orderStatus === 'rejected' ? 'default' : 'info'}>
                              Pre-Order: {res.preOrder.statusLabel}
                            </Badge>
                            <span>
                              {res.preOrder.itemCount} dish(es) · ₱{Number(res.preOrder.totalAmount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          </div>
                        )}

                        {res.specialRequests && (
                          <div className="customer-reservation-card__note" style={{ padding: '8px 20px', fontSize: 12, color: 'var(--text-secondary)' }}>
                            <strong>Note to restaurant:</strong> {res.specialRequests}
                          </div>
                        )}

                        {(res.statusCode === 'pending' || res.statusCode === 'awaiting_payment') && res.expiresAt && (() => {
                          const expiryInfo = formatTimeUntilExpiry(res.expiresAt);
                          if (!expiryInfo) return null;
                          return (
                            <div style={{ padding: '4px 20px 8px', fontSize: 12, color: expiryInfo.expired ? '#b91c1c' : '#92400e', fontWeight: 600 }}>
                              {expiryInfo.expired
                                ? 'Request expired'
                                : res.statusCode === 'awaiting_payment'
                                  ? `Deposit due — expires in ${expiryInfo.label}`
                                  : `Waiting for the restaurant · request expires in ${expiryInfo.label}`}
                            </div>
                          );
                        })()}

                        {res.statusCode === 'expired' && (
                          <div style={{ padding: '6px 20px', fontSize: 12, color: '#991b1b', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                            <span>Expired — the restaurant didn&apos;t confirm in time</span>
                            <Link to={`/customer/restaurants/${res.restaurantId || ''}`} style={{ fontWeight: 700, color: 'var(--accent)', textDecoration: 'none' }}>
                              Book another time →
                            </Link>
                          </div>
                        )}

                        <div className="customer-res-card__footer">
                          <Button variant="secondary" size="sm" onClick={() => handleOpenDetails(res)}>
                            View Full Details
                          </Button>
                          <Link to={`/customer/restaurants/${res.restaurantId || ''}`} style={{ textDecoration: 'none', fontSize: 12, color: 'var(--accent)', fontWeight: 600 }}>
                            Explore Restaurant Menu →
                          </Link>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ) : (
          /* ── 2. ALL BOOKINGS LIST VIEW (Supplementary) ──────────────── */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <section className="customer-res-toolbar" aria-label="Search and filter reservations">
              <div className="customer-res-toolbar__row">
                <div className="customer-res-search-box">
                  <span className="customer-res-search-box__icon"><SearchIcon size={15} /></span>
                  <input
                    type="text"
                    className="customer-res-search-box__input"
                    placeholder="Search by restaurant name, booking ref, area, or notes..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  {search && (
                    <button type="button" className="customer-res-search-box__clear" onClick={() => setSearch('')}>
                      ✕
                    </button>
                  )}
                </div>

                <div className="customer-res-toolbar__controls">
                  <select
                    className="customer-res-sort-select"
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                  >
                    <option value="date-asc">Date: Upcoming First</option>
                    <option value="date-desc">Date: Newest to Oldest</option>
                    <option value="guests-desc">Party Size: Large to Small</option>
                  </select>

                  {isFilterActive && (
                    <button type="button" className="customer-res-clear-btn" onClick={clearAllFilters}>
                      Reset filters
                    </button>
                  )}
                </div>
              </div>

              <div className="customer-res-pills">
                <button
                  type="button"
                  className={`customer-res-pill ${statusFilter === 'all' ? 'is-active' : ''}`}
                  onClick={() => setStatusFilter('all')}
                >
                  All Bookings <span className="customer-res-pill__badge">{counts.all}</span>
                </button>
                <button
                  type="button"
                  className={`customer-res-pill ${statusFilter === 'upcoming' ? 'is-active' : ''}`}
                  onClick={() => setStatusFilter('upcoming')}
                >
                  Upcoming <span className="customer-res-pill__badge">{counts.upcoming}</span>
                </button>
                <button
                  type="button"
                  className={`customer-res-pill ${statusFilter === 'pending' ? 'is-active' : ''}`}
                  onClick={() => setStatusFilter('pending')}
                >
                  Pending Approval <span className="customer-res-pill__badge">{counts.pending}</span>
                </button>
                <button
                  type="button"
                  className={`customer-res-pill ${statusFilter === 'completed' ? 'is-active' : ''}`}
                  onClick={() => setStatusFilter('completed')}
                >
                  Completed <span className="customer-res-pill__badge">{counts.completed}</span>
                </button>
                <button
                  type="button"
                  className={`customer-res-pill ${statusFilter === 'cancelled' ? 'is-active' : ''}`}
                  onClick={() => setStatusFilter('cancelled')}
                >
                  Cancelled <span className="customer-res-pill__badge">{counts.cancelled}</span>
                </button>
              </div>
            </section>

            {filteredReservations.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 'var(--space-12) 0', background: 'var(--surface-primary)', borderRadius: 16, border: '1px solid var(--border-primary)' }}>
                <p style={{ color: 'var(--text-muted)', marginBottom: 'var(--space-4)' }}>
                  {isFilterActive ? 'No reservations match your filters.' : 'You have no table reservations.'}
                </p>
                <Link to="/customer/restaurants" style={{ textDecoration: 'none' }}>
                  <Button variant="primary" size="md">Find a Restaurant Table</Button>
                </Link>
              </div>
            ) : (
              <div className="customer-res-list">
                {filteredReservations.map((res) => {
                  const isConfirmed = ['Approved', 'Confirmed', 'Arrived', 'Seated', 'Completed'].includes(res.status);
                  const isPending = res.status === 'Pending' || res.status === 'Awaiting Payment';
                  const isCancelledOrRejected = ['Cancelled', 'Rejected', 'No-Show', 'Expired'].includes(res.status);
                  const badgeVariant = isConfirmed ? 'success' : isPending ? 'warning' : isCancelledOrRejected ? 'error' : 'default';

                  const canRequestCancel = Boolean(res.canCancel);
                  const refLabel = res.reference || res.id;

                  return (
                    <article
                      key={res.reservationId || res.id}
                      className="customer-res-card customer-reservation-card brand-card brand-card--green"
                    >
                      <div className="customer-res-card__header customer-reservation-card__heading">
                        <div className="customer-res-card__title-area">
                          <div className="customer-res-card__avatar">
                            {(res.restaurantName || 'R').charAt(0).toUpperCase()}
                          </div>
                          <div className="customer-res-card__titles">
                            <div className="customer-reservation-card__title-row">
                              <h2 className="customer-res-card__restaurant-name">
                                <Link to={`/customer/restaurants/${res.restaurantId || ''}`}>
                                  {res.restaurantName}
                                </Link>
                              </h2>
                              <Badge variant={badgeVariant} dot size="sm">
                                {res.status}
                              </Badge>
                            </div>
                            <div className="customer-res-card__meta-bar customer-reservation-card__meta">
                              <span>Booking Ref:</span>
                              <span className="customer-res-card__ref-pill">{refLabel}</span>
                              <span>·</span>
                              <span>Area: <strong>{res.seatingArea}</strong></span>
                            </div>
                          </div>
                        </div>

                        <div className="customer-res-card__header-right customer-reservation-card__actions">
                          {canRequestCancel && (
                            <Button variant="danger-outline" size="sm" onClick={() => handleCancelClick(res)}>
                              Cancel reservation
                            </Button>
                          )}
                        </div>
                      </div>

                      <div className="customer-res-card__details customer-reservation-card__details">
                        <div className="customer-res-detail-item">
                          <span className="customer-res-detail-item__label"><CalendarIcon size={13} /> Date &amp; Time</span>
                          <p className="customer-res-detail-item__value">{res.date} at {res.time}</p>
                        </div>
                        <div className="customer-res-detail-item">
                          <span className="customer-res-detail-item__label"><UsersIcon size={13} /> Party Size</span>
                          <p className="customer-res-detail-item__value">{res.guests} {res.guests === 1 ? 'Guest' : 'Guests'}</p>
                        </div>
                        <div className="customer-res-detail-item">
                          <span className="customer-res-detail-item__label"><TableIcon size={13} /> Seating &amp; Table</span>
                          <p className="customer-res-detail-item__value">
                            {res.seatingArea}
                            {res.assignedTable && ` · Table ${res.assignedTable.name || res.assignedTable.id}`}
                          </p>
                        </div>
                        <div className="customer-res-detail-item">
                          <span className="customer-res-detail-item__label"><CreditCardIcon size={13} /> Reservation fee / payment</span>
                          <p className="customer-res-detail-item__value">
                            ₱{Number(res.depositAmount > 0 ? res.depositAmount : res.serviceFee).toLocaleString('en-PH')} · {res.paymentStatus}
                          </p>
                        </div>
                      </div>

                      {res.depositUnderReview && (
                        <p
                          role="status"
                          style={{
                            margin: '8px 0 0',
                            padding: '8px 10px',
                            borderRadius: 8,
                            background: '#fffbeb',
                            color: '#92400e',
                            fontSize: 12,
                            fontWeight: 600,
                          }}
                        >
                          Cancelled with paid deposit — not automatically refunded; currently under admin review.
                        </p>
                      )}

                      <div className="customer-res-card__footer">
                        <Button variant="secondary" size="sm" onClick={() => handleOpenDetails(res)}>
                          View Full Details
                        </Button>
                        <Link to={`/customer/restaurants/${res.restaurantId || ''}`} style={{ textDecoration: 'none', fontSize: 12, color: 'var(--accent)', fontWeight: 600 }}>
                          Explore Menu →
                        </Link>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Cancellation Request Modal ───────────────────────────────── */}
        <Modal
          open={cancelModalOpen}
          onClose={() => !cancelling && setCancelModalOpen(false)}
          title="Cancel Table Reservation"
          size="sm"
          footer={
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
              <Button variant="ghost" size="sm" onClick={() => setCancelModalOpen(false)} disabled={cancelling}>
                Keep Reservation
              </Button>
              <Button variant="danger" size="sm" onClick={handleConfirmCancel} disabled={cancelling}>
                {cancelling ? 'Cancelling...' : 'Confirm Cancellation'}
              </Button>
            </div>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
              Cancel your reservation{selectedRes ? ` at ${selectedRes.restaurantName} (${selectedRes.reference || selectedRes.id})` : ''}?
              Your assigned table will be released immediately.
            </p>

            {cancelError && (
              <div
                role="alert"
                style={{
                  padding: '10px 12px',
                  borderRadius: 8,
                  background: '#fef2f2',
                  color: '#b91c1c',
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                {cancelError}
              </div>
            )}

            {selectedRes?.depositStatus === 'paid' && (
              <div
                role="note"
                style={{
                  margin: 0,
                  fontSize: 12,
                  color: '#92400e',
                  padding: '10px 12px',
                  borderRadius: 8,
                  background: '#fffbeb',
                  border: '1px solid #fde68a',
                  lineHeight: 1.5,
                }}
              >
                <strong>Paid deposit policy:</strong> Your cancellation will be accepted and your table released,
                but your paid deposit is <strong>not automatically refunded</strong>. Your request will be placed{' '}
                <strong>under admin review</strong>.
              </div>
            )}

            <div>
              <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                Reason for cancellation (optional):
              </label>
              <textarea
                className="textarea"
                rows={2}
                maxLength={255}
                placeholder="Change of schedule, guest illness, etc..."
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                disabled={cancelling}
                style={{ width: '100%' }}
              />
            </div>
          </div>
        </Modal>

        {/* ── Comprehensive Details Modal ─────────────────────────────── */}
        {detailsRes && (
          <Modal
            open={Boolean(detailsRes)}
            onClose={() => setDetailsRes(null)}
            title={`Reservation Particulars · ${detailsRes.reference || detailsRes.id}`}
            size="md"
            footer={
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                {detailsRes.canCancel ? (
                  <Button
                    variant="danger-outline"
                    size="sm"
                    onClick={() => {
                      const target = detailsRes;
                      setDetailsRes(null);
                      handleCancelClick(target);
                    }}
                  >
                    Cancel Reservation
                  </Button>
                ) : <span />}

                <Button variant="primary" size="sm" onClick={() => setDetailsRes(null)}>
                  Close
                </Button>
              </div>
            }
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 'var(--space-3)', fontSize: 13 }}>
                <div>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block' }}>Restaurant</span>
                  <strong>{detailsRes.restaurantName}</strong>
                  {detailsRes.restaurantAddress && (
                    <span style={{ display: 'block', fontSize: 11, color: 'var(--text-secondary)' }}>
                      {detailsRes.restaurantAddress}
                    </span>
                  )}
                  {detailsRes.restaurantPhone && (
                    <span style={{ display: 'block', fontSize: 11, color: 'var(--text-secondary)' }}>
                      <PhoneIcon size={12} /> {detailsRes.restaurantPhone}
                    </span>
                  )}
                </div>
                <div>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block' }}>Booking Reference</span>
                  <strong style={{ fontFamily: 'monospace' }}>{detailsRes.reference || detailsRes.id}</strong>
                </div>
                <div>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block' }}>Date &amp; Arrival Time</span>
                  <strong>{detailsRes.date} at {detailsRes.time}</strong>
                </div>
                <div>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block' }}>Party Size</span>
                  <strong>{detailsRes.guests} {detailsRes.guests === 1 ? 'Guest' : 'Guests'}</strong>
                </div>
                <div>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block' }}>Seating Area</span>
                  <strong>{detailsRes.seatingArea}</strong>
                </div>
                <div>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block' }}>Assigned Table</span>
                  <strong>{detailsRes.assignedTable ? `Table ${detailsRes.assignedTable.name || detailsRes.assignedTable.id}` : 'Assigned upon arrival'}</strong>
                </div>
              </div>

              {/* Status explanation */}
              <div style={{ padding: 12, background: 'var(--surface-secondary)', borderRadius: 10, fontSize: 13 }}>
                <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Status Update</span>
                <p style={{ margin: '4px 0 0', color: 'var(--text-primary)' }}>
                  Current Status: <strong>{detailsRes.status}</strong>
                  {detailsRes.status === 'Pending' && ' — Awaiting restaurant host review.'}
                  {['Approved', 'Confirmed'].includes(detailsRes.status) && ' — Your table is confirmed! Please arrive 5–10 minutes prior.'}
                  {detailsRes.rejectionReason && ` — Declined: "${detailsRes.rejectionReason}"`}
                  {detailsRes.cancellationReason && ` — Cancelled: "${detailsRes.cancellationReason}"`}
                </p>
                {detailsRes.cancellationDeadline && (
                  <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--text-muted)' }}>
                    Online cancellation cutoff: {formatManilaDateTime(detailsRes.cancellationDeadline)}
                  </p>
                )}
              </div>

              {/* Deposit Payment & Refund Status */}
              {Number(detailsRes.depositAmount || 0) > 0 && (
                <div style={{ padding: 12, border: '1px solid var(--border-primary)', borderRadius: 10, fontSize: 13 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                      Reservation Deposit · ₱{Number(detailsRes.depositAmount).toFixed(2)}
                    </span>
                    <Badge
                      variant={
                        detailsRes.depositStatus === 'paid'
                          ? 'success'
                          : detailsRes.depositStatus === 'refunded'
                            ? 'info'
                            : 'warning'
                      }
                      size="sm"
                    >
                      {detailsRes.paymentStatus}
                    </Badge>
                  </div>

                  {depositError && (
                    <p role="alert" style={{ margin: '8px 0 0', color: '#b91c1c', fontSize: 12, fontWeight: 600 }}>
                      {depositError}
                    </p>
                  )}

                  {detailsRes.depositUnderReview && (
                    <p role="status" style={{ margin: '8px 0 0', padding: '8px 10px', borderRadius: 8, background: '#fffbeb', color: '#92400e', fontSize: 12, fontWeight: 600 }}>
                      Reservation cancelled with paid deposit — not automatically refunded; currently under admin review.
                    </p>
                  )}

                  {detailsRes.latestRefund && (
                    <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>
                      Refund ({detailsRes.latestRefund.payment_reference}): <strong>{detailsRes.latestRefund.refund_status}</strong> · ₱{Number(detailsRes.latestRefund.amount).toFixed(2)}
                    </p>
                  )}

                  {detailsRes.rawStatus === 'awaiting_payment' && detailsRes.depositStatus === 'pending' && (
                    <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {(!detailsRes.latestPayment || ['failed', 'expired', 'voided', 'cancelled'].includes(detailsRes.latestPayment.payment_status)) ? (
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                          <select
                            value={depositChannel}
                            onChange={(e) => setDepositChannel(e.target.value)}
                            disabled={depositBusy}
                            aria-label="Deposit payment method"
                            style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border-primary)', fontSize: 12 }}
                          >
                            <option value="gcash">GCash</option>
                            <option value="maya">Maya</option>
                            <option value="card">Card</option>
                          </select>
                          <Button variant="primary" size="sm" onClick={handleInitiateDeposit} disabled={depositBusy}>
                            {depositBusy ? 'Initiating...' : `Pay Deposit (₱${Number(detailsRes.depositAmount).toFixed(2)})`}
                          </Button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                          {detailsRes.latestPayment.checkout_url ? (
                            <a
                              href={detailsRes.latestPayment.checkout_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)' }}
                            >
                              Open Payment Page ↗
                            </a>
                          ) : (
                            <>
                              <Button
                                variant="primary"
                                size="sm"
                                onClick={() => handleConfirmSandboxDeposit(detailsRes.latestPayment.payment_id)}
                                disabled={depositBusy}
                              >
                                {depositBusy ? 'Processing...' : `Complete Sandbox Payment (₱${Number(detailsRes.depositAmount).toFixed(2)})`}
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleFailSandboxDeposit(detailsRes.latestPayment.payment_id)}
                                disabled={depositBusy}
                              >
                                Simulate Failure
                              </Button>
                            </>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => refreshDetailsFromServer(detailsRes.reservationId || detailsRes.id)}
                            disabled={depositBusy}
                          >
                            Refresh Status
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Special Requests */}
              {detailsRes.specialRequests && (
                <div style={{ fontSize: 13 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block' }}>Special Requests</span>
                  <p style={{ margin: '2px 0 0', fontStyle: 'italic' }}>"{detailsRes.specialRequests}"</p>
                </div>
              )}

              {/* Linked Dine-In Pre-Order */}
              <div style={{ padding: 12, borderRadius: 10, border: '1px solid var(--border-primary)', background: 'var(--bg-secondary, #f8fafc)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <div>
                    <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', display: 'block' }}>
                      Dine-In Menu Pre-Order
                    </span>
                    {detailsRes.preOrder ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                        <strong style={{ fontSize: 13 }}>{detailsRes.preOrder.orderReference}</strong>
                        <Badge variant={detailsRes.preOrder.orderStatus === 'ready' || detailsRes.preOrder.orderStatus === 'completed' ? 'success' : detailsRes.preOrder.orderStatus === 'cancelled' || detailsRes.preOrder.orderStatus === 'rejected' ? 'default' : 'info'}>
                          {detailsRes.preOrder.statusLabel}
                        </Badge>
                      </div>
                    ) : (
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>No dishes pre-ordered yet.</span>
                    )}
                  </div>

                  {(['pending', 'approved', 'awaiting_payment', 'confirmed'].includes(detailsRes.rawStatus) && (!detailsRes.preOrder || detailsRes.preOrder.canCustomerEdit)) && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        setPreOrderError('');
                        setPreOrderModalOpen(true);
                        const existing = detailsRes.preOrder;
                        setPreOrderEditNotes(existing?.notes || '');
                        setPreOrderEditItems(
                          existing && !['cancelled', 'rejected', 'completed'].includes(existing.orderStatus)
                            ? existing.items.map((it) => {
                                const addOns = (it.addOns || []).map((ao) => ({
                                  id: Number(ao.addOnOptionId || 0),
                                  groupName: ao.groupName,
                                  name: ao.optionName,
                                  price: Number(ao.additionalPrice || 0),
                                }));
                                const optIds = addOns.map((ao) => ao.id).filter((n) => n > 0).sort((a, b) => a - b).join(',');
                                return {
                                  lineKey: `${Number(it.menuItemId)}:${optIds}:${String(it.specialInstructions || '').trim()}`,
                                  menuItemId: Number(it.menuItemId),
                                  name: it.itemName,
                                  image: it.photoImage || null,
                                  unitPrice: Number(it.unitPrice || 0),
                                  quantity: Number(it.quantity || 1),
                                  addOns,
                                  addOnOptionIds: addOns.map((ao) => ao.id).filter((n) => n > 0),
                                  specialInstructions: it.specialInstructions || '',
                                };
                              })
                            : [],
                        );
                        setPreOrderMenuLoading(true);
                        try {
                          const loaded = await publicRestaurantService.getRestaurantWithMenu(detailsRes.restaurantId);
                          setPreOrderRestaurant(loaded);
                        } catch {
                          setPreOrderError('Failed to load restaurant menu.');
                        } finally {
                          setPreOrderMenuLoading(false);
                        }
                      }}
                    >
                      {detailsRes.preOrder && !['cancelled', 'rejected'].includes(detailsRes.preOrder.orderStatus)
                        ? 'Edit Pre-Order'
                        : 'Add Menu Pre-Order'}
                    </Button>
                  )}
                </div>

                {detailsRes.preOrder && (
                  <>
                    {detailsRes.preOrder.editBlockedReason && !detailsRes.preOrder.canCustomerEdit && (
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', padding: '6px 10px', borderRadius: 6, background: 'rgba(245, 158, 11, 0.1)' }}>
                        {detailsRes.preOrder.editBlockedReason}
                      </div>
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {detailsRes.preOrder.items.map((item) => (
                        <div key={item.orderItemId || `${item.menuItemId}-${item.itemName}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, fontSize: 12, paddingBottom: 4, borderBottom: '1px solid var(--border-secondary)' }}>
                          <div>
                            <strong>{item.quantity}× {item.itemName}</strong>
                            {item.addOns?.length > 0 && (
                              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                {item.addOns.map((ao) => ao.optionName).join(', ')}
                              </div>
                            )}
                            {item.specialInstructions && (
                              <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                                Note: {item.specialInstructions}
                              </div>
                            )}
                          </div>
                          <strong>₱{Number(item.lineTotal || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                        </div>
                      ))}
                    </div>
                    {detailsRes.preOrder.notes && (
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        <strong>Kitchen Notes:</strong> {detailsRes.preOrder.notes}
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-muted)' }}>
                      <span>Delivery Fee (Dine-In)</span>
                      <span>₱0.00</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700 }}>
                      <span>Pre-Order Total ({detailsRes.preOrder.itemCount} items)</span>
                      <span>₱{Number(detailsRes.preOrder.totalAmount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                  </>
                )}
              </div>

              {/* Restaurant Reservation Policy Notes */}
              {detailsRes.reservationNotes && (
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block' }}>Restaurant Policy Notes</span>
                  <p style={{ margin: '2px 0 0' }}>{detailsRes.reservationNotes}</p>
                </div>
              )}

              {/* Status History Timeline */}
              {detailsLoading ? (
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Loading activity history…</span>
              ) : Array.isArray(detailsRes.history) && detailsRes.history.length > 0 && (
                <div>
                  <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
                    Status Timeline
                  </span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {detailsRes.history.map((item) => (
                      <div
                        key={item.historyId || `${item.toStatus}-${item.createdAt}`}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'baseline',
                          gap: 8,
                          fontSize: 12,
                          padding: '6px 10px',
                          background: 'var(--bg-secondary, #f8fafc)',
                          borderRadius: 6,
                        }}
                      >
                        <div>
                          <strong>{item.toStatusLabel || item.toStatus}</strong>
                          {item.note && <span style={{ color: 'var(--text-secondary)' }}> — {item.note}</span>}
                        </div>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                          {formatManilaDateTime(item.createdAt)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Modal>
        )}
        {detailsRes && preOrderModalOpen && (
          <Modal
            open={preOrderModalOpen}
            onClose={() => !preOrderBusy && setPreOrderModalOpen(false)}
            title={`Edit Dine-In Pre-Order · ${detailsRes.reference || detailsRes.id}`}
            size="lg"
            footer={
              <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', gap: 8 }}>
                <Button variant="outline" size="sm" onClick={() => setPreOrderModalOpen(false)} disabled={preOrderBusy}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  loading={preOrderBusy}
                  disabled={preOrderBusy}
                  onClick={async () => {
                    setPreOrderBusy(true);
                    setPreOrderError('');
                    try {
                      const updatedPreOrder = await customerService.updateReservationPreOrder(
                        detailsRes.reservationId || detailsRes.id,
                        {
                          items: preOrderEditItems.map((entry) => ({
                            menuItemId: entry.menuItemId,
                            quantity: entry.quantity,
                            addOnOptionIds: entry.addOnOptionIds || [],
                            specialInstructions: entry.specialInstructions || null,
                          })),
                          notes: preOrderEditNotes,
                        },
                      );
                      setDetailsRes((prev) => (prev ? { ...prev, preOrder: updatedPreOrder } : prev));
                      setPreOrderModalOpen(false);
                      setSuccessBanner(updatedPreOrder ? 'Reservation pre-order updated.' : 'Reservation pre-order cancelled.');
                      loadReservations();
                    } catch (err) {
                      setPreOrderError(err?.message || 'Unable to update pre-order.');
                    } finally {
                      setPreOrderBusy(false);
                    }
                  }}
                >
                  {preOrderEditItems.length === 0 ? 'Cancel Pre-Order' : 'Save Pre-Order'}
                </Button>
              </div>
            }
          >
            {preOrderError && (
              <div role="alert" style={{ marginBottom: 12, padding: 10, borderRadius: 8, background: '#fef2f2', color: '#b91c1c', fontSize: 12, fontWeight: 600 }}>
                {preOrderError}
              </div>
            )}
            <ReservationPreOrderSection
              restaurant={preOrderRestaurant || { id: detailsRes.restaurantId, name: detailsRes.restaurantName, menu: [] }}
              menuLoading={preOrderMenuLoading}
              preOrderItems={preOrderEditItems}
              onChangeItems={setPreOrderEditItems}
              preOrderNotes={preOrderEditNotes}
              onChangeNotes={setPreOrderEditNotes}
            />
          </Modal>
        )}
      </div>
    </CustomerLayout>
  );
}
