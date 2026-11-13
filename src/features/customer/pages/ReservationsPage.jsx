import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import CustomerLayout from '../../../layouts/CustomerLayout';
import customerService from '../../../services/customerService';
import Button from '../../../components/common/Button';
import Badge from '../../../components/common/Badge';
import Modal from '../../../components/common/Modal';
import './CustomerRecords.css';
import './CustomerReservationsPage.css';

function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function ReservationsPage() {
  const [reservations, setReservations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
  const [selectedResId, setSelectedResId] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [detailsRes, setDetailsRes] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

  const todayKey = localDateKey(new Date());

  useEffect(() => {
    const refresh = () => {
      try {
        setError('');
        setReservations(customerService.getReservations());
      } catch (loadError) {
        setError(loadError.message || 'Unable to load your reservations.');
      } finally {
        setLoading(false);
      }
    };
    refresh();
    window.addEventListener('salo:demoStoreUpdated', refresh);
    return () => window.removeEventListener('salo:demoStoreUpdated', refresh);
  }, []);

  // Summary counts
  const counts = useMemo(() => {
    let upcoming = 0;
    let pending = 0;
    let completed = 0;
    let cancelled = 0;

    reservations.forEach((r) => {
      const s = r.status;
      if (['Approved', 'Confirmed', 'Arrived', 'Seated'].includes(s)) {
        upcoming += 1;
      } else if (s === 'Pending') {
        pending += 1;
      } else if (s === 'Completed') {
        completed += 1;
      } else if (['Cancelled', 'Rejected', 'No-Show', 'Expired'].includes(s)) {
        cancelled += 1;
      }
    });

    return {
      all: reservations.length,
      upcoming,
      pending,
      completed,
      cancelled,
    };
  }, [reservations]);

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
          if (!['Approved', 'Confirmed', 'Arrived', 'Seated'].includes(res.status)) return false;
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
          const matchRef = res.id?.toLowerCase().includes(q);
          const matchArea = res.seatingArea?.toLowerCase().includes(q);
          const matchNote = res.specialRequests?.toLowerCase().includes(q);
          if (!matchRestaurant && !matchRef && !matchArea && !matchNote) return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'date-desc') {
          return new Date(`${b.date} ${b.time}`) - new Date(`${a.date} ${a.time}`);
        }
        if (sortBy === 'guests-desc') {
          return (Number(b.guests) || 0) - (Number(a.guests) || 0);
        }
        return new Date(`${a.date} ${a.time}`) - new Date(`${b.date} ${b.time}`);
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

  // Handlers
  const handleCancelClick = (id) => {
    setSelectedResId(id);
    setCancelReason('');
    setCancelModalOpen(true);
  };

  const handleConfirmCancel = () => {
    if (selectedResId) {
      try {
        setError('');
        const updated = customerService.cancelReservation(selectedResId);
        setReservations(updated);
        setCancelModalOpen(false);
        if (detailsRes?.id === selectedResId) setDetailsRes(null);
      } catch (cancelError) {
        setError(cancelError.message || 'Unable to request cancellation.');
      }
    }
  };

  const copyRefToClipboard = (id) => {
    if (!id) return;
    try {
      navigator.clipboard.writeText(id);
      setCopiedId(id);
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
          <div role="alert" className="form-error" style={{ marginBottom: 'var(--space-2)' }}>
            {error}
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
              📅 Reservation Calendar
            </button>
            <button
              type="button"
              className={`customer-cal-nav__tab ${viewMode === 'list' ? 'is-active' : ''}`}
              onClick={() => setViewMode('list')}
            >
              📋 All Bookings List
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
                            const isPend = b.status === 'Pending';
                            const isComp = b.status === 'Completed';
                            const chipType = isConf ? 'confirmed' : isPend ? 'pending' : isComp ? 'completed' : 'cancelled';

                            return (
                              <span
                                key={b.id}
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
                    📅 Schedule for {new Date(`${selectedCalendarDate}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
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
                    const isPending = res.status === 'Pending';
                    const isCancelledOrRejected = ['Cancelled', 'Rejected', 'No-Show', 'Expired'].includes(res.status);
                    const badgeVariant = isConfirmed ? 'success' : isPending ? 'warning' : isCancelledOrRejected ? 'error' : 'default';

                    const canRequestCancel =
                      !['Cancelled', 'Rejected', 'Completed', 'No-Show', 'Expired'].includes(res.status) &&
                      !['requested', 'approved'].includes(res.cancellationRequest?.status);

                    const restaurantInitial = (res.restaurantName || 'R').charAt(0).toUpperCase();

                    return (
                      <article
                        key={res.id}
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
                                  <Link to={`/customer/restaurant/${res.restaurantId || ''}`}>
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
                                  #{res.id}
                                  <button
                                    type="button"
                                    className="customer-res-card__copy-btn"
                                    title="Copy booking reference"
                                    onClick={() => copyRefToClipboard(res.id)}
                                  >
                                    {copiedId === res.id ? '✓' : '⧉'}
                                  </button>
                                </span>
                                <span>·</span>
                                <span>Area: <strong>{res.seatingArea}</strong></span>
                              </div>
                            </div>
                          </div>

                          <div className="customer-res-card__header-right customer-reservation-card__actions">
                            {canRequestCancel && (
                              <Button variant="danger-outline" size="sm" onClick={() => handleCancelClick(res.id)}>
                                Request cancellation
                              </Button>
                            )}
                            {res.cancellationRequest?.status === 'requested' && (
                              <Badge variant="warning" size="sm">
                                Cancellation under review
                              </Badge>
                            )}
                          </div>
                        </div>

                        {res.status === 'Rejected' && (
                          <div className="customer-res-card__alert customer-res-card__alert--danger" role="alert">
                            <span style={{ fontSize: 16 }}>⚠️</span>
                            <div>
                              <strong>Reservation Declined by Restaurant</strong>
                              <span style={{ display: 'block', marginTop: 2 }}>
                                {res.rejectionReason || 'The restaurant was unable to accommodate this reservation request. Any held deposit has been released.'}
                              </span>
                            </div>
                          </div>
                        )}

                        <div className="customer-res-card__details customer-reservation-card__details">
                          <div className="customer-res-detail-item">
                            <span className="customer-res-detail-item__label">📅 Date &amp; Time</span>
                            <p className="customer-res-detail-item__value">{res.date} at {res.time}</p>
                          </div>
                          <div className="customer-res-detail-item">
                            <span className="customer-res-detail-item__label">👥 Party Size</span>
                            <p className="customer-res-detail-item__value">{res.guests} Guests</p>
                          </div>
                          <div className="customer-res-detail-item">
                            <span className="customer-res-detail-item__label">🪑 Seating &amp; Table</span>
                            <p className="customer-res-detail-item__value">
                              {res.seatingArea}
                              {res.assignedTable && ` · Table ${res.assignedTable.name || res.assignedTable.id}`}
                            </p>
                          </div>
                          <div className="customer-res-detail-item">
                            <span className="customer-res-detail-item__label">💳 Reservation fee / payment</span>
                            <p className="customer-res-detail-item__value">
                              ₱{res.fee ?? res.depositAmount ?? 0} · {res.paymentStatus || 'Pending'}
                            </p>
                          </div>
                        </div>

                        {res.specialRequests && (
                          <div className="customer-reservation-card__note" style={{ padding: '8px 20px', fontSize: 12, color: 'var(--text-secondary)' }}>
                            <strong>Note to restaurant:</strong> {res.specialRequests}
                          </div>
                        )}

                        <div className="customer-res-card__footer">
                          <Button variant="secondary" size="sm" onClick={() => setDetailsRes(res)}>
                            View Full Details
                          </Button>
                          <Link to={`/customer/restaurant/${res.restaurantId || ''}`} style={{ textDecoration: 'none', fontSize: 12, color: 'var(--accent)', fontWeight: 600 }}>
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
                  <span className="customer-res-search-box__icon">🔍</span>
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
                  const isPending = res.status === 'Pending';
                  const isCancelledOrRejected = ['Cancelled', 'Rejected', 'No-Show', 'Expired'].includes(res.status);
                  const badgeVariant = isConfirmed ? 'success' : isPending ? 'warning' : isCancelledOrRejected ? 'error' : 'default';

                  const canRequestCancel =
                    !['Cancelled', 'Rejected', 'Completed', 'No-Show', 'Expired'].includes(res.status) &&
                    !['requested', 'approved'].includes(res.cancellationRequest?.status);

                  return (
                    <article
                      key={res.id}
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
                                <Link to={`/customer/restaurant/${res.restaurantId || ''}`}>
                                  {res.restaurantName}
                                </Link>
                              </h2>
                              <Badge variant={badgeVariant} dot size="sm">
                                {res.status}
                              </Badge>
                            </div>
                            <div className="customer-res-card__meta-bar customer-reservation-card__meta">
                              <span>Booking Ref:</span>
                              <span className="customer-res-card__ref-pill">#{res.id}</span>
                              <span>·</span>
                              <span>Area: <strong>{res.seatingArea}</strong></span>
                            </div>
                          </div>
                        </div>

                        <div className="customer-res-card__header-right customer-reservation-card__actions">
                          {canRequestCancel && (
                            <Button variant="danger-outline" size="sm" onClick={() => handleCancelClick(res.id)}>
                              Request cancellation
                            </Button>
                          )}
                          {res.cancellationRequest?.status === 'requested' && (
                            <Badge variant="warning" size="sm">Cancellation under review</Badge>
                          )}
                        </div>
                      </div>

                      <div className="customer-res-card__details customer-reservation-card__details">
                        <div className="customer-res-detail-item">
                          <span className="customer-res-detail-item__label">📅 Date &amp; Time</span>
                          <p className="customer-res-detail-item__value">{res.date} at {res.time}</p>
                        </div>
                        <div className="customer-res-detail-item">
                          <span className="customer-res-detail-item__label">👥 Party Size</span>
                          <p className="customer-res-detail-item__value">{res.guests} Guests</p>
                        </div>
                        <div className="customer-res-detail-item">
                          <span className="customer-res-detail-item__label">🪑 Seating &amp; Table</span>
                          <p className="customer-res-detail-item__value">
                            {res.seatingArea}
                            {res.assignedTable && ` · Table ${res.assignedTable.name || res.assignedTable.id}`}
                          </p>
                        </div>
                        <div className="customer-res-detail-item">
                          <span className="customer-res-detail-item__label">💳 Reservation fee / payment</span>
                          <p className="customer-res-detail-item__value">
                            ₱{res.fee ?? res.depositAmount ?? 0} · {res.paymentStatus || 'Pending'}
                          </p>
                        </div>
                      </div>

                      <div className="customer-res-card__footer">
                        <Button variant="secondary" size="sm" onClick={() => setDetailsRes(res)}>
                          View Full Details
                        </Button>
                        <Link to={`/customer/restaurant/${res.restaurantId || ''}`} style={{ textDecoration: 'none', fontSize: 12, color: 'var(--accent)', fontWeight: 600 }}>
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
          onClose={() => setCancelModalOpen(false)}
          title="Request Reservation Cancellation"
          size="sm"
          footer={
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
              <Button variant="ghost" size="sm" onClick={() => setCancelModalOpen(false)}>
                Keep Reservation
              </Button>
              <Button variant="danger" size="sm" onClick={handleConfirmCancel}>
                Confirm Cancellation
              </Button>
            </div>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
              This sends a cancellation request to the restaurant. Your reservation remains active until the restaurant reviews and processes it. Any fee or refund will be confirmed after review.
            </p>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                Reason for cancellation (optional):
              </label>
              <textarea
                className="textarea"
                rows={2}
                placeholder="Change of schedule, guest illness, etc..."
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
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
            title={`Reservation Particulars · #${detailsRes.id}`}
            size="md"
            footer={
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                {!['Cancelled', 'Rejected', 'Completed', 'No-Show', 'Expired'].includes(detailsRes.status) &&
                !['requested', 'approved'].includes(detailsRes.cancellationRequest?.status) ? (
                  <Button
                    variant="danger-outline"
                    size="sm"
                    onClick={() => {
                      const id = detailsRes.id;
                      setDetailsRes(null);
                      handleCancelClick(id);
                    }}
                  >
                    Request Cancellation
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
                </div>
                <div>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block' }}>Booking Reference</span>
                  <strong style={{ fontFamily: 'monospace' }}>#{detailsRes.id}</strong>
                </div>
                <div>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block' }}>Date &amp; Arrival Time</span>
                  <strong>{detailsRes.date} at {detailsRes.time}</strong>
                </div>
                <div>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block' }}>Party Size</span>
                  <strong>{detailsRes.guests} Guests</strong>
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
                  {detailsRes.status === 'Pending' && ' — Awaiting restaurant review.'}
                  {['Approved', 'Confirmed'].includes(detailsRes.status) && ' — Your table is confirmed! Please arrive 5-10 minutes prior.'}
                  {detailsRes.rejectionReason && ` — Reason: "${detailsRes.rejectionReason}"`}
                </p>
              </div>

              {/* Special Requests */}
              {detailsRes.specialRequests && (
                <div style={{ fontSize: 13 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block' }}>Special Requests</span>
                  <p style={{ margin: '2px 0 0', fontStyle: 'italic' }}>"{detailsRes.specialRequests}"</p>
                </div>
              )}
            </div>
          </Modal>
        )}
      </div>
    </CustomerLayout>
  );
}
