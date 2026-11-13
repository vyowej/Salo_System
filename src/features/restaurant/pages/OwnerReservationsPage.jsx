import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import OwnerLayout from '../../../layouts/OwnerLayout';
import ownerService from '../../../services/ownerService';
import Button from '../../../components/common/Button';
import Badge from '../../../components/common/Badge';
import Modal from '../../../components/common/Modal';
import { EmptyState, ErrorState, LoadingSpinner } from '../../../components/feedback';
import { useRestaurantAccess } from '../access/useRestaurantAccess';
import {
  computeDayAvailability,
  getMonthAvailabilityMap,
  computeReservationStats,
  STANDARD_TIME_SLOTS,
  getStoredBlockedSlots,
  saveStoredBlockedSlots,
  getStoredSlotCapacity,
  saveStoredSlotCapacity,
} from '../../../services/demo/reservationAvailability';
import './OwnerReservationsPage.css';

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
  if (['Cancelled', 'Rejected', 'No-Show', 'Expired'].includes(status)) return 'error';
  return 'default';
}

function getInitials(name) {
  const trimmed = (name || 'Guest').trim();
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export default function OwnerReservationsPage() {
  const access = useRestaurantAccess();
  const { selectedRestaurantId } = access;
  const [restaurant, setRestaurant] = useState(null);
  const [tables, setTables] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [savingAction, setSavingAction] = useState(false);

  // Statistics range: 'all' | 'today' | 'week' | 'month'
  const [statsRange, setStatsRange] = useState('all');

  // Filters and search
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  const [sortBy, setSortBy] = useState('datetime-asc');
  const [pageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  // Calendar views: 'month' | 'week' | 'day' | 'agenda'
  const [calendarMode, setCalendarMode] = useState('month');
  const [calendarDate, setCalendarDate] = useState(() => new Date());
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(() => localDateKey(new Date()));

  // Modals state
  const [detailsRes, setDetailsRes] = useState(null);
  const [rejectRes, setRejectRes] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectError, setRejectError] = useState('');
  const [declineRes, setDeclineRes] = useState(null);
  const [declineReason, setDeclineReason] = useState('');
  const [copiedId, setCopiedId] = useState(null);

  // Manage Availability Modal State
  const [availabilityModalOpen, setAvailabilityModalOpen] = useState(false);
  const [availActiveTab, setAvailActiveTab] = useState('dates'); // 'dates' | 'slots' | 'capacity' | 'hours'
  const [blockedSlots, setBlockedSlots] = useState([]);
  const [newBlockDate, setNewBlockDate] = useState(() => localDateKey(new Date()));
  const [newBlockTime, setNewBlockTime] = useState('1:00 PM');
  const [newBlockReason, setNewBlockReason] = useState('Private Event');
  const [customSlotCapacity, setCustomSlotCapacity] = useState(24);

  // Block Date Range State (Temporary Closures)
  const [newClosureStart, setNewClosureStart] = useState(() => localDateKey(new Date()));
  const [newClosureEnd, setNewClosureEnd] = useState(() => localDateKey(new Date()));
  const [newClosureType, setNewClosureType] = useState('Holiday');
  const [newClosureReason, setNewClosureReason] = useState('');

  // Table assignments
  const [tableChoices, setTableChoices] = useState({});
  const [selectedTableMap, setSelectedTableMap] = useState({});

  const can = (permission) => access.canAccess([permission]);
  const todayKey = localDateKey(new Date());

  const loadReservations = useCallback(() => {
    setLoading(true);
    setError('');
    try {
      const res = ownerService.getReservations(selectedRestaurantId);
      setReservations(res);
      const rest = ownerService.getRestaurant(selectedRestaurantId);
      setRestaurant(rest);
      const tbls = ownerService.getTables ? ownerService.getTables(selectedRestaurantId) : [];
      setTables(tbls || []);
      const storedBlocks = getStoredBlockedSlots(selectedRestaurantId);
      setBlockedSlots(storedBlocks);
      const cap = getStoredSlotCapacity(selectedRestaurantId, rest?.slotCapacity || 24);
      setCustomSlotCapacity(cap);
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

  const showSuccessFeedback = (msg) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(''), 3000);
  };

  const runAction = (action, successMsg = 'Reservation updated successfully.') => {
    setError('');
    setSavingAction(true);
    try {
      action();
      loadReservations();
      showSuccessFeedback(successMsg);
    } catch (actionError) {
      setError(actionError.message || 'Unable to update this reservation.');
    } finally {
      setSavingAction(false);
    }
  };

  const loadTableChoices = (reservation) => {
    if (!reservation) return;
    try {
      const choices = ownerService.getReservationTables(selectedRestaurantId, reservation.id);
      setTableChoices((prev) => ({ ...prev, [reservation.id]: choices }));
      setSelectedTableMap((prev) => ({
        ...prev,
        [reservation.id]: reservation.assignedTable?.id || '',
      }));
    } catch {
      // ignore
    }
  };

  // ── Metrics Calculation (Section 2) ──────────────────────────
  const summaryStats = useMemo(() => {
    return computeReservationStats(reservations, statsRange, new Date());
  }, [reservations, statsRange]);

  // ── Month Calendar Matrix Generation (Section 3.A) ───────────
  const calendarDays = useMemo(() => {
    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();

    const firstDayOfMonth = new Date(year, month, 1);
    const startDayIndex = (firstDayOfMonth.getDay() + 6) % 7; // Monday = 0
    const totalDaysInMonth = new Date(year, month + 1, 0).getDate();
    const days = [];

    const prevMonthDays = new Date(year, month, 0).getDate();
    for (let i = startDayIndex - 1; i >= 0; i--) {
      days.push({
        date: new Date(year, month - 1, prevMonthDays - i),
        isOutsideMonth: true,
      });
    }

    for (let d = 1; d <= totalDaysInMonth; d++) {
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

  // Month-level availability
  const monthAvailability = useMemo(() => {
    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();
    return getMonthAvailabilityMap(year, month, restaurant, reservations, 1, tables, blockedSlots);
  }, [calendarDate, restaurant, reservations, tables, blockedSlots]);

  // Daily schedule data for selected date (Section 3.C)
  const selectedDateSchedule = useMemo(() => {
    const targetDate = selectedCalendarDate || todayKey;
    return computeDayAvailability(targetDate, restaurant, reservations, 1, tables, blockedSlots);
  }, [selectedCalendarDate, todayKey, restaurant, reservations, tables, blockedSlots]);

  // Week view days (Section 3.B)
  const weekDays = useMemo(() => {
    const current = new Date(calendarDate);
    const dayIndex = (current.getDay() + 6) % 7;
    const monday = new Date(current);
    monday.setDate(current.getDate() - dayIndex);

    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const key = localDateKey(d);
      const dayBookings = reservations.filter(
        (r) => r.date === key && (statusFilter === 'all' || r.status.toLowerCase() === statusFilter.toLowerCase())
      );
      days.push({
        date: d,
        dateKey: key,
        bookings: dayBookings,
        isToday: key === todayKey,
        isSelected: key === selectedCalendarDate,
      });
    }
    return days;
  }, [calendarDate, reservations, statusFilter, todayKey, selectedCalendarDate]);

  // Agenda view grouped reservations (Section 3.D)
  const agendaGrouped = useMemo(() => {
    const groups = {};
    const sorted = [...reservations].sort((a, b) => new Date(`${a.date} ${a.time}`) - new Date(`${b.date} ${b.time}`));
    sorted.forEach((r) => {
      if (!r.date) return;
      if (statusFilter !== 'all') {
        if (statusFilter === 'pending' && r.status !== 'Pending') return;
        if (statusFilter === 'confirmed' && !['Approved', 'Confirmed'].includes(r.status)) return;
        if (statusFilter === 'seated' && r.status !== 'Seated') return;
        if (statusFilter === 'completed' && r.status !== 'Completed') return;
        if (statusFilter === 'cancelled' && !['Cancelled', 'Rejected', 'No-Show'].includes(r.status)) return;
      }
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const matchName = (r.guestName || r.customerName || '').toLowerCase().includes(q);
        const matchRef = (r.id || '').toLowerCase().includes(q);
        if (!matchName && !matchRef) return;
      }
      if (!groups[r.date]) groups[r.date] = [];
      groups[r.date].push(r);
    });
    return groups;
  }, [reservations, statusFilter, search]);

  // Filtered reservations for Management Table (Section 5)
  const filteredTableReservations = useMemo(() => {
    return reservations
      .filter((res) => {
        if (statusFilter !== 'all') {
          if (statusFilter === 'pending' && res.status !== 'Pending') return false;
          if (statusFilter === 'confirmed' && !['Approved', 'Confirmed'].includes(res.status)) return false;
          if (statusFilter === 'seated' && res.status !== 'Seated') return false;
          if (statusFilter === 'completed' && res.status !== 'Completed') return false;
          if (statusFilter === 'cancelled' && !['Cancelled', 'Rejected', 'No-Show'].includes(res.status)) return false;
        }

        if (dateFilter === 'today' && res.date !== todayKey) return false;
        if (dateFilter === 'selected' && selectedCalendarDate && res.date !== selectedCalendarDate) return false;
        if (dateFilter === 'week') {
          const cur = new Date();
          const dayIdx = (cur.getDay() + 6) % 7;
          const mon = new Date(cur);
          mon.setDate(cur.getDate() - dayIdx);
          const sun = new Date(mon);
          sun.setDate(mon.getDate() + 6);
          const monKey = localDateKey(mon);
          const sunKey = localDateKey(sun);
          if (res.date < monKey || res.date > sunKey) return false;
        }

        if (search.trim()) {
          const q = search.trim().toLowerCase();
          const matchName = (res.guestName || res.customerName || '').toLowerCase().includes(q);
          const matchRef = (res.id || '').toLowerCase().includes(q);
          const matchPhone = (res.guestPhone || res.customerPhone || '').toLowerCase().includes(q);
          const matchArea = (res.seatingArea || '').toLowerCase().includes(q);
          if (!matchName && !matchRef && !matchPhone && !matchArea) return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'datetime-desc') {
          return new Date(`${b.date} ${b.time}`) - new Date(`${a.date} ${a.time}`);
        }
        if (sortBy === 'guests-desc') {
          return (Number(b.guests || b.partySize) || 0) - (Number(a.guests || a.partySize) || 0);
        }
        return new Date(`${a.date} ${a.time}`) - new Date(`${b.date} ${b.time}`);
      });
  }, [reservations, statusFilter, dateFilter, selectedCalendarDate, search, sortBy, todayKey]);

  // Paginated Table Records
  const paginatedReservations = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredTableReservations.slice(start, start + pageSize);
  }, [filteredTableReservations, currentPage, pageSize]);

  const totalPages = Math.ceil(filteredTableReservations.length / pageSize) || 1;

  // Navigation helpers
  const moveCalendar = (step) => {
    const next = new Date(calendarDate);
    if (calendarMode === 'month') {
      next.setMonth(next.getMonth() + step);
    } else if (calendarMode === 'week') {
      next.setDate(next.getDate() + step * 7);
    } else if (calendarMode === 'day') {
      next.setDate(next.getDate() + step);
      setSelectedCalendarDate(localDateKey(next));
    }
    setCalendarDate(next);
  };

  const jumpToToday = () => {
    const now = new Date();
    setCalendarDate(now);
    setSelectedCalendarDate(localDateKey(now));
  };

  // Actions
  const handleApprove = (reservation) => {
    runAction(() => {
      ownerService.updateReservationStatus(reservation.id, 'Approved', selectedRestaurantId);
    }, `Reservation #${reservation.id} confirmed.`);
  };

  const handleOpenReject = (reservation) => {
    setRejectRes(reservation);
    setRejectReason('');
    setRejectError('');
  };

  const handleConfirmReject = () => {
    if (!rejectReason.trim()) {
      setRejectError('Please state an official reason for rejection.');
      return;
    }
    runAction(() => {
      ownerService.updateReservationStatus(rejectRes.id, 'Rejected', selectedRestaurantId, {
        rejectionReason: rejectReason.trim(),
      });
    }, `Reservation #${rejectRes.id} rejected.`);
    setRejectRes(null);
  };

  const handleAssignTable = (reservation, tableId) => {
    if (!tableId) return;
    runAction(() => {
      ownerService.assignReservationTable(reservation.id, tableId, selectedRestaurantId);
    }, `Table assigned to #${reservation.id}.`);
  };

  const handleMarkArrived = (reservation) => {
    runAction(() => {
      ownerService.updateReservationStatus(reservation.id, 'Arrived', selectedRestaurantId);
    }, `Guest for #${reservation.id} marked arrived.`);
  };

  const handleConfirmTableSeated = (reservation) => {
    runAction(() => {
      ownerService.confirmReservationTable(reservation.id, selectedRestaurantId);
      ownerService.updateReservationStatus(reservation.id, 'Seated', selectedRestaurantId);
    }, `Party for #${reservation.id} seated at table.`);
  };

  const handleCompleteVisit = (reservation) => {
    runAction(() => {
      ownerService.updateReservationStatus(reservation.id, 'Completed', selectedRestaurantId);
    }, `Visit completed for #${reservation.id}.`);
  };

  const handleResolveCancellation = (reservation, decision, reason) => {
    runAction(() => {
      ownerService.resolveReservationCancellation(reservation.id, decision, selectedRestaurantId, reason);
    }, `Cancellation request ${decision}ed for #${reservation.id}.`);
    setDeclineRes(null);
    if (detailsRes) setDetailsRes(null);
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

  // Block / Unblock Time Slot Handlers
  const handleAddBlockedSlot = (e) => {
    e?.preventDefault();
    if (!newBlockDate || !newBlockTime) return;
    const nextBlocks = [
      ...blockedSlots.filter((b) => !(b.date === newBlockDate && b.time === newBlockTime)),
      {
        id: `blk-${Date.now()}`,
        date: newBlockDate,
        time: newBlockTime,
        reason: newBlockReason.trim() || 'Private Event',
      },
    ];
    saveStoredBlockedSlots(selectedRestaurantId, nextBlocks);
    setBlockedSlots(nextBlocks);
    showSuccessFeedback(`Time slot ${newBlockTime} on ${newBlockDate} blocked.`);
  };

  const handleRemoveBlockedSlot = (slotItem) => {
    const nextBlocks = blockedSlots.filter((b) => !(b.date === slotItem.date && b.time === slotItem.time));
    saveStoredBlockedSlots(selectedRestaurantId, nextBlocks);
    setBlockedSlots(nextBlocks);
    showSuccessFeedback(`Time slot ${slotItem.time} on ${slotItem.date} unblocked.`);
  };

  const handleSaveCapacitySetting = (e) => {
    e?.preventDefault();
    const parsed = Number(customSlotCapacity);
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > 100) return;
    saveStoredSlotCapacity(selectedRestaurantId, parsed);
    showSuccessFeedback(`Maximum reservation capacity per slot updated to ${parsed} guests.`);
  };

  // Temporary Closure (Blocked Date Range) Handlers
  const handleAddClosure = (e) => {
    e?.preventDefault();
    if (!newClosureStart || !newClosureEnd || newClosureEnd < newClosureStart) {
      setError('Please provide a valid date range.');
      return;
    }
    const currentSchedule = restaurant?.operatingSchedule || {};
    const currentClosures = currentSchedule.temporaryClosures || [];
    const nextClosures = [
      ...currentClosures,
      {
        id: `closure-${Date.now()}`,
        startDate: newClosureStart,
        endDate: newClosureEnd,
        type: newClosureType,
        reason: newClosureReason.trim() || `${newClosureType} closure`,
      },
    ];
    try {
      ownerService.updateOperatingHours?.(
        { ...currentSchedule, temporaryClosures: nextClosures },
        selectedRestaurantId
      );
      loadReservations();
      showSuccessFeedback(`Blocked dates from ${newClosureStart} to ${newClosureEnd} saved.`);
      setNewClosureReason('');
    } catch (closureErr) {
      setError(closureErr.message || 'Unable to save blocked date.');
    }
  };

  const handleRemoveClosure = (closureId) => {
    const currentSchedule = restaurant?.operatingSchedule || {};
    const nextClosures = (currentSchedule.temporaryClosures || []).filter((c) => c.id !== closureId);
    try {
      ownerService.updateOperatingHours?.(
        { ...currentSchedule, temporaryClosures: nextClosures },
        selectedRestaurantId
      );
      loadReservations();
      showSuccessFeedback('Blocked date removed.');
    } catch (closureErr) {
      setError(closureErr.message || 'Unable to remove closure.');
    }
  };

  const currentPeriodTitle = useMemo(() => {
    if (calendarMode === 'month') {
      return calendarDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }
    if (calendarMode === 'week') {
      const first = weekDays[0]?.date;
      const last = weekDays[6]?.date;
      if (!first || !last) return '';
      return `${first.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${last.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
    }
    if (calendarMode === 'day') {
      const d = selectedCalendarDate ? new Date(`${selectedCalendarDate}T00:00:00`) : calendarDate;
      return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    }
    return 'Reservation Agenda';
  }, [calendarMode, calendarDate, weekDays, selectedCalendarDate]);

  return (
    <OwnerLayout>
      <div className="owner-reservations-page">
        {/* ── Top Header (Section 2) ─────────────────────────────────── */}
        <header className="owner-reservations__header">
          <div className="owner-reservations__header-left">
            <span className="owner-reservations__badge">
              <span className="live-pulse" />
              Reservation Management System
            </span>
            <h1 className="owner-reservations__title">Reservations</h1>
            <p className="owner-reservations__desc">
              Manage your restaurant's reservations, schedules, availability, and booking activity.
            </p>
          </div>

          <div className="owner-reservations__header-right">
            {can('business.hours.manage') && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAvailabilityModalOpen(true)}
              >
                ⚙️ Manage Availability &amp; Capacity
              </Button>
            )}
            <Button
              variant="primary"
              size="sm"
              loading={savingAction}
              onClick={loadReservations}
            >
              ↻ Refresh Schedule
            </Button>
          </div>
        </header>

        {error && <ErrorState message={error} />}
        {successMessage && (
          <div style={{
            background: 'rgba(16, 185, 129, 0.12)',
            color: '#065f46',
            border: '1px solid rgba(16, 185, 129, 0.25)',
            borderRadius: 'var(--radius-md, 10px)',
            padding: '8px 16px',
            fontSize: 13,
            fontWeight: 600,
          }}>
            ✓ {successMessage}
          </div>
        )}

        {/* ── Reservation Summary Cards with Range Filter (Section 2) ─ */}
        <section className="owner-stats-section" aria-label="Reservation Summary Statistics">
          <div className="owner-stats-range-bar">
            <span className="owner-stats-range-label">Statistics Period</span>
            <div className="owner-stats-range-pills" role="group" aria-label="Statistics Range">
              <button
                type="button"
                className={`owner-stats-range-pill ${statsRange === 'today' ? 'is-active' : ''}`}
                onClick={() => setStatsRange('today')}
              >
                Today
              </button>
              <button
                type="button"
                className={`owner-stats-range-pill ${statsRange === 'week' ? 'is-active' : ''}`}
                onClick={() => setStatsRange('week')}
              >
                This Week
              </button>
              <button
                type="button"
                className={`owner-stats-range-pill ${statsRange === 'month' ? 'is-active' : ''}`}
                onClick={() => setStatsRange('month')}
              >
                This Month
              </button>
              <button
                type="button"
                className={`owner-stats-range-pill ${statsRange === 'all' ? 'is-active' : ''}`}
                onClick={() => setStatsRange('all')}
              >
                All Time
              </button>
            </div>
          </div>

          {/* 6 Summary Metric Cards */}
          <div className="owner-stat-grid--6">
            {/* 1. Total Reservations */}
            <button
              type="button"
              className={`owner-stat-box ${statusFilter === 'all' ? 'is-active' : ''}`}
              onClick={() => setStatusFilter('all')}
            >
              <div className="owner-stat-box__icon-wrap icon-badge--blue">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <div className="owner-stat-box__content">
                <span className="owner-stat-box__label">Total Bookings</span>
                <span className="owner-stat-box__count">{summaryStats.total}</span>
              </div>
            </button>

            {/* 2. Pending Requests */}
            <button
              type="button"
              className={`owner-stat-box ${statusFilter === 'pending' ? 'is-active' : ''}`}
              onClick={() => setStatusFilter(statusFilter === 'pending' ? 'all' : 'pending')}
            >
              <div className="owner-stat-box__icon-wrap icon-badge--purple">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </div>
              <div className="owner-stat-box__content">
                <span className="owner-stat-box__label">Pending Approval</span>
                <span className="owner-stat-box__count">{summaryStats.pending}</span>
              </div>
            </button>

            {/* 3. Confirmed Reservations */}
            <button
              type="button"
              className={`owner-stat-box ${statusFilter === 'confirmed' ? 'is-active' : ''}`}
              onClick={() => setStatusFilter(statusFilter === 'confirmed' ? 'all' : 'confirmed')}
            >
              <div className="owner-stat-box__icon-wrap icon-badge--green">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
              </div>
              <div className="owner-stat-box__content">
                <span className="owner-stat-box__label">Confirmed</span>
                <span className="owner-stat-box__count">{summaryStats.confirmed}</span>
              </div>
            </button>

            {/* 4. Today's Reservations */}
            <button
              type="button"
              className={`owner-stat-box ${dateFilter === 'today' ? 'is-active' : ''}`}
              onClick={() => {
                setDateFilter(dateFilter === 'today' ? 'all' : 'today');
                setSelectedCalendarDate(todayKey);
              }}
            >
              <div className="owner-stat-box__icon-wrap icon-badge--orange">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
              </div>
              <div className="owner-stat-box__content">
                <span className="owner-stat-box__label">Today's Bookings</span>
                <span className="owner-stat-box__count">{summaryStats.today}</span>
              </div>
            </button>

            {/* 5. Cancelled Reservations */}
            <button
              type="button"
              className={`owner-stat-box ${statusFilter === 'cancelled' ? 'is-active' : ''}`}
              onClick={() => setStatusFilter(statusFilter === 'cancelled' ? 'all' : 'cancelled')}
            >
              <div className="owner-stat-box__icon-wrap icon-badge--red">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="15" y1="9" x2="9" y2="15" />
                  <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
              </div>
              <div className="owner-stat-box__content">
                <span className="owner-stat-box__label">Cancelled / Declined</span>
                <span className="owner-stat-box__count">{summaryStats.cancelled}</span>
              </div>
            </button>

            {/* 6. Total Guests */}
            <div className="owner-stat-box">
              <div className="owner-stat-box__icon-wrap icon-badge--teal">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </div>
              <div className="owner-stat-box__content">
                <span className="owner-stat-box__label">Total Guests</span>
                <span className="owner-stat-box__count">{summaryStats.totalGuests}</span>
              </div>
            </div>
          </div>
        </section>

        {/* ── Primary Calendar Navigation Bar (Section 3) ────────────── */}
        <section className="owner-cal-nav" aria-label="Calendar Navigation">
          <div className="owner-cal-nav__left">
            <h2 className="owner-cal-nav__period-title">{currentPeriodTitle}</h2>
            <div className="owner-cal-nav__buttons">
              <button
                type="button"
                className="owner-cal-nav__arrow-btn"
                onClick={() => moveCalendar(-1)}
                aria-label="Previous Period"
              >
                ‹
              </button>
              <button
                type="button"
                className="owner-cal-nav__today-btn"
                onClick={jumpToToday}
              >
                Today
              </button>
              <button
                type="button"
                className="owner-cal-nav__arrow-btn"
                onClick={() => moveCalendar(1)}
                aria-label="Next Period"
              >
                ›
              </button>
            </div>
          </div>

          <div className="owner-cal-nav__search-box">
            <input
              type="text"
              className="input"
              placeholder="Search guest or #REF..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: '100%', height: 36, fontSize: 13 }}
            />
          </div>

          {/* View Switcher: Month / Week / Day / Agenda */}
          <div className="owner-cal-nav__view-switcher" role="group" aria-label="Calendar View">
            <button
              type="button"
              className={`owner-cal-nav__view-tab ${calendarMode === 'month' ? 'is-active' : ''}`}
              onClick={() => setCalendarMode('month')}
            >
              📅 Month View
            </button>
            <button
              type="button"
              className={`owner-cal-nav__view-tab ${calendarMode === 'week' ? 'is-active' : ''}`}
              onClick={() => setCalendarMode('week')}
            >
              📆 Week View
            </button>
            <button
              type="button"
              className={`owner-cal-nav__view-tab ${calendarMode === 'day' ? 'is-active' : ''}`}
              onClick={() => setCalendarMode('day')}
            >
              🕒 Day View
            </button>
            <button
              type="button"
              className={`owner-cal-nav__view-tab ${calendarMode === 'agenda' ? 'is-active' : ''}`}
              onClick={() => setCalendarMode('agenda')}
            >
              📋 Agenda View
            </button>
          </div>
        </section>

        {/* ── Visual Legend for Calendar ──────────────────────────────── */}
        {calendarMode === 'month' && (
          <div className="owner-cal-legend">
            <span className="owner-cal-legend__item">
              <span className="owner-cal-legend__dot owner-cal-legend__dot--available" />
              Available Slots
            </span>
            <span className="owner-cal-legend__item">
              <span className="owner-cal-legend__dot owner-cal-legend__dot--partial" />
              Partially Booked
            </span>
            <span className="owner-cal-legend__item">
              <span className="owner-cal-legend__dot owner-cal-legend__dot--full" />
              Fully Booked
            </span>
            <span className="owner-cal-legend__item">
              <span className="owner-cal-legend__dot owner-cal-legend__dot--closed" />
              Closed / Blocked
            </span>
            <span className="owner-cal-legend__item">
              <span className="owner-cal-legend__dot owner-cal-legend__dot--selected" />
              Selected Date
            </span>
          </div>
        )}

        {/* ── PRIMARY CALENDAR VIEWS (Section 3) ───────────────────────── */}
        {loading ? (
          <LoadingSpinner label="Loading reservation calendar…" />
        ) : calendarMode === 'month' ? (
          /* ── 3.A MONTH VIEW + DAILY RESERVATION SCHEDULE ─────────────── */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6, 24px)' }}>
            <div className="owner-month-grid-card">
              <div className="owner-month-grid__days-header">
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
                  <span key={d} className="owner-month-grid__day-label">{d}</span>
                ))}
              </div>

              <div className="owner-month-grid__matrix">
                {calendarDays.map((item, idx) => {
                  const key = localDateKey(item.date);
                  const isToday = key === todayKey;
                  const isSelected = key === selectedCalendarDate;
                  const dayAvail = monthAvailability[key];
                  const dayStatus = dayAvail?.status || 'available';

                  return (
                    <button
                      key={idx}
                      type="button"
                      className={`owner-month-cell ${item.isOutsideMonth ? 'is-outside-month' : ''} ${isToday ? 'is-today' : ''} ${isSelected ? 'is-selected' : ''}`}
                      onClick={() => setSelectedCalendarDate(key)}
                    >
                      <div className="owner-month-cell__header">
                        <span className="owner-month-cell__num">{item.date.getDate()}</span>
                        {!item.isOutsideMonth && (
                          <span className={`owner-month-cell__cap-badge owner-month-cell__cap-badge--${dayStatus === 'available' ? 'available' : dayStatus === 'partially_booked' ? 'partial' : dayStatus === 'fully_booked' ? 'full' : 'closed'}`}>
                            {dayStatus === 'available' ? 'Open' : dayStatus === 'partially_booked' ? 'Partial' : dayStatus === 'fully_booked' ? 'Full' : 'Closed'}
                          </span>
                        )}
                      </div>

                      {!item.isOutsideMonth && dayAvail && (
                        <div className="owner-month-cell__bookings-list">
                          {dayAvail.totalBookings > 0 && (
                            <span className="owner-month-chip owner-month-chip--confirmed">
                              <span>✓ {dayAvail.confirmedBookings} Confirmed</span>
                            </span>
                          )}
                          {dayAvail.pendingBookings > 0 && (
                            <span className="owner-month-chip owner-month-chip--pending">
                              <span>⏳ {dayAvail.pendingBookings} Pending</span>
                            </span>
                          )}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Daily Reservation Schedule for Selected Date (Section 3.C) */}
            <div className="owner-daily-schedule-card">
              <div className="owner-daily-schedule__header">
                <div className="owner-daily-schedule__title-area">
                  <h3 className="owner-daily-schedule__title">
                    📅 Daily Reservation Schedule — {new Date(`${selectedCalendarDate || todayKey}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                  </h3>
                  <span className="owner-daily-schedule__meta">
                    Total Bookings: <strong>{selectedDateSchedule.totalBookings}</strong> · Confirmed: <strong>{selectedDateSchedule.confirmedBookings}</strong> · Pending: <strong>{selectedDateSchedule.pendingBookings}</strong>
                  </span>
                </div>

                <div style={{ display: 'flex', gap: 'var(--space-2, 8px)' }}>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCalendarMode('day')}
                  >
                    Open Focused Day View →
                  </Button>
                </div>
              </div>

              {/* Chronological Time Slots Schedule */}
              <div className="owner-daily-schedule__slots-list">
                {selectedDateSchedule.slots.map((slot) => {
                  return (
                    <div
                      key={slot.time}
                      className={`owner-slot-card ${slot.status === 'fully_booked' ? 'is-fully-booked' : slot.isBlocked ? 'is-blocked' : ''}`}
                    >
                      <div className="owner-slot-card__header">
                        <span className="owner-slot-card__time">
                          🕒 {slot.time}
                        </span>

                        <span className={`owner-slot-card__cap-pill owner-slot-card__cap-pill--${slot.isBlocked ? 'closed' : slot.status === 'available' ? 'available' : slot.status === 'limited' ? 'limited' : slot.status === 'fully_booked' ? 'full' : 'closed'}`}>
                          {slot.isBlocked
                            ? `Blocked (${slot.blockReason})`
                            : slot.isClosed
                            ? 'Restaurant Closed'
                            : slot.status === 'fully_booked'
                            ? `Fully Booked (${slot.totalCapacity}/${slot.totalCapacity} capacity)`
                            : slot.status === 'limited'
                            ? `Capacity: ${slot.reservedSeats}/${slot.totalCapacity} seats booked (${slot.remainingSeats} remaining)`
                            : `Available (${slot.remainingSeats}/${slot.totalCapacity} seats open)`}
                        </span>
                      </div>

                      <div className="owner-slot-card__body">
                        {slot.reservations.length === 0 ? (
                          <div className="owner-slot-card__empty-row">
                            <p className="owner-slot-card__empty-msg">
                              {slot.isBlocked
                                ? `Time slot is blocked: ${slot.blockReason}`
                                : slot.isClosed
                                ? 'No reservations accepted during closed hours.'
                                : 'No reservations booked for this time slot.'}
                            </p>
                            {!slot.isClosed && !slot.isBlocked && can('business.hours.manage') && (
                              <Button
                                variant="ghost"
                                size="xs"
                                onClick={() => {
                                  setNewBlockDate(selectedCalendarDate || todayKey);
                                  setNewBlockTime(slot.time);
                                  setAvailabilityModalOpen(true);
                                  setAvailActiveTab('slots');
                                }}
                              >
                                🔒 Block Slot
                              </Button>
                            )}
                          </div>
                        ) : (
                          slot.reservations.map((res) => (
                            <div key={res.id} className="owner-slot-booking-item">
                              <div className="owner-slot-booking-item__guest">
                                <div className="owner-slot-booking-item__avatar">
                                  {getInitials(res.guestName || res.customerName)}
                                </div>
                                <div className="owner-slot-booking-item__info">
                                  <h4 className="owner-slot-booking-item__name">
                                    {res.guestName || res.customerName || 'Guest'} · <span style={{ fontFamily: 'monospace', color: 'var(--accent)' }}>#{res.id}</span>
                                  </h4>
                                  <span className="owner-slot-booking-item__meta">
                                    👥 {res.guests || res.partySize} Guests · 🪑 {res.seatingArea}
                                    {res.assignedTable ? (
                                      <strong style={{ color: '#065f46', marginLeft: 4 }}>
                                        · Table: {res.assignedTable.name || res.assignedTable.id}
                                      </strong>
                                    ) : (
                                      <span style={{ color: '#ea580c', marginLeft: 4 }}>· No table assigned</span>
                                    )}
                                    {res.guestPhone && ` · 📞 ${res.guestPhone}`}
                                  </span>
                                </div>
                              </div>

                              <div className="owner-slot-booking-item__actions">
                                <Badge variant={statusVariant(res.status)} dot size="sm">
                                  {res.status}
                                </Badge>

                                {res.status === 'Pending' && can('reservations.approve') && (
                                  <Button
                                    variant="primary"
                                    size="sm"
                                    onClick={() => handleApprove(res)}
                                  >
                                    Approve
                                  </Button>
                                )}

                                {res.status === 'Pending' && can('reservations.reject') && (
                                  <Button
                                    variant="danger-outline"
                                    size="sm"
                                    onClick={() => handleOpenReject(res)}
                                  >
                                    Reject
                                  </Button>
                                )}

                                {['Approved', 'Confirmed'].includes(res.status) && can('reservations.manageArrival') && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleMarkArrived(res)}
                                  >
                                    Mark Arrived
                                  </Button>
                                )}

                                {res.status === 'Arrived' && can('reservations.manageArrival') && (
                                  <Button
                                    variant="primary"
                                    size="sm"
                                    onClick={() => handleConfirmTableSeated(res)}
                                  >
                                    Seat at Table
                                  </Button>
                                )}

                                {res.status === 'Seated' && can('reservations.manageArrival') && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleCompleteVisit(res)}
                                  >
                                    Complete Visit
                                  </Button>
                                )}

                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => {
                                    setDetailsRes(res);
                                    loadTableChoices(res);
                                  }}
                                >
                                  Details
                                </Button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : calendarMode === 'week' ? (
          /* ── 3.B WEEK VIEW ───────────────────────────────────────────── */
          <div className="owner-week-grid">
            {weekDays.map((col) => (
              <div
                key={col.dateKey}
                className={`owner-week-column ${col.isToday ? 'is-today' : ''}`}
              >
                <div className="owner-week-column__header">
                  <span className="owner-week-column__day-name">
                    {col.date.toLocaleDateString('en-US', { weekday: 'short' })}
                  </span>
                  <span className="owner-week-column__day-date">
                    {col.date.getDate()}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {col.bookings.length} {col.bookings.length === 1 ? 'Booking' : 'Bookings'}
                  </span>
                </div>

                <div className="owner-week-column__bookings">
                  {col.bookings.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 'var(--space-6, 24px) var(--space-2, 8px)', color: 'var(--text-muted)', fontSize: 12 }}>
                      Available
                    </div>
                  ) : (
                    col.bookings.map((b) => (
                      <button
                        key={b.id}
                        type="button"
                        className="owner-week-card"
                        onClick={() => {
                          setDetailsRes(b);
                          loadTableChoices(b);
                        }}
                      >
                        <div className="owner-week-card__top">
                          <span className="owner-week-card__time">🕒 {b.time}</span>
                          <Badge variant={statusVariant(b.status)} size="xs">
                            {b.status}
                          </Badge>
                        </div>
                        <span className="owner-week-card__guest">
                          {b.guestName || b.customerName || 'Guest'} ({b.guests || b.partySize}p)
                        </span>
                        {b.assignedTable && (
                          <span style={{ fontSize: 10, color: '#065f46', fontWeight: 600 }}>
                            Table: {b.assignedTable.name || b.assignedTable.id}
                          </span>
                        )}
                      </button>
                    ))
                  )}
                </div>

                <div style={{ padding: 8, borderTop: '1px solid var(--border-secondary)' }}>
                  <Button
                    variant="ghost"
                    size="sm"
                    fullWidth
                    onClick={() => {
                      setSelectedCalendarDate(col.dateKey);
                      setCalendarMode('day');
                    }}
                  >
                    View Day Timeline →
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : calendarMode === 'day' ? (
          /* ── 3.C FOCUSED DAY VIEW ────────────────────────────────────── */
          <div className="owner-daily-schedule-card">
            <div className="owner-daily-schedule__header">
              <div className="owner-daily-schedule__title-area">
                <h3 className="owner-daily-schedule__title">
                  🕒 Full Day Timeline — {new Date(`${selectedCalendarDate || todayKey}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                </h3>
                <span className="owner-daily-schedule__meta">
                  Status: <strong>{selectedDateSchedule.statusLabel}</strong> · Total Bookings: <strong>{selectedDateSchedule.totalBookings}</strong> ({selectedDateSchedule.confirmedBookings} Confirmed, {selectedDateSchedule.pendingBookings} Pending)
                </span>
              </div>

              <div style={{ display: 'flex', gap: 'var(--space-2, 8px)' }}>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => moveCalendar(-1)}
                >
                  ‹ Previous Day
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => moveCalendar(1)}
                >
                  Next Day ›
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setCalendarMode('month')}
                >
                  Back to Month Grid
                </Button>
              </div>
            </div>

            {/* Chronological Slots */}
            <div className="owner-daily-schedule__slots-list">
              {selectedDateSchedule.slots.map((slot) => (
                <div
                  key={slot.time}
                  className={`owner-slot-card ${slot.status === 'fully_booked' ? 'is-fully-booked' : slot.isBlocked ? 'is-blocked' : ''}`}
                >
                  <div className="owner-slot-card__header">
                    <span className="owner-slot-card__time">
                      🕒 {slot.time}
                    </span>
                    <span className={`owner-slot-card__cap-pill owner-slot-card__cap-pill--${slot.isBlocked ? 'closed' : slot.status === 'available' ? 'available' : slot.status === 'limited' ? 'limited' : slot.status === 'fully_booked' ? 'full' : 'closed'}`}>
                      {slot.isBlocked
                        ? `Blocked (${slot.blockReason})`
                        : slot.isClosed
                        ? 'Closed'
                        : slot.status === 'fully_booked'
                        ? 'Fully Booked'
                        : slot.status === 'limited'
                        ? `Capacity: ${slot.reservedSeats}/${slot.totalCapacity} seats booked (${slot.remainingSeats} remaining)`
                        : `Available (${slot.remainingSeats}/${slot.totalCapacity} seats open)`}
                    </span>
                  </div>

                  <div className="owner-slot-card__body">
                    {slot.reservations.length === 0 ? (
                      <p className="owner-slot-card__empty-msg">
                        {slot.isBlocked ? `Blocked: ${slot.blockReason}` : slot.isClosed ? 'Closed during this hour.' : 'Available — No bookings in this slot.'}
                      </p>
                    ) : (
                      slot.reservations.map((res) => (
                        <div key={res.id} className="owner-slot-booking-item">
                          <div className="owner-slot-booking-item__guest">
                            <div className="owner-slot-booking-item__avatar">
                              {getInitials(res.guestName || res.customerName)}
                            </div>
                            <div className="owner-slot-booking-item__info">
                              <h4 className="owner-slot-booking-item__name">
                                {res.guestName || res.customerName || 'Guest'} · #{res.id}
                              </h4>
                              <span className="owner-slot-booking-item__meta">
                                👥 {res.guests || res.partySize} Guests · 🪑 {res.seatingArea}
                                {res.assignedTable && ` · Table: ${res.assignedTable.name || res.assignedTable.id}`}
                                {res.guestPhone && ` · 📞 ${res.guestPhone}`}
                              </span>
                            </div>
                          </div>

                          <div className="owner-slot-booking-item__actions">
                            <Badge variant={statusVariant(res.status)} dot size="sm">
                              {res.status}
                            </Badge>
                            {res.status === 'Pending' && can('reservations.approve') && (
                              <Button variant="primary" size="sm" onClick={() => handleApprove(res)}>
                                Approve
                              </Button>
                            )}
                            {res.status === 'Pending' && can('reservations.reject') && (
                              <Button variant="danger-outline" size="sm" onClick={() => handleOpenReject(res)}>
                                Reject
                              </Button>
                            )}
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => {
                                setDetailsRes(res);
                                loadTableChoices(res);
                              }}
                            >
                              Manage / Assign Table
                            </Button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* ── 3.D AGENDA VIEW (Section 3.D) ──────────────────────────── */
          <div>
            {Object.keys(agendaGrouped).length === 0 ? (
              <EmptyState
                title="No upcoming reservations"
                description="There are no reservations matching your current search or status filters."
              />
            ) : (
              Object.entries(agendaGrouped).map(([dateStr, items]) => (
                <div key={dateStr} className="owner-agenda-group">
                  <div className="owner-agenda-date-header">
                    <h4 className="owner-agenda-date-title">
                      📅 {new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                    </h4>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {items.length} {items.length === 1 ? 'reservation' : 'reservations'}
                    </span>
                  </div>

                  <div className="owner-agenda-items">
                    {items.map((r) => (
                      <div key={r.id} className="owner-slot-booking-item">
                        <div className="owner-slot-booking-item__guest">
                          <div className="owner-slot-booking-item__avatar">
                            {getInitials(r.guestName || r.customerName)}
                          </div>
                          <div className="owner-slot-booking-item__info">
                            <h4 className="owner-slot-booking-item__name">
                              {r.guestName || r.customerName || 'Guest'} · <span style={{ fontFamily: 'monospace', color: 'var(--accent)' }}>#{r.id}</span>
                            </h4>
                            <span className="owner-slot-booking-item__meta">
                              🕒 {r.time} · 👥 {r.guests || r.partySize} Guests · 🪑 {r.seatingArea}
                              {r.assignedTable && ` · Table: ${r.assignedTable.name || r.assignedTable.id}`}
                              {r.guestPhone && ` · 📞 ${r.guestPhone}`}
                            </span>
                          </div>
                        </div>

                        <div className="owner-slot-booking-item__actions">
                          <Badge variant={statusVariant(r.status)} dot size="sm">
                            {r.status}
                          </Badge>
                          {r.status === 'Pending' && can('reservations.approve') && (
                            <Button variant="primary" size="sm" onClick={() => handleApprove(r)}>
                              Approve
                            </Button>
                          )}
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              setDetailsRes(r);
                              loadTableChoices(r);
                            }}
                          >
                            Details
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* ── 5. SUPPLEMENTARY RESERVATION MANAGEMENT TABLE (Section 5) ─ */}
        <section className="owner-mgmt-section" aria-label="Reservation Records Table">
          <div className="owner-mgmt-toolbar">
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--text-primary)' }}>
              📋 Reservation Records &amp; Management
            </h3>

            <div className="owner-mgmt-filters">
              <select
                className="select"
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setCurrentPage(1);
                }}
                style={{ height: 36, fontSize: 12 }}
                aria-label="Filter by Status"
              >
                <option value="all">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="confirmed">Confirmed</option>
                <option value="seated">Seated</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled / Declined</option>
              </select>

              <select
                className="select"
                value={dateFilter}
                onChange={(e) => {
                  setDateFilter(e.target.value);
                  setCurrentPage(1);
                }}
                style={{ height: 36, fontSize: 12 }}
                aria-label="Filter by Date"
              >
                <option value="all">All Dates</option>
                <option value="today">Today</option>
                <option value="week">This Week</option>
                <option value="selected">Selected Calendar Date</option>
              </select>

              <select
                className="select"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                style={{ height: 36, fontSize: 12 }}
                aria-label="Sort Order"
              >
                <option value="datetime-asc">Date &amp; Time (Ascending)</option>
                <option value="datetime-desc">Date &amp; Time (Descending)</option>
                <option value="guests-desc">Party Size (High to Low)</option>
              </select>
            </div>
          </div>

          {filteredTableReservations.length === 0 ? (
            <EmptyState
              title="No reservation records match criteria"
              description="Adjust your search query or reset status/date filters to view more bookings."
            />
          ) : (
            <>
              {/* Desktop Table View */}
              <div className="owner-mgmt-table-wrapper">
                <table className="owner-mgmt-table">
                  <thead>
                    <tr>
                      <th>Ref #</th>
                      <th>Customer</th>
                      <th>Contact</th>
                      <th>Date &amp; Time</th>
                      <th>Guests</th>
                      <th>Assigned Table</th>
                      <th>Special Notes</th>
                      <th>Status</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedReservations.map((row) => (
                      <tr key={row.id}>
                        <td>
                          <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--accent)' }}>
                            #{row.id}
                          </span>
                          <button
                            type="button"
                            onClick={() => copyRefToClipboard(row.id)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', marginLeft: 4, color: 'var(--text-muted)' }}
                            title="Copy Ref"
                          >
                            {copiedId === row.id ? '✓' : '⧉'}
                          </button>
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div className="owner-slot-booking-item__avatar" style={{ width: 28, height: 28, fontSize: 11 }}>
                              {getInitials(row.guestName || row.customerName)}
                            </div>
                            <strong>{row.guestName || row.customerName || 'Guest'}</strong>
                          </div>
                        </td>
                        <td>{row.guestPhone || row.customerPhone || '–'}</td>
                        <td>
                          <span>{row.date}</span>
                          <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)' }}>{row.time}</span>
                        </td>
                        <td>
                          <strong>{row.guests || row.partySize}</strong>
                        </td>
                        <td>
                          {can('reservations.assignTables') ? (
                            <select
                              className="select"
                              value={selectedTableMap[row.id] || row.assignedTable?.id || ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                setSelectedTableMap((prev) => ({ ...prev, [row.id]: val }));
                                handleAssignTable(row, val);
                              }}
                              style={{ height: 30, fontSize: 11, minWidth: 120 }}
                            >
                              <option value="">-- No table --</option>
                              {(tableChoices[row.id] || tables || []).map((t) => (
                                <option key={t.id} value={t.id}>
                                  {t.name || t.id} ({t.capacity}p)
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span>{row.assignedTable ? `${row.assignedTable.name || row.assignedTable.id}` : 'Unassigned'}</span>
                          )}
                        </td>
                        <td>
                          <span style={{ fontSize: 12, color: 'var(--text-secondary)', maxWidth: 160, display: 'inline-block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.specialRequests}>
                            {row.specialRequests || '–'}
                          </span>
                        </td>
                        <td>
                          <Badge variant={statusVariant(row.status)} dot size="xs">
                            {row.status}
                          </Badge>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4 }}>
                            {row.status === 'Pending' && can('reservations.approve') && (
                              <Button variant="primary" size="xs" onClick={() => handleApprove(row)}>
                                Approve
                              </Button>
                            )}
                            {row.status === 'Pending' && can('reservations.reject') && (
                              <Button variant="danger-outline" size="xs" onClick={() => handleOpenReject(row)}>
                                Reject
                              </Button>
                            )}
                            <Button
                              variant="secondary"
                              size="xs"
                              onClick={() => {
                                setDetailsRes(row);
                                loadTableChoices(row);
                              }}
                            >
                              Details
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Cards View */}
              <div className="owner-mgmt-mobile-cards" style={{ display: 'none' }}>
                {paginatedReservations.map((row) => (
                  <div key={row.id} className="owner-slot-booking-item">
                    <div className="owner-slot-booking-item__guest">
                      <div className="owner-slot-booking-item__avatar">
                        {getInitials(row.guestName || row.customerName)}
                      </div>
                      <div className="owner-slot-booking-item__info">
                        <h4 className="owner-slot-booking-item__name">
                          {row.guestName || row.customerName} · #{row.id}
                        </h4>
                        <span className="owner-slot-booking-item__meta">
                          📅 {row.date} at {row.time} · 👥 {row.guests || row.partySize} Guests
                        </span>
                      </div>
                    </div>
                    <div className="owner-slot-booking-item__actions">
                      <Badge variant={statusVariant(row.status)} dot size="xs">{row.status}</Badge>
                      <Button variant="secondary" size="xs" onClick={() => { setDetailsRes(row); loadTableChoices(row); }}>
                        Details
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Pagination controls */}
              <div className="owner-mgmt-pagination">
                <span>
                  Showing {((currentPage - 1) * pageSize) + 1}–{Math.min(currentPage * pageSize, filteredTableReservations.length)} of {filteredTableReservations.length} records
                </span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <Button
                    variant="outline"
                    size="xs"
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  >
                    ‹ Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="xs"
                    disabled={currentPage >= totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  >
                    Next ›
                  </Button>
                </div>
              </div>
            </>
          )}
        </section>

        {/* ── Details Modal (Section 6) ──────────────────────────────── */}
        {detailsRes && (
          <Modal
            open={Boolean(detailsRes)}
            onClose={() => setDetailsRes(null)}
            title={`Reservation Particulars · #${detailsRes.id}`}
            size="md"
            footer={
              <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                <Button variant="ghost" size="sm" onClick={() => setDetailsRes(null)}>
                  Close
                </Button>
                {detailsRes.status === 'Pending' && can('reservations.approve') && (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      handleApprove(detailsRes);
                      setDetailsRes(null);
                    }}
                  >
                    Approve Reservation
                  </Button>
                )}
              </div>
            }
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4, 16px)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 'var(--space-3, 12px)', fontSize: 13 }}>
                <div>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block' }}>Customer Name</span>
                  <strong>{detailsRes.guestName || detailsRes.customerName || 'Guest'}</strong>
                </div>
                <div>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block' }}>Contact Phone</span>
                  <strong>{detailsRes.guestPhone || detailsRes.customerPhone || 'Not provided'}</strong>
                </div>
                <div>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block' }}>Date &amp; Arrival Time</span>
                  <strong>{detailsRes.date} at {detailsRes.time}</strong>
                </div>
                <div>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block' }}>Party Size</span>
                  <strong>{detailsRes.guests || detailsRes.partySize} Guests</strong>
                </div>
                <div>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block' }}>Seating Area</span>
                  <strong>{detailsRes.seatingArea}</strong>
                </div>
                <div>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block' }}>Status</span>
                  <Badge variant={statusVariant(detailsRes.status)} size="xs">{detailsRes.status}</Badge>
                </div>
              </div>

              {/* Table assignment selector */}
              {can('reservations.assignTables') && (
                <div style={{ background: 'var(--surface-secondary)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)' }}>
                  <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 6 }}>
                    Assign Dining Table
                  </label>
                  <select
                    className="select"
                    value={selectedTableMap[detailsRes.id] || detailsRes.assignedTable?.id || ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSelectedTableMap((prev) => ({ ...prev, [detailsRes.id]: val }));
                      handleAssignTable(detailsRes, val);
                    }}
                    style={{ width: '100%', height: 38 }}
                  >
                    <option value="">-- No table assigned --</option>
                    {(tableChoices[detailsRes.id] || tables || []).map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name || t.id} ({t.area}) · Capacity: {t.capacity} seats
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Customer Cancellation Request Review */}
              {detailsRes.cancellationRequest?.status === 'requested' && can('reservations.cancel') && (
                <div style={{ background: 'rgba(245, 158, 11, 0.1)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
                  <h4 style={{ margin: '0 0 4px', fontSize: 13, color: '#92400e' }}>
                    Customer Cancellation Request
                  </h4>
                  <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--text-secondary)' }}>
                    Reason: "{detailsRes.cancellationRequest.reason || 'Customer requested cancellation'}"
                  </p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => handleResolveCancellation(detailsRes, 'approve')}
                    >
                      Approve Cancellation
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setDeclineRes(detailsRes)}
                    >
                      Decline Request
                    </Button>
                  </div>
                </div>
              )}

              {detailsRes.specialRequests && (
                <div>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block' }}>Special Requests</span>
                  <p style={{ margin: '2px 0 0', fontSize: 13, fontStyle: 'italic' }}>
                    "{detailsRes.specialRequests}"
                  </p>
                </div>
              )}
            </div>
          </Modal>
        )}

        {/* ── Rejection Modal (Section 6) ────────────────────────────── */}
        <Modal
          open={Boolean(rejectRes)}
          onClose={() => setRejectRes(null)}
          title="Reject Reservation Request"
          size="sm"
          footer={
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
              <Button variant="ghost" size="sm" onClick={() => setRejectRes(null)}>
                Cancel
              </Button>
              <Button variant="danger" size="sm" onClick={handleConfirmReject}>
                Confirm Rejection
              </Button>
            </div>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>
              State an official reason for declining this reservation. This explanation will be displayed to the customer.
            </p>
            {rejectError && <div className="form-error">{rejectError}</div>}
            <textarea
              className="textarea"
              rows={3}
              placeholder="Fully booked at this hour, kitchen maintenance, private event..."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              style={{ width: '100%' }}
            />
          </div>
        </Modal>

        {/* ── Decline Cancellation Modal (Section 6) ─────────────────── */}
        <Modal
          open={Boolean(declineRes)}
          onClose={() => setDeclineRes(null)}
          title="Decline Cancellation Request"
          size="sm"
          footer={
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
              <Button variant="ghost" size="sm" onClick={() => setDeclineRes(null)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => {
                  if (!declineReason.trim()) return;
                  handleResolveCancellation(declineRes, 'decline', declineReason.trim());
                }}
              >
                Confirm Decline
              </Button>
            </div>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>
              Provide a reason for declining the cancellation (e.g. past the cancellation cutoff deadline).
            </p>
            <textarea
              className="textarea"
              rows={2}
              placeholder="Late notice cancellation policy..."
              value={declineReason}
              onChange={(e) => setDeclineReason(e.target.value)}
              style={{ width: '100%' }}
            />
          </div>
        </Modal>

        {/* ── Manage Availability & Capacity Modal (Section 7) ───────── */}
        <Modal
          open={availabilityModalOpen}
          onClose={() => setAvailabilityModalOpen(false)}
          title="⚙️ Manage Reservation Availability & Capacity"
          size="lg"
          footer={
            <Button variant="primary" size="sm" onClick={() => setAvailabilityModalOpen(false)}>
              Done
            </Button>
          }
        >
          <div>
            <div className="owner-avail-tabs" role="tablist">
              <button
                type="button"
                className={`owner-avail-tab-btn ${availActiveTab === 'dates' ? 'is-active' : ''}`}
                onClick={() => setAvailActiveTab('dates')}
              >
                📅 Block Dates
              </button>
              <button
                type="button"
                className={`owner-avail-tab-btn ${availActiveTab === 'slots' ? 'is-active' : ''}`}
                onClick={() => setAvailActiveTab('slots')}
              >
                🕒 Block Time Slots
              </button>
              <button
                type="button"
                className={`owner-avail-tab-btn ${availActiveTab === 'capacity' ? 'is-active' : ''}`}
                onClick={() => setAvailActiveTab('capacity')}
              >
                🪑 Slot Capacity
              </button>
              <button
                type="button"
                className={`owner-avail-tab-btn ${availActiveTab === 'hours' ? 'is-active' : ''}`}
                onClick={() => setAvailActiveTab('hours')}
              >
                ⏰ Operating Schedule
              </button>
            </div>

            {/* Tab 1: Block Dates */}
            {availActiveTab === 'dates' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4, 16px)' }}>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>
                  Mark specific dates as unavailable for online reservations (e.g., Holiday, Renovation, Private Event).
                </p>

                <form onSubmit={handleAddClosure} style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, background: 'var(--surface-secondary)', padding: 12, borderRadius: 10 }}>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 2 }}>Start Date</label>
                    <input
                      type="date"
                      className="input"
                      value={newClosureStart}
                      onChange={(e) => setNewClosureStart(e.target.value)}
                      style={{ width: '100%', height: 34, fontSize: 12 }}
                      required
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 2 }}>End Date</label>
                    <input
                      type="date"
                      className="input"
                      value={newClosureEnd}
                      onChange={(e) => setNewClosureEnd(e.target.value)}
                      style={{ width: '100%', height: 34, fontSize: 12 }}
                      required
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 2 }}>Closure Type</label>
                    <select
                      className="select"
                      value={newClosureType}
                      onChange={(e) => setNewClosureType(e.target.value)}
                      style={{ width: '100%', height: 34, fontSize: 12 }}
                    >
                      <option value="Holiday">Holiday</option>
                      <option value="Private Event">Private Event</option>
                      <option value="Renovation">Renovation</option>
                      <option value="Maintenance">Maintenance</option>
                      <option value="Emergency">Emergency</option>
                    </select>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                    <Button type="submit" variant="primary" size="sm" fullWidth>
                      + Block Date Range
                    </Button>
                  </div>
                </form>

                {/* List of active closures */}
                <div>
                  <h5 style={{ margin: '0 0 6px', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                    Active Blocked Dates ({restaurant?.operatingSchedule?.temporaryClosures?.length || 0})
                  </h5>
                  {(restaurant?.operatingSchedule?.temporaryClosures || []).length === 0 ? (
                    <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>No blocked date ranges currently set.</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {(restaurant?.operatingSchedule?.temporaryClosures || []).map((c) => (
                        <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--surface-secondary)', borderRadius: 8, fontSize: 12 }}>
                          <div>
                            <strong>{c.startDate} to {c.endDate}</strong> · <Badge size="xs" variant="error">{c.type}</Badge>
                            <span style={{ color: 'var(--text-muted)', marginLeft: 6 }}>{c.reason}</span>
                          </div>
                          <Button variant="danger-outline" size="xs" onClick={() => handleRemoveClosure(c.id)}>
                            Remove
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Tab 2: Block Time Slots */}
            {availActiveTab === 'slots' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4, 16px)' }}>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>
                  Block specific reservation time slots on any date (e.g. 1:00 PM reserved for Private VIP Banquet).
                </p>

                <form onSubmit={handleAddBlockedSlot} style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, background: 'var(--surface-secondary)', padding: 12, borderRadius: 10 }}>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 2 }}>Date</label>
                    <input
                      type="date"
                      className="input"
                      value={newBlockDate}
                      onChange={(e) => setNewBlockDate(e.target.value)}
                      style={{ width: '100%', height: 34, fontSize: 12 }}
                      required
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 2 }}>Time Slot</label>
                    <select
                      className="select"
                      value={newBlockTime}
                      onChange={(e) => setNewBlockTime(e.target.value)}
                      style={{ width: '100%', height: 34, fontSize: 12 }}
                    >
                      {STANDARD_TIME_SLOTS.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 2 }}>Reason</label>
                    <input
                      type="text"
                      className="input"
                      placeholder="Private Event, VIP..."
                      value={newBlockReason}
                      onChange={(e) => setNewBlockReason(e.target.value)}
                      style={{ width: '100%', height: 34, fontSize: 12 }}
                    />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                    <Button type="submit" variant="primary" size="sm" fullWidth>
                      + Block Time Slot
                    </Button>
                  </div>
                </form>

                {/* List of active blocked slots */}
                <div>
                  <h5 style={{ margin: '0 0 6px', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                    Active Blocked Slots ({blockedSlots.length})
                  </h5>
                  {blockedSlots.length === 0 ? (
                    <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>No blocked time slots currently set.</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {blockedSlots.map((b) => (
                        <div key={`${b.date}-${b.time}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--surface-secondary)', borderRadius: 8, fontSize: 12 }}>
                          <div>
                            <strong>{b.date} at {b.time}</strong> · <Badge size="xs" variant="warning">Blocked</Badge>
                            <span style={{ color: 'var(--text-muted)', marginLeft: 6 }}>Reason: {b.reason}</span>
                          </div>
                          <Button variant="danger-outline" size="xs" onClick={() => handleRemoveBlockedSlot(b)}>
                            Unblock Slot
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Tab 3: Capacity Configuration */}
            {availActiveTab === 'capacity' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4, 16px)' }}>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>
                  Configure maximum reservation capacity per time slot. Note: Total restaurant seating capacity across tables is {tables.reduce((acc, t) => acc + (Number(t.capacity) || 0), 0)} seats.
                </p>

                <form onSubmit={handleSaveCapacitySetting} style={{ display: 'flex', gap: 12, alignItems: 'flex-end', background: 'var(--surface-secondary)', padding: 16, borderRadius: 10 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>
                      Max Reserved Guests Per Time Slot (1–100)
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="100"
                      className="input"
                      value={customSlotCapacity}
                      onChange={(e) => setCustomSlotCapacity(e.target.value)}
                      style={{ width: '100%', height: 38 }}
                    />
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginTop: 4 }}>
                      When bookings reach this threshold, that time slot is automatically marked "Fully Booked".
                    </span>
                  </div>

                  <Button type="submit" variant="primary" size="md">
                    Save Capacity Setting
                  </Button>
                </form>
              </div>
            )}

            {/* Tab 4: Operating Hours */}
            {availActiveTab === 'hours' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3, 12px)' }}>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>
                  Current configured weekly operating hours and reservation status.
                </p>

                <div style={{ background: 'var(--surface-secondary)', padding: 12, borderRadius: 10, fontSize: 12 }}>
                  <p style={{ margin: '0 0 6px' }}>
                    Online Reservations: <strong>{restaurant?.operatingSchedule?.acceptingReservations !== false ? 'Active & Accepting' : 'Paused'}</strong>
                  </p>
                  <p style={{ margin: '0 0 10px' }}>
                    Weekly Schedule: <strong>{restaurant?.operatingHours || '10:00 AM – 10:00 PM'}</strong>
                  </p>
                  <Link to="/owner/settings" style={{ textDecoration: 'none' }}>
                    <Button variant="outline" size="sm">
                      Open Full Operating Hours Editor →
                    </Button>
                  </Link>
                </div>
              </div>
            )}
          </div>
        </Modal>
      </div>
    </OwnerLayout>
  );
}
