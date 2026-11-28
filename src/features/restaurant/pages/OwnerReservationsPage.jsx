import { useState, useEffect, useCallback, useMemo } from 'react';
import OwnerLayout from '../../../layouts/OwnerLayout';
import { ownerService } from '../../../services/ownerService';
import Button from '../../../components/common/Button';
import Badge from '../../../components/common/Badge';
import Modal from '../../../components/common/Modal';
import { StateView } from '../../../components/feedback';
import { useRestaurantAccess } from '../access/useRestaurantAccess';
import { formatTimeUntilExpiry } from '../../../utils/reservationExpiryUtils';
import OwnerTablesPage from './OwnerTablesPage';
import {
  CheckCircleIcon,
  ClipboardIcon,
  ClockIcon,
  FlagIcon,
  MailIcon,
  PhoneIcon,
  TableIcon,
  UsersIcon,
  UtensilsIcon,
} from '../../../components/common/ReservationIcons';

function sanitizeTelHref(phone) {
  const cleaned = String(phone || '').replace(/[^+\d]/g, '');
  return cleaned ? `tel:${cleaned}` : '#';
}

function sanitizeMailtoHref(email) {
  const cleaned = String(email || '').replace(/[\r\n\s<>]/g, '');
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned) ? `mailto:${cleaned}` : '#';
}
import './OwnerReservationsPage.css';

const STATUS_BADGE_MAP = {
  pending: { variant: 'warning', label: 'Pending' },
  approved: { variant: 'info', label: 'Approved' },
  awaiting_payment: { variant: 'warning', label: 'Awaiting Deposit' },
  confirmed: { variant: 'success', label: 'Confirmed' },
  arrived: { variant: 'info', label: 'Arrived' },
  seated: { variant: 'primary', label: 'Seated' },
  completed: { variant: 'success', label: 'Completed' },
  cancelled: { variant: 'default', label: 'Cancelled' },
  no_show: { variant: 'error', label: 'No-Show' },
  rejected: { variant: 'error', label: 'Rejected' },
  expired: { variant: 'default', label: 'Expired' },
};

const DEPOSIT_BADGE_MAP = {
  pending: { variant: 'warning', label: 'Deposit: Pending' },
  paid: { variant: 'success', label: 'Deposit: Received' },
  waived: { variant: 'default', label: 'Deposit: Waived' },
  refunded: { variant: 'info', label: 'Deposit: Refunded' },
  not_collected: { variant: 'default', label: 'Deposit: Not collected' },
};

const ATTENTION_META = {
  pending_expiring: { variant: 'warning', label: 'Expiring soon' },
  no_show_candidate: { variant: 'error', label: 'No-show candidate' },
  overdue_seated: { variant: 'warning', label: 'Overdue' },
};

function getManilaTodayKey() {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Manila',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  } catch {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
}

function addDaysToKey(dateKey, offsetDays) {
  const [y, m, d] = String(dateKey).split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, (d || 1) + offsetDays));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

function getWeekBounds(dateKey) {
  const [y, m, d] = String(dateKey).split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  const dow = dt.getUTCDay(); // 0=Sun..6=Sat
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const startKey = addDaysToKey(dateKey, mondayOffset);
  const days = [];
  for (let i = 0; i < 7; i += 1) {
    days.push(addDaysToKey(startKey, i));
  }
  return { start: startKey, end: days[6], days };
}

function monthKeyFromDateKey(dateKey) {
  return String(dateKey || getManilaTodayKey()).slice(0, 7);
}

function formatManilaTime(isoString) {
  if (!isoString) return '';
  try {
    const dt = new Date(isoString);
    if (Number.isNaN(dt.getTime())) return isoString;
    return dt.toLocaleTimeString('en-PH', {
      timeZone: 'Asia/Manila',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return isoString;
  }
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

export default function OwnerReservationsPage() {
  const access = useRestaurantAccess();
  const { selectedRestaurantId } = access;

  const canApprove = access.canAccess(['reservations.approve']);
  const canReject = access.canAccess(['reservations.reject']);
  const canAssignTables = access.canAccess(['reservations.assignTables']);
  const canUpdateStatus = access.canAccess(['reservations.updateStatus']);
  const canManageArrival = access.canAccess(['reservations.manageArrival']);

  const todayKey = useMemo(() => getManilaTodayKey(), []);

  // View & Navigation
  const [sectionTab, setSectionTab] = useState('reservations');
  const [viewMode, setViewMode] = useState('day'); // 'day' | 'week' | 'list'
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const [calendarMonth, setCalendarMonth] = useState(() => monthKeyFromDateKey(todayKey));

  // Filters
  const [statusFilter, setStatusFilter] = useState('all');
  const [groupFilter, setGroupFilter] = useState('all');
  const [tableFilter, setTableFilter] = useState('all');
  const [areaFilter, setAreaFilter] = useState('all');
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);

  // Data
  const [reservations, setReservations] = useState([]);
  const [pagination, setPagination] = useState({ current_page: 1, last_page: 1, per_page: 20, total: 0 });
  const [summary, setSummary] = useState({
    total: 0,
    pending: 0,
    confirmed: 0,
    awaitingPayment: 0,
    inHouse: 0,
    completed: 0,
    cancelledOrMissed: 0,
    expectedCovers: 0,
    pendingTotalUpcoming: 0,
  });
  const [calendarDaysMap, setCalendarDaysMap] = useState({});
  const [tablesCatalog, setTablesCatalog] = useState([]);
  const [diningAreas, setDiningAreas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);
  const [busyActionId, setBusyActionId] = useState(null);

  // Modals
  const [detailRes, setDetailRes] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [reasonModal, setReasonModal] = useState(null); // { mode: 'reject' | 'cancel', res }
  const [reasonInput, setReasonInput] = useState('');
  const [refundDepositOnCancel, setRefundDepositOnCancel] = useState(true);
  const [reasonError, setReasonError] = useState('');

  const [depositModal, setDepositModal] = useState(null); // { action: 'mark_paid' | 'waive' | 'refund', res }
  const [depositNote, setDepositNote] = useState('');
  const [depositError, setDepositError] = useState('');

  const [seatModal, setSeatModal] = useState(null); // { res }
  const [seatTableId, setSeatTableId] = useState('');
  const [seatError, setSeatError] = useState('');

  const [reassignModal, setReassignModal] = useState(null); // { res }
  const [reassignTableId, setReassignTableId] = useState('');
  const [reassignError, setReassignError] = useState('');

  const anyModalOpen = Boolean(detailRes || reasonModal || seatModal || reassignModal);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
      setPage(1);
    }, 280);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Load restaurant tables catalog for filters and Seat / Reassign modals
  useEffect(() => {
    let active = true;
    ownerService
      .getTables(selectedRestaurantId, selectedDate, { status: 'active' })
      .then((res) => {
        if (!active) return;
        setTablesCatalog(Array.isArray(res?.items) ? res.items : []);
        setDiningAreas(Array.isArray(res?.diningAreas) ? res.diningAreas : []);
      })
      .catch(() => {
        if (active) {
          setTablesCatalog([]);
          setDiningAreas([]);
        }
      });

    return () => {
      active = false;
    };
  }, [selectedRestaurantId, selectedDate]);

  const weekBounds = useMemo(() => getWeekBounds(selectedDate), [selectedDate]);

  const loadReservations = useCallback(
    async (silent = false) => {
      if (!silent) {
        setLoading(true);
      }
      setError(null);

      try {
        const params = {
          status: statusFilter !== 'all' ? statusFilter : undefined,
          group: groupFilter !== 'all' ? groupFilter : undefined,
          tableId: tableFilter !== 'all' ? tableFilter : undefined,
          diningArea: areaFilter !== 'all' ? areaFilter : undefined,
          search: debouncedSearch || undefined,
          page: viewMode === 'list' ? page : 1,
          perPage: viewMode === 'list' ? 20 : 100,
        };

        if (viewMode === 'week') {
          params.dateFrom = weekBounds.start;
          params.dateTo = weekBounds.end;
        } else {
          params.date = selectedDate;
        }

        const [listResult, calendarResult] = await Promise.all([
          ownerService.getReservations(selectedRestaurantId, params),
          ownerService.getReservationCalendar(selectedRestaurantId, calendarMonth).catch(() => null),
        ]);

        setReservations(Array.isArray(listResult?.items) ? listResult.items : []);
        if (listResult?.pagination) {
          setPagination(listResult.pagination);
        }
        if (listResult?.summary) {
          setSummary(listResult.summary);
        }
        if (calendarResult?.days) {
          const map = {};
          calendarResult.days.forEach((d) => {
            map[d.date] = d;
          });
          setCalendarDaysMap(map);
        }
      } catch (err) {
        setError(err?.message || 'Unable to load reservations.');
      } finally {
        if (!silent) {
          setLoading(false);
        }
      }
    },
    [
      selectedRestaurantId,
      viewMode,
      selectedDate,
      weekBounds.start,
      weekBounds.end,
      calendarMonth,
      statusFilter,
      groupFilter,
      tableFilter,
      areaFilter,
      debouncedSearch,
      page,
    ],
  );

  useEffect(() => {
    loadReservations();
  }, [loadReservations]);

  // Auto-refresh every 60 seconds and on window focus (paused while any modal is open)
  useEffect(() => {
    if (anyModalOpen) return undefined;

    const interval = setInterval(() => {
      loadReservations(true);
    }, 60000);

    const onFocus = () => {
      loadReservations(true);
    };

    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [anyModalOpen, loadReservations]);

  const isActionPermitted = useCallback(
    (actionKey) => {
      switch (actionKey) {
        case 'approve':
          return canApprove;
        case 'reject':
          return canReject;
        case 'reassign_table':
          return canAssignTables;
        case 'arrived':
        case 'no_show':
          return canManageArrival;
        case 'confirm_deposit':
        case 'seat':
        case 'complete':
        case 'cancel':
          return canUpdateStatus;
        default:
          return false;
      }
    },
    [canApprove, canReject, canAssignTables, canManageArrival, canUpdateStatus],
  );

  const visibleActionsFor = useCallback(
    (res) => (res?.allowedActions || []).filter((action) => isActionPermitted(action)),
    [isActionPermitted],
  );

  const monthMatrixDays = useMemo(() => {
    const [y, m] = calendarMonth.split('-').map(Number);
    const firstDay = new Date(Date.UTC(y, m - 1, 1));
    const startOffset = (firstDay.getUTCDay() + 6) % 7; // Mon=0
    const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const cells = [];

    for (let i = startOffset - 1; i >= 0; i -= 1) {
      const dt = new Date(Date.UTC(y, m - 1, -i));
      const key = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
      cells.push({ dateKey: key, dayNum: dt.getUTCDate(), isOutside: true });
    }

    for (let d = 1; d <= daysInMonth; d += 1) {
      const key = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({ dateKey: key, dayNum: d, isOutside: false });
    }

    const targetLen = cells.length > 35 ? 42 : 35;
    let nextD = 1;
    while (cells.length < targetLen) {
      const dt = new Date(Date.UTC(y, m, nextD++));
      const key = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
      cells.push({ dateKey: key, dayNum: dt.getUTCDate(), isOutside: true });
    }

    return cells;
  }, [calendarMonth]);

  const timeGroupedSlots = useMemo(() => {
    const groups = new Map();
    reservations.forEach((res) => {
      const timeKey = res.time || '00:00';
      if (!groups.has(timeKey)) {
        groups.set(timeKey, {
          timeKey,
          timeLabel: formatManilaTime(res.reservationStart) || timeKey,
          items: [],
        });
      }
      groups.get(timeKey).items.push(res);
    });
    return Array.from(groups.values());
  }, [reservations]);

  const reservationsByDate = useMemo(() => {
    const map = {};
    reservations.forEach((res) => {
      if (!res.date) return;
      if (!map[res.date]) map[res.date] = [];
      map[res.date].push(res);
    });
    return map;
  }, [reservations]);

  function showToastMessage(type, text) {
    setToast({ type, text });
  }

  function shiftDateOrPeriod(step) {
    if (viewMode === 'week') {
      const next = addDaysToKey(selectedDate, step * 7);
      setSelectedDate(next);
      setCalendarMonth(monthKeyFromDateKey(next));
    } else {
      const next = addDaysToKey(selectedDate, step);
      setSelectedDate(next);
      setCalendarMonth(monthKeyFromDateKey(next));
    }
    setPage(1);
  }

  function shiftCalendarMonth(step) {
    const [y, m] = calendarMonth.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1 + step, 1));
    setCalendarMonth(`${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}`);
  }

  function jumpToToday() {
    setSelectedDate(todayKey);
    setCalendarMonth(monthKeyFromDateKey(todayKey));
    setPage(1);
  }

  async function openDetailModal(res) {
    setDetailRes(res);
    setDetailLoading(true);
    try {
      const full = await ownerService.getReservation(selectedRestaurantId, res.id);
      if (full) setDetailRes(full);
    } catch {
      // keep summary row if detail fails
    } finally {
      setDetailLoading(false);
    }
  }

  async function runDirectAction(res, actionKey) {
    setBusyActionId(res.id);
    try {
      let updated = null;
      let successMsg = 'Reservation updated.';

      if (actionKey === 'approve') {
        updated = await ownerService.approveReservation(selectedRestaurantId, res.id);
        successMsg =
          updated?.statusCode === 'awaiting_payment'
            ? `Approved (${res.reference}) — Awaiting deposit settlement.`
            : `Confirmed (${res.reference}) — Table reserved.`;
      } else if (actionKey === 'confirm_deposit') {
        updated = await ownerService.confirmReservationDeposit(selectedRestaurantId, res.id);
        successMsg = `Deposit confirmed (${res.reference}) — Reservation is now Confirmed.`;
      } else if (actionKey === 'arrived') {
        updated = await ownerService.markReservationArrived(selectedRestaurantId, res.id);
        successMsg = `${res.guestName} marked as Arrived.`;
      } else if (actionKey === 'complete') {
        updated = await ownerService.completeReservation(selectedRestaurantId, res.id);
        successMsg = `Reservation ${res.reference} completed.`;
      } else if (actionKey === 'no_show') {
        updated = await ownerService.markReservationNoShow(selectedRestaurantId, res.id);
        successMsg = `Reservation ${res.reference} marked as No-Show.`;
      }

      showToastMessage('success', successMsg);
      if (detailRes && detailRes.id === res.id && updated) {
        setDetailRes(updated);
      }
      await loadReservations(true);
    } catch (err) {
      showToastMessage('error', err?.message || 'Action could not be completed.');
      await loadReservations(true);
    } finally {
      setBusyActionId(null);
    }
  }

  function handleActionClick(res, actionKey) {
    if (actionKey === 'reject' || actionKey === 'cancel') {
      setReasonModal({ mode: actionKey, res });
      setReasonInput('');
      setRefundDepositOnCancel(true);
      setReasonError('');
      return;
    }

    if (actionKey === 'seat') {
      setSeatModal({ res });
      setSeatTableId(res.tableId ? String(res.tableId) : '');
      setSeatError('');
      return;
    }

    if (actionKey === 'reassign_table') {
      setReassignModal({ res });
      setReassignTableId(res.tableId ? String(res.tableId) : '');
      setReassignError('');
      return;
    }

    runDirectAction(res, actionKey);
  }

  async function handleSubmitReasonModal(e) {
    e.preventDefault();
    if (!reasonModal) return;
    const trimmed = reasonInput.trim();
    if (trimmed.length < 3) {
      setReasonError('Please provide a reason (at least 3 characters).');
      return;
    }

    setBusyActionId(reasonModal.res.id);
    setReasonError('');
    try {
      let updated = null;
      if (reasonModal.mode === 'reject') {
        updated = await ownerService.rejectReservation(selectedRestaurantId, reasonModal.res.id, trimmed);
        showToastMessage('success', `Reservation ${reasonModal.res.reference} declined.`);
      } else {
        const isPaid = reasonModal.res.depositStatus === 'paid';
        updated = await ownerService.cancelReservation(
          selectedRestaurantId,
          reasonModal.res.id,
          trimmed,
          isPaid ? { refundDeposit: refundDepositOnCancel } : {},
        );
        if (updated?.depositActionNeeded) {
          showToastMessage('warning', `Reservation ${reasonModal.res.reference} cancelled. Remember to mark the ₱${Number(reasonModal.res.depositAmount || 0).toFixed(2)} deposit as refunded once returned.`);
        } else {
          showToastMessage('success', `Reservation ${reasonModal.res.reference} cancelled.`);
        }
      }

      if (detailRes && detailRes.id === reasonModal.res.id && updated) {
        setDetailRes(updated);
      }
      setReasonModal(null);
      await loadReservations(true);
    } catch (err) {
      setReasonError(err?.message || 'Unable to update reservation.');
      await loadReservations(true);
    } finally {
      setBusyActionId(null);
    }
  }

  async function handleSubmitSeatModal(e) {
    e.preventDefault();
    if (!seatModal) return;

    setBusyActionId(seatModal.res.id);
    setSeatError('');
    try {
      const targetTable = seatTableId ? Number(seatTableId) : null;
      const updated = await ownerService.seatReservation(selectedRestaurantId, seatModal.res.id, targetTable);
      showToastMessage('success', `${seatModal.res.guestName} is now Seated.`);
      if (detailRes && detailRes.id === seatModal.res.id && updated) {
        setDetailRes(updated);
      }
      setSeatModal(null);
      await loadReservations(true);
    } catch (err) {
      setSeatError(err?.message || 'Unable to seat guest.');
      await loadReservations(true);
    } finally {
      setBusyActionId(null);
    }
  }

  async function handleSubmitReassignModal(e) {
    e.preventDefault();
    if (!reassignModal || !reassignTableId) {
      setReassignError('Please select a target table.');
      return;
    }

    setBusyActionId(reassignModal.res.id);
    setReassignError('');
    try {
      const updated = await ownerService.assignReservationTable(
        selectedRestaurantId,
        reassignModal.res.id,
        Number(reassignTableId),
      );
      showToastMessage(
        'success',
        `Reservation ${reassignModal.res.reference} moved to Table ${updated?.tableName || reassignTableId}.`,
      );
      if (detailRes && detailRes.id === reassignModal.res.id && updated) {
        setDetailRes(updated);
      }
      setReassignModal(null);
      await loadReservations(true);
    } catch (err) {
      setReassignError(err?.message || 'Unable to reassign table.');
      await loadReservations(true);
    } finally {
      setBusyActionId(null);
    }
  }

  async function handleSubmitDepositModal(e) {
    e.preventDefault();
    if (!depositModal) return;

    setBusyActionId(depositModal.res.id);
    setDepositError('');
    try {
      const updated = await ownerService.recordReservationPayment(selectedRestaurantId, depositModal.res.id, {
        action: depositModal.action,
        note: depositNote.trim() || null,
      });
      if (detailRes && detailRes.id === depositModal.res.id && updated) {
        setDetailRes(updated);
      }
      const actionLabels = {
        mark_paid: 'Deposit marked as received.',
        waive: 'Deposit waived.',
        refund: 'Deposit marked as refunded.',
      };
      showToastMessage('success', `${actionLabels[depositModal.action] || 'Deposit updated.'} (${depositModal.res.reference})`);
      setDepositModal(null);
      await loadReservations(true);
    } catch (err) {
      setDepositError(err?.message || 'Unable to update deposit status.');
      if (err?.code === 'RESERVATION_EXPIRED') {
        showToastMessage('error', err.message);
        setDepositModal(null);
        await loadReservations(true);
      }
    } finally {
      setBusyActionId(null);
    }
  }

  const [preOrderBusy, setPreOrderBusy] = useState(false);

  async function handlePreOrderStatus(res, action) {
    if (!res || preOrderBusy) return;
    let reason = null;
    if (action === 'reject') {
      const entered = window.prompt('Enter reason for declining this pre-order:');
      if (!entered || !entered.trim()) return;
      reason = entered.trim();
    }
    setPreOrderBusy(true);
    try {
      const updatedPreOrder = await ownerService.updateReservationPreOrderStatus(
        restaurantId,
        res.reservationId || res.id,
        { action, reason },
      );
      setDetailRes((prev) => (prev && prev.id === res.id ? { ...prev, preOrder: updatedPreOrder } : prev));
      showToastMessage('success', `Pre-order updated to ${updatedPreOrder?.statusLabel || action}.`);
      await loadReservations(true);
    } catch (err) {
      showToastMessage('error', err?.message || 'Unable to update pre-order status.');
    } finally {
      setPreOrderBusy(false);
    }
  }

  function renderDepositButtons(res) {
    const depActions = Array.isArray(res?.allowedDepositActions) ? res.allowedDepositActions : [];
    if (depActions.length === 0) return null;
    const isBusy = busyActionId === res.id;
    const hasConfirmDeposit = (res?.allowedActions || []).includes('confirm_deposit');

    const depositBtnMeta = {
      mark_paid: { label: 'Mark deposit received', variant: 'secondary' },
      waive: { label: 'Waive deposit', variant: 'outline' },
      refund: { label: 'Mark as refunded', variant: 'outline' },
    };

    return depActions
      .filter((act) => !(act === 'mark_paid' && hasConfirmDeposit))
      .map((act) => {
        const meta = depositBtnMeta[act];
        if (!meta) return null;
        return (
          <Button
            key={`dep-${act}`}
            type="button"
            size="sm"
            variant={meta.variant}
            disabled={isBusy}
            onClick={(e) => {
              e.stopPropagation();
              setDepositModal({ action: act, res });
              setDepositNote('');
              setDepositError('');
            }}
          >
            {meta.label}
          </Button>
        );
      });
  }

  function renderActionButtons(res, compact = false) {
    const actions = visibleActionsFor(res);
    if (actions.length === 0) return null;
    const isBusy = busyActionId === res.id;

    const buttonMeta = {
      approve: { label: 'Approve', variant: 'primary' },
      confirm_deposit: { label: 'Confirm Deposit', variant: 'primary' },
      arrived: { label: 'Mark Arrived', variant: 'secondary' },
      seat: { label: 'Seat', variant: 'primary' },
      complete: { label: 'Complete', variant: 'primary' },
      reassign_table: { label: compact ? 'Table' : 'Change Table', variant: 'outline' },
      no_show: { label: 'No-Show', variant: 'ghost' },
      reject: { label: 'Reject', variant: 'danger-outline' },
      cancel: { label: 'Cancel', variant: 'danger-outline' },
    };

    return actions.map((actionKey) => {
      const meta = buttonMeta[actionKey] || { label: actionKey, variant: 'outline' };
      return (
        <Button
          key={actionKey}
          type="button"
          size="sm"
          variant={meta.variant}
          disabled={isBusy}
          onClick={(e) => {
            e.stopPropagation();
            handleActionClick(res, actionKey);
          }}
        >
          {meta.label}
        </Button>
      );
    });
  }

  const fittingTablesForModal = (res) => {
    if (!res) return tablesCatalog;
    return tablesCatalog.filter(
      (t) => t.isActive && res.partySize >= (t.minPartySize || 1) && res.partySize <= t.capacity,
    );
  };

  const hasFilters =
    statusFilter !== 'all' ||
    groupFilter !== 'all' ||
    tableFilter !== 'all' ||
    areaFilter !== 'all' ||
    debouncedSearch !== '';

  return (
    <OwnerLayout>
      <div className="owner-reservations-page">
        {/* Header */}
        <header className="owner-reservations__header">
          <div className="owner-reservations__header-left">
            <span className="owner-reservations__badge">
              Table Service &amp; Floor Operations
            </span>
            <h1 className="owner-reservations__title">
              Reservations
              {summary.pendingTotalUpcoming > 0 && (
                <Badge variant="warning" size="sm" style={{ marginLeft: 10, verticalAlign: 'middle' }}>
                  {summary.pendingTotalUpcoming} pending
                </Badge>
              )}
            </h1>
            <p className="owner-reservations__desc">
              Review incoming bookings, confirm deposits, track guest arrivals, and manage table seating in real time.
            </p>
          </div>

          <div className="owner-reservations__header-right">
            {sectionTab === 'reservations' && (
              <>
                <div style={{ textAlign: 'right', fontSize: 12, color: 'var(--text-secondary)' }}>
                  <div>Expected Covers</div>
                  <strong style={{ fontSize: 18, color: 'var(--text-primary)' }}>
                    {summary.expectedCovers} guests
                  </strong>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => loadReservations()}>
                  Refresh
                </Button>
              </>
            )}
          </div>
        </header>

        <div className="owner-dining-tabs" role="tablist" aria-label="Dining and tables sections">
          <button
            type="button"
            role="tab"
            aria-selected={sectionTab === 'reservations'}
            className={`owner-dining-tab ${sectionTab === 'reservations' ? 'is-active' : ''}`.trim()}
            onClick={() => setSectionTab('reservations')}
          >
            Reservations
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={sectionTab === 'tables'}
            className={`owner-dining-tab ${sectionTab === 'tables' ? 'is-active' : ''}`.trim()}
            onClick={() => setSectionTab('tables')}
          >
            Tables
          </button>
        </div>

        {sectionTab === 'tables' ? (
          <OwnerTablesPage embedded />
        ) : (
          <>

        {/* Toast Banner */}
        {toast && (
          <div
            role="status"
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 12,
              padding: '12px 16px',
              borderRadius: 'var(--radius-md, 10px)',
              background:
                toast.type === 'error'
                  ? 'rgba(220, 38, 38, 0.08)'
                  : 'rgba(16, 185, 129, 0.1)',
              border:
                toast.type === 'error'
                  ? '1px solid rgba(220, 38, 38, 0.25)'
                  : '1px solid rgba(16, 185, 129, 0.25)',
              color: toast.type === 'error' ? '#b91c1c' : '#065f46',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            <span>{toast.text}</span>
            <button
              type="button"
              onClick={() => setToast(null)}
              style={{ background: 'none', border: 'none', color: 'inherit', fontWeight: 700, cursor: 'pointer' }}
            >
              Dismiss
            </button>
          </div>
        )}

        {/* 6 Stat Cards */}
        <section className="owner-stats-section" aria-label="Reservation summary">
          <div className="owner-stat-grid--6">
            <button
              type="button"
              className={`owner-stat-box ${statusFilter === 'all' && groupFilter === 'all' ? 'is-active' : ''}`}
              onClick={() => {
                setStatusFilter('all');
                setGroupFilter('all');
              }}
            >
              <div className="owner-stat-box__icon-wrap icon-badge--blue"><ClipboardIcon size={16} /></div>
              <div className="owner-stat-box__content">
                <span className="owner-stat-box__label">Total</span>
                <p className="owner-stat-box__count">{summary.total}</p>
              </div>
            </button>

            <button
              type="button"
              className={`owner-stat-box ${statusFilter === 'pending' ? 'is-active' : ''}`}
              onClick={() => {
                setGroupFilter('all');
                setStatusFilter(statusFilter === 'pending' ? 'all' : 'pending');
              }}
            >
              <div className="owner-stat-box__icon-wrap icon-badge--orange">⏳</div>
              <div className="owner-stat-box__content">
                <span className="owner-stat-box__label">Pending</span>
                <p className="owner-stat-box__count">{summary.pending}</p>
              </div>
            </button>

            <button
              type="button"
              className={`owner-stat-box ${statusFilter === 'confirmed,approved,awaiting_payment' ? 'is-active' : ''}`}
              onClick={() => {
                setGroupFilter('all');
                setStatusFilter(
                  statusFilter === 'confirmed,approved,awaiting_payment'
                    ? 'all'
                    : 'confirmed,approved,awaiting_payment',
                );
              }}
            >
              <div className="owner-stat-box__icon-wrap icon-badge--green"><CheckCircleIcon size={16} /></div>
              <div className="owner-stat-box__content">
                <span className="owner-stat-box__label">Confirmed</span>
                <p className="owner-stat-box__count">{summary.confirmed}</p>
              </div>
            </button>

            <button
              type="button"
              className={`owner-stat-box ${statusFilter === 'arrived,seated' ? 'is-active' : ''}`}
              onClick={() => {
                setGroupFilter('all');
                setStatusFilter(statusFilter === 'arrived,seated' ? 'all' : 'arrived,seated');
              }}
            >
              <div className="owner-stat-box__icon-wrap icon-badge--purple"><UtensilsIcon size={16} /></div>
              <div className="owner-stat-box__content">
                <span className="owner-stat-box__label">In House</span>
                <p className="owner-stat-box__count">{summary.inHouse}</p>
              </div>
            </button>

            <button
              type="button"
              className={`owner-stat-box ${statusFilter === 'completed' ? 'is-active' : ''}`}
              onClick={() => {
                setGroupFilter('all');
                setStatusFilter(statusFilter === 'completed' ? 'all' : 'completed');
              }}
            >
              <div className="owner-stat-box__icon-wrap icon-badge--teal"><FlagIcon size={16} /></div>
              <div className="owner-stat-box__content">
                <span className="owner-stat-box__label">Completed</span>
                <p className="owner-stat-box__count">{summary.completed}</p>
              </div>
            </button>

            <button
              type="button"
              className={`owner-stat-box ${statusFilter === 'cancelled,rejected,expired,no_show' ? 'is-active' : ''}`}
              onClick={() => {
                setGroupFilter('all');
                setStatusFilter(
                  statusFilter === 'cancelled,rejected,expired,no_show'
                    ? 'all'
                    : 'cancelled,rejected,expired,no_show',
                );
              }}
            >
              <div className="owner-stat-box__icon-wrap icon-badge--red">✕</div>
              <div className="owner-stat-box__content">
                <span className="owner-stat-box__label">Cancelled / Missed</span>
                <p className="owner-stat-box__count">{summary.cancelledOrMissed}</p>
              </div>
            </button>
          </div>
        </section>

        {/* Calendar & View Navigation */}
        <section className="owner-cal-nav" aria-label="Calendar navigation">
          <div className="owner-cal-nav__left">
            <h2 className="owner-cal-nav__period-title">
              {viewMode === 'week'
                ? `${weekBounds.start} — ${weekBounds.end}`
                : new Date(`${selectedDate}T00:00:00`).toLocaleDateString('en-US', {
                    weekday: 'short',
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                  })}
            </h2>
            <div className="owner-cal-nav__buttons">
              <button
                type="button"
                className="owner-cal-nav__arrow-btn"
                onClick={() => shiftDateOrPeriod(-1)}
                aria-label="Previous"
              >
                ‹
              </button>
              <button type="button" className="owner-cal-nav__today-btn" onClick={jumpToToday}>
                Today
              </button>
              <button
                type="button"
                className="owner-cal-nav__arrow-btn"
                onClick={() => shiftDateOrPeriod(1)}
                aria-label="Next"
              >
                ›
              </button>
              <input
                type="date"
                aria-label="Select date"
                value={selectedDate}
                onChange={(e) => {
                  const next = e.target.value || todayKey;
                  setSelectedDate(next);
                  setCalendarMonth(monthKeyFromDateKey(next));
                  setPage(1);
                }}
                style={{
                  height: 34,
                  padding: '0 8px',
                  borderRadius: 8,
                  border: '1px solid var(--border-primary)',
                  fontSize: 12,
                  background: 'var(--surface-primary)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>
          </div>

          <div className="owner-cal-nav__search-box">
            <input
              type="search"
              className="input"
              placeholder="Search ref, guest, phone, email..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              style={{ width: '100%', height: 34, fontSize: 12 }}
            />
          </div>

          <div className="owner-cal-nav__view-switcher" role="group" aria-label="View modes">
            <button
              type="button"
              className={`owner-cal-nav__view-tab ${viewMode === 'day' ? 'is-active' : ''}`}
              onClick={() => setViewMode('day')}
            >
              Day Schedule
            </button>
            <button
              type="button"
              className={`owner-cal-nav__view-tab ${viewMode === 'week' ? 'is-active' : ''}`}
              onClick={() => setViewMode('week')}
            >
              Week Grid
            </button>
            <button
              type="button"
              className={`owner-cal-nav__view-tab ${viewMode === 'list' ? 'is-active' : ''}`}
              onClick={() => setViewMode('list')}
            >
              List View
            </button>
          </div>
        </section>

        {/* Filter Bar */}
        <section className="owner-mgmt-toolbar" aria-label="Reservation filters">
          <div className="owner-mgmt-filters">
            <select
              aria-label="Filter by status"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              style={{ height: 34, borderRadius: 8, border: '1px solid var(--border-primary)', padding: '0 10px', fontSize: 12 }}
            >
              <option value="all">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="awaiting_payment">Awaiting Deposit</option>
              <option value="confirmed">Confirmed</option>
              <option value="arrived">Arrived</option>
              <option value="seated">Seated</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
              <option value="rejected">Rejected</option>
              <option value="no_show">No-Show</option>
              <option value="expired">Expired</option>
            </select>

            <select
              aria-label="Filter by dining area"
              value={areaFilter}
              onChange={(e) => {
                setAreaFilter(e.target.value);
                setPage(1);
              }}
              style={{ height: 34, borderRadius: 8, border: '1px solid var(--border-primary)', padding: '0 10px', fontSize: 12 }}
            >
              <option value="all">All Dining Areas</option>
              {diningAreas.map((area) => (
                <option key={area} value={area}>
                  {area}
                </option>
              ))}
            </select>

            <select
              aria-label="Filter by table"
              value={tableFilter}
              onChange={(e) => {
                setTableFilter(e.target.value);
                setPage(1);
              }}
              style={{ height: 34, borderRadius: 8, border: '1px solid var(--border-primary)', padding: '0 10px', fontSize: 12 }}
            >
              <option value="all">All Tables</option>
              {tablesCatalog.map((t) => (
                <option key={t.id} value={String(t.id)}>
                  Table {t.tableName} ({t.capacity}p)
                </option>
              ))}
            </select>

            {hasFilters && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setStatusFilter('all');
                  setGroupFilter('all');
                  setTableFilter('all');
                  setAreaFilter('all');
                  setSearchInput('');
                  setDebouncedSearch('');
                  setPage(1);
                }}
              >
                Reset Filters
              </Button>
            )}
          </div>
        </section>

        {/* Main Content */}
        {loading ? (
          <StateView
            state="loading"
            title="Loading reservations..."
            description="Fetching schedule, table assignments, and guest history."
          />
        ) : error ? (
          <StateView
            state="error"
            title="Unable to load reservations"
            description={error}
            onRetry={() => loadReservations()}
          />
        ) : viewMode === 'day' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
            {/* Month Overview Card */}
            <div className="owner-month-grid-card">
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '10px 16px',
                  borderBottom: '1px solid var(--border-primary)',
                }}
              >
                <strong style={{ fontSize: 13 }}>
                  {new Date(`${calendarMonth}-01T00:00:00`).toLocaleDateString('en-US', {
                    month: 'long',
                    year: 'numeric',
                  })}
                </strong>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    type="button"
                    className="owner-cal-nav__arrow-btn"
                    onClick={() => shiftCalendarMonth(-1)}
                    aria-label="Previous month"
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    className="owner-cal-nav__arrow-btn"
                    onClick={() => shiftCalendarMonth(1)}
                    aria-label="Next month"
                  >
                    ›
                  </button>
                </div>
              </div>

              <div className="owner-month-grid__days-header">
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
                  <span key={d} className="owner-month-grid__day-label">
                    {d}
                  </span>
                ))}
              </div>

              <div className="owner-month-grid__matrix">
                {monthMatrixDays.map((cell) => {
                  const dayStats = calendarDaysMap[cell.dateKey];
                  const isSelected = cell.dateKey === selectedDate;
                  const isToday = cell.dateKey === todayKey;

                  return (
                    <button
                      key={cell.dateKey}
                      type="button"
                      className={`owner-month-cell ${cell.isOutside ? 'is-outside-month' : ''} ${isSelected ? 'is-selected' : ''} ${isToday ? 'is-today' : ''}`}
                      onClick={() => {
                        setSelectedDate(cell.dateKey);
                        if (cell.isOutside) {
                          setCalendarMonth(monthKeyFromDateKey(cell.dateKey));
                        }
                      }}
                    >
                      <div className="owner-month-cell__header">
                        <span className="owner-month-cell__num">{cell.dayNum}</span>
                        {dayStats && dayStats.total > 0 && (
                          <span className="owner-month-cell__cap-badge owner-month-cell__cap-badge--available">
                            {dayStats.covers}p
                          </span>
                        )}
                      </div>

                      {dayStats && dayStats.total > 0 && (
                        <div className="owner-month-cell__bookings-list">
                          {dayStats.pending > 0 && (
                            <span className="owner-month-chip owner-month-chip--pending">
                              <span>Pending</span>
                              <span>{dayStats.pending}</span>
                            </span>
                          )}
                          {(dayStats.confirmed + dayStats.inHouse) > 0 && (
                            <span className="owner-month-chip owner-month-chip--confirmed">
                              <span>Confirmed / In</span>
                              <span>{dayStats.confirmed + dayStats.inHouse}</span>
                            </span>
                          )}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Daily Schedule Card */}
            <section className="owner-daily-schedule-card" aria-label="Daily schedule">
              <div className="owner-daily-schedule__header">
                <div className="owner-daily-schedule__title-area">
                  <h3 className="owner-daily-schedule__title">
                    Schedule for {selectedDate}
                  </h3>
                  <span className="owner-daily-schedule__meta">
                    {reservations.length} {reservations.length === 1 ? 'reservation' : 'reservations'} · {summary.expectedCovers} expected covers
                  </span>
                </div>
              </div>

              {reservations.length === 0 ? (
                <StateView
                  state="empty"
                  title={hasFilters ? 'No reservations match your filters' : 'No reservations for this day'}
                  description={
                    hasFilters
                      ? 'Try clearing your search or status/table filters.'
                      : 'Select another date on the calendar above or wait for new customer bookings.'
                  }
                />
              ) : (
                <div className="owner-daily-schedule__slots-list">
                  {timeGroupedSlots.map((slot) => (
                    <div key={slot.timeKey} className="owner-slot-card">
                      <div className="owner-slot-card__header">
                        <span className="owner-slot-card__time"><ClockIcon size={14} /> {slot.timeLabel}</span>
                        <span className="owner-slot-card__cap-pill owner-slot-card__cap-pill--available">
                          {slot.items.length} {slot.items.length === 1 ? 'booking' : 'bookings'}
                        </span>
                      </div>

                      <div className="owner-slot-card__body">
                        {slot.items.map((res) => {
                          const statusMeta = STATUS_BADGE_MAP[res.statusCode] || STATUS_BADGE_MAP.pending;
                          const hasDeposit = Number(res.depositAmount || 0) > 0 && res.depositStatus !== 'none';
                          const depositMeta = hasDeposit ? (DEPOSIT_BADGE_MAP[res.depositDisplayStatus || res.depositStatus] || null) : null;
                          const attentionMeta = res.attention ? ATTENTION_META[res.attention] : null;
                          const guestInitial = (res.guestName || 'G').charAt(0).toUpperCase();

                          return (
                            <div
                              key={res.id}
                              className="owner-slot-booking-item"
                              onClick={() => openDetailModal(res)}
                              style={{ cursor: 'pointer' }}
                            >
                              <div className="owner-slot-booking-item__guest">
                                <div className="owner-slot-booking-item__avatar">{guestInitial}</div>
                                <div className="owner-slot-booking-item__info">
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                    <h4 className="owner-slot-booking-item__name">{res.guestName}</h4>
                                    <Badge variant={statusMeta.variant} size="xs" dot>
                                      {statusMeta.label}
                                    </Badge>
                                    {depositMeta && (
                                      <Badge variant={depositMeta.variant} size="xs">
                                        {depositMeta.label}
                                      </Badge>
                                    )}
                                    {attentionMeta && (
                                      <Badge variant={attentionMeta.variant} size="xs">
                                        {attentionMeta.label}
                                      </Badge>
                                    )}
                                  </div>
                                  <div className="owner-slot-booking-item__meta">
                                    <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{res.reference}</span>
                                    <span>·</span>
                                    <span>
                                      {formatManilaTime(res.reservationStart)}–{formatManilaTime(res.reservationEnd)}
                                    </span>
                                    <span>·</span>
                                    <span><UsersIcon size={13} /> {res.partySize}</span>
                                    {(res.statusCode === 'pending' || res.statusCode === 'awaiting_payment') && res.expiresAt && (() => {
                                      const exp = formatTimeUntilExpiry(res.expiresAt);
                                      if (!exp) return null;
                                      return (
                                        <>
                                          <span>·</span>
                                          <span style={{ color: exp.expired ? '#b91c1c' : '#b45309', fontWeight: 600 }}>
                                            {exp.expired ? 'Expired' : `Expires in ${exp.label}`}
                                          </span>
                                        </>
                                      );
                                    })()}
                                    <span>·</span>
                                    <span>
                                      <TableIcon size={13} /> {res.tableName ? `Table ${res.tableName}` : 'Unassigned'}
                                      {res.diningArea ? ` (${res.diningArea})` : ''}
                                    </span>
                                    {res.guestPhone && (
                                      <>
                                        <span>·</span>
                                        <span><PhoneIcon size={13} /> {res.guestPhone}</span>
                                      </>
                                    )}
                                  </div>
                                  <div className="owner-slot-booking-item__meta">
                                    <span>
                                      History: {res.guestHistory.visits} visits · {res.guestHistory.noShows} no-shows
                                    </span>
                                    {res.preOrder && (
                                      <>
                                        <span>·</span>
                                        <Badge variant={res.preOrder.orderStatus === 'ready' || res.preOrder.orderStatus === 'completed' ? 'success' : res.preOrder.orderStatus === 'cancelled' || res.preOrder.orderStatus === 'rejected' ? 'default' : 'info'}>
                                          Pre-Order: {res.preOrder.itemCount} dish(es) · ₱{Number(res.preOrder.totalAmount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} · {res.preOrder.statusLabel}
                                        </Badge>
                                      </>
                                    )}
                                    {res.specialRequests && (
                                      <>
                                        <span>·</span>
                                        <span title={res.specialRequests}>
                                          Note: “{res.specialRequests.length > 60 ? `${res.specialRequests.slice(0, 60)}…` : res.specialRequests}”
                                        </span>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>

                              <div className="owner-slot-booking-item__actions">
                                {renderActionButtons(res)}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        ) : viewMode === 'week' ? (
          <div className="owner-week-grid">
            {weekBounds.days.map((dayKey) => {
              const dayItems = reservationsByDate[dayKey] || [];
              const dt = new Date(`${dayKey}T00:00:00`);
              const isToday = dayKey === todayKey;

              return (
                <div key={dayKey} className={`owner-week-column ${isToday ? 'is-today' : ''}`}>
                  <div className="owner-week-column__header">
                    <span className="owner-week-column__day-name">
                      {dt.toLocaleDateString('en-US', { weekday: 'short' })}
                    </span>
                    <span className="owner-week-column__day-date">{dt.getDate()}</span>
                  </div>
                  <div className="owner-week-column__bookings">
                    {dayItems.length === 0 ? (
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', marginTop: 12 }}>
                        No bookings
                      </span>
                    ) : (
                      dayItems.map((res) => {
                        const statusMeta = STATUS_BADGE_MAP[res.statusCode] || STATUS_BADGE_MAP.pending;
                        return (
                          <button
                            key={res.id}
                            type="button"
                            className="owner-week-card"
                            onClick={() => openDetailModal(res)}
                          >
                            <div className="owner-week-card__top">
                              <span className="owner-week-card__time">{formatManilaTime(res.reservationStart)}</span>
                              <Badge variant={statusMeta.variant} size="xs">
                                {statusMeta.label}
                              </Badge>
                            </div>
                            <span className="owner-week-card__guest">{res.guestName}</span>
                            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                              <UsersIcon size={13} /> {res.partySize} · {res.tableName ? `T-${res.tableName}` : 'No table'}
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* List View */
          <section className="owner-mgmt-section">
            {reservations.length === 0 ? (
              <StateView
                state="empty"
                title={hasFilters ? 'No reservations match your filters' : 'No reservations for this day'}
                description="Adjust your filters or select another date."
              />
            ) : (
              <>
                <div className="owner-mgmt-table-wrapper">
                  <table className="owner-mgmt-table">
                    <thead>
                      <tr>
                        <th>Ref &amp; Time</th>
                        <th>Guest</th>
                        <th>Party</th>
                        <th>Table &amp; Area</th>
                        <th>Status &amp; Deposit</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reservations.map((res) => {
                        const statusMeta = STATUS_BADGE_MAP[res.statusCode] || STATUS_BADGE_MAP.pending;
                        const hasDeposit = Number(res.depositAmount || 0) > 0 && res.depositStatus !== 'none';
                        const depositMeta = hasDeposit ? (DEPOSIT_BADGE_MAP[res.depositDisplayStatus || res.depositStatus] || null) : null;

                        return (
                          <tr
                            key={res.id}
                            onClick={() => openDetailModal(res)}
                            style={{ cursor: 'pointer' }}
                          >
                            <td>
                              <div style={{ fontFamily: 'monospace', fontWeight: 700 }}>{res.reference}</div>
                              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                                {formatManilaTime(res.reservationStart)}–{formatManilaTime(res.reservationEnd)}
                              </div>
                            </td>
                            <td>
                              <strong>{res.guestName}</strong>
                              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                                {res.guestPhone || res.customerEmail || '—'}
                              </div>
                            </td>
                            <td>{res.partySize}</td>
                            <td>
                              {res.tableName ? `Table ${res.tableName}` : 'Unassigned'}
                              {res.diningArea && (
                                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                                  {res.diningArea}
                                </div>
                              )}
                            </td>
                            <td>
                              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                <Badge variant={statusMeta.variant} size="xs" dot>
                                  {statusMeta.label}
                                </Badge>
                                {depositMeta && (
                                  <Badge variant={depositMeta.variant} size="xs">
                                    {depositMeta.label}
                                  </Badge>
                                )}
                              </div>
                            </td>
                            <td>
                              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                {renderActionButtons(res, true)}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {pagination.last_page > 1 && (
                  <div className="owner-mgmt-pagination">
                    <span>
                      Page {pagination.current_page} of {pagination.last_page} ({pagination.total} total)
                    </span>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={pagination.current_page <= 1}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                      >
                        Previous
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={pagination.current_page >= pagination.last_page}
                        onClick={() => setPage((p) => p + 1)}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </section>
        )}

        {/* Detail Modal */}
        <Modal
          open={Boolean(detailRes)}
          onClose={() => setDetailRes(null)}
          title={detailRes ? `Reservation ${detailRes.reference}` : 'Reservation Details'}
          size="md"
        >
          {detailRes && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, fontSize: 13 }}>
                <div>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block' }}>Guest</span>
                  <strong>{detailRes.guestName}</strong>
                  {detailRes.guestPhone && (
                    <div>
                      <a href={sanitizeTelHref(detailRes.guestPhone)} style={{ color: 'var(--accent)', fontSize: 12 }}>
                        <PhoneIcon size={13} /> {detailRes.guestPhone}
                      </a>
                    </div>
                  )}
                  {detailRes.customerEmail && (
                    <div>
                      <a href={sanitizeMailtoHref(detailRes.customerEmail)} style={{ color: 'var(--accent)', fontSize: 12 }}>
                        <MailIcon size={13} /> {detailRes.customerEmail}
                      </a>
                    </div>
                  )}
                </div>

                <div>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block' }}>Schedule &amp; Party</span>
                  <strong>
                    {detailRes.date} · {formatManilaTime(detailRes.reservationStart)}–{formatManilaTime(detailRes.reservationEnd)}
                  </strong>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    {detailRes.partySize} guests · {detailRes.tableName ? `Table ${detailRes.tableName}` : 'Unassigned'}
                    {detailRes.diningArea ? ` (${detailRes.diningArea})` : ''}
                  </div>
                </div>

                <div>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block' }}>Deposit &amp; Fee</span>
                  <strong>
                    Deposit: ₱{detailRes.depositAmount.toFixed(2)} ({DEPOSIT_BADGE_MAP[detailRes.depositDisplayStatus || detailRes.depositStatus]?.label || detailRes.depositDisplayStatus || detailRes.depositStatus})
                  </strong>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    Service Fee: ₱{detailRes.serviceFee.toFixed(2)}
                  </div>
                </div>

                <div>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block' }}>Guest History</span>
                  <strong>{detailRes.guestHistory.visits} completed visits</strong>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    {detailRes.guestHistory.noShows} no-shows · {detailRes.guestHistory.cancellations} cancellations
                  </div>
                </div>
              </div>

              {detailRes.specialRequests && (
                <div style={{ padding: 10, borderRadius: 8, background: 'var(--surface-secondary)', fontSize: 12 }}>
                  <strong>Special Requests:</strong> {detailRes.specialRequests}
                </div>
              )}

              {detailRes.preOrder && (
                <div style={{ padding: 12, borderRadius: 10, border: '1px solid var(--border-primary)', background: 'var(--surface-secondary)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                    <div>
                      <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', display: 'block' }}>
                        Dine-In Menu Pre-Order
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                        <strong style={{ fontSize: 13 }}>{detailRes.preOrder.orderReference}</strong>
                        <Badge variant={detailRes.preOrder.orderStatus === 'ready' || detailRes.preOrder.orderStatus === 'completed' ? 'success' : detailRes.preOrder.orderStatus === 'cancelled' || detailRes.preOrder.orderStatus === 'rejected' ? 'default' : 'info'}>
                          {detailRes.preOrder.statusLabel}
                        </Badge>
                      </div>
                    </div>
                    <strong style={{ fontSize: 14 }}>
                      ₱{Number(detailRes.preOrder.totalAmount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </strong>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {detailRes.preOrder.items.map((item) => (
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

                  {detailRes.preOrder.notes && (
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      <strong>Pre-Order Notes:</strong> {detailRes.preOrder.notes}
                    </div>
                  )}

                  {canUpdateStatus && Array.isArray(detailRes.preOrder.allowedActions) && detailRes.preOrder.allowedActions.length > 0 && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', paddingTop: 4 }}>
                      {detailRes.preOrder.allowedActions.includes('accept') && (
                        <Button size="sm" variant="primary" disabled={preOrderBusy} onClick={() => handlePreOrderStatus(detailRes, 'accept')}>
                          Accept Pre-Order
                        </Button>
                      )}
                      {detailRes.preOrder.allowedActions.includes('prepare') && (
                        <Button size="sm" variant="primary" disabled={preOrderBusy} onClick={() => handlePreOrderStatus(detailRes, 'prepare')}>
                          Start Preparing
                        </Button>
                      )}
                      {detailRes.preOrder.allowedActions.includes('ready') && (
                        <Button size="sm" variant="primary" disabled={preOrderBusy} onClick={() => handlePreOrderStatus(detailRes, 'ready')}>
                          Mark Ready for Dine-In
                        </Button>
                      )}
                      {detailRes.preOrder.allowedActions.includes('complete') && (
                        <Button size="sm" variant="primary" disabled={preOrderBusy} onClick={() => handlePreOrderStatus(detailRes, 'complete')}>
                          Mark Served / Completed
                        </Button>
                      )}
                      {detailRes.preOrder.allowedActions.includes('reject') && (
                        <Button size="sm" variant="outline" disabled={preOrderBusy} onClick={() => handlePreOrderStatus(detailRes, 'reject')}>
                          Decline Pre-Order
                        </Button>
                      )}
                      {detailRes.preOrder.allowedActions.includes('cancel') && (
                        <Button size="sm" variant="ghost" disabled={preOrderBusy} onClick={() => handlePreOrderStatus(detailRes, 'cancel')}>
                          Cancel Pre-Order
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {(detailRes.rejectionReason || detailRes.cancellationReason) && (
                <div style={{ padding: 10, borderRadius: 8, background: 'rgba(239, 68, 68, 0.08)', color: '#991b1b', fontSize: 12 }}>
                  <strong>Reason:</strong> {detailRes.rejectionReason || detailRes.cancellationReason}
                </div>
              )}

              {detailLoading ? (
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Loading status timeline…</span>
              ) : detailRes.statusHistory?.length > 0 && (
                <div>
                  <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
                    Status Timeline
                  </span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {detailRes.statusHistory.map((h) => (
                      <div
                        key={h.historyId || `${h.toStatus}-${h.createdAt}`}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          gap: 8,
                          fontSize: 12,
                          padding: '6px 10px',
                          background: 'var(--surface-secondary)',
                          borderRadius: 6,
                        }}
                      >
                        <span>
                          <strong>{h.toStatusLabel || h.toStatus}</strong>
                          {h.note && ` — ${h.note}`}
                        </span>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                          {formatManilaDateTime(h.createdAt)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end', paddingTop: 10, borderTop: '1px solid var(--border-primary)' }}>
                {renderDepositButtons(detailRes)}
                {renderActionButtons(detailRes)}
              </div>
            </div>
          )}
        </Modal>

        {/* Deposit Action Modal */}
        <Modal
          open={Boolean(depositModal)}
          onClose={() => !busyActionId && setDepositModal(null)}
          title={
            depositModal?.action === 'mark_paid'
              ? `Mark Deposit Received · ${depositModal.res.reference}`
              : depositModal?.action === 'waive'
                ? `Waive Deposit · ${depositModal?.res?.reference || ''}`
                : `Mark Deposit Refunded · ${depositModal?.res?.reference || ''}`
          }
          size="sm"
        >
          {depositModal && (
            <form onSubmit={handleSubmitDepositModal} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>
                {depositModal.action === 'mark_paid' && `Record receipt of ₱${Number(depositModal.res.depositAmount || 0).toFixed(2)} deposit from ${depositModal.res.guestName}.`}
                {depositModal.action === 'waive' && `Confirm waiving the ₱${Number(depositModal.res.depositAmount || 0).toFixed(2)} deposit for ${depositModal.res.guestName}.`}
                {depositModal.action === 'refund' && `Confirm marking the ₱${Number(depositModal.res.depositAmount || 0).toFixed(2)} deposit as refunded to ${depositModal.res.guestName}.`}
              </p>
              {depositError && (
                <div role="alert" style={{ padding: 10, borderRadius: 8, background: '#fef2f2', color: '#b91c1c', fontSize: 12, fontWeight: 600 }}>
                  {depositError}
                </div>
              )}
              {depositModal.action === 'mark_paid' && (
                <textarea
                  rows={2}
                  maxLength={255}
                  className="textarea"
                  placeholder="Optional note (e.g. GCash ref or cash at counter)..."
                  value={depositNote}
                  onChange={(e) => setDepositNote(e.target.value)}
                  disabled={Boolean(busyActionId)}
                  style={{ width: '100%' }}
                />
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <Button type="button" variant="ghost" size="sm" onClick={() => setDepositModal(null)} disabled={Boolean(busyActionId)}>
                  Close
                </Button>
                <Button type="submit" variant="primary" size="sm" disabled={Boolean(busyActionId)}>
                  {busyActionId ? 'Saving...' : 'Confirm'}
                </Button>
              </div>
            </form>
          )}
        </Modal>

        {/* Reject / Cancel Reason Modal */}
        <Modal
          open={Boolean(reasonModal)}
          onClose={() => !busyActionId && setReasonModal(null)}
          title={
            reasonModal?.mode === 'reject'
              ? `Decline Reservation ${reasonModal.res.reference}`
              : `Cancel Reservation ${reasonModal?.res?.reference || ''}`
          }
          size="sm"
        >
          {reasonModal && (
            <form onSubmit={handleSubmitReasonModal} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>
                Please enter a clear reason to send to {reasonModal.res.guestName}.
              </p>
              {reasonError && (
                <div role="alert" style={{ padding: 10, borderRadius: 8, background: '#fef2f2', color: '#b91c1c', fontSize: 12, fontWeight: 600 }}>
                  {reasonError}
                </div>
              )}
              <textarea
                rows={3}
                maxLength={255}
                className="textarea"
                placeholder="Reason (3–255 characters)..."
                value={reasonInput}
                onChange={(e) => setReasonInput(e.target.value)}
                disabled={Boolean(busyActionId)}
                style={{ width: '100%' }}
              />
              {reasonModal.mode === 'cancel' && reasonModal.res.depositStatus === 'paid' && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={refundDepositOnCancel}
                    onChange={(e) => setRefundDepositOnCancel(e.target.checked)}
                    disabled={Boolean(busyActionId)}
                  />
                  <span>
                    Mark the deposit as refunded (₱{Number(reasonModal.res.depositAmount || 0).toFixed(2)})
                  </span>
                </label>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <Button type="button" variant="ghost" size="sm" onClick={() => setReasonModal(null)} disabled={Boolean(busyActionId)}>
                  Close
                </Button>
                <Button type="submit" variant="danger" size="sm" disabled={Boolean(busyActionId)}>
                  {busyActionId ? 'Saving...' : reasonModal.mode === 'reject' ? 'Confirm Reject' : 'Confirm Cancel'}
                </Button>
              </div>
            </form>
          )}
        </Modal>

        {/* Seat Guest Modal (optional table override) */}
        <Modal
          open={Boolean(seatModal)}
          onClose={() => !busyActionId && setSeatModal(null)}
          title={seatModal ? `Seat Party · ${seatModal.res.guestName}` : 'Seat Party'}
          size="sm"
        >
          {seatModal && (
            <form onSubmit={handleSubmitSeatModal} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>
                Confirm seating for {seatModal.res.partySize} guest(s), or pick a different active table.
              </p>
              {seatError && (
                <div role="alert" style={{ padding: 10, borderRadius: 8, background: '#fef2f2', color: '#b91c1c', fontSize: 12, fontWeight: 600 }}>
                  {seatError}
                </div>
              )}
              <select
                className="input"
                value={seatTableId}
                onChange={(e) => setSeatTableId(e.target.value)}
                disabled={Boolean(busyActionId)}
                style={{ width: '100%', height: 38, fontSize: 13 }}
              >
                {fittingTablesForModal(seatModal.res).map((t) => (
                  <option key={t.id} value={String(t.id)}>
                    Table {t.tableName} ({t.capacity} seats{t.diningArea ? ` · ${t.diningArea}` : ''})
                  </option>
                ))}
              </select>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <Button type="button" variant="ghost" size="sm" onClick={() => setSeatModal(null)} disabled={Boolean(busyActionId)}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" size="sm" disabled={Boolean(busyActionId)}>
                  {busyActionId ? 'Seating...' : 'Confirm Seat'}
                </Button>
              </div>
            </form>
          )}
        </Modal>

        {/* Reassign Table Modal */}
        <Modal
          open={Boolean(reassignModal)}
          onClose={() => !busyActionId && setReassignModal(null)}
          title={reassignModal ? `Change Table · ${reassignModal.res.reference}` : 'Change Table'}
          size="sm"
        >
          {reassignModal && (
            <form onSubmit={handleSubmitReassignModal} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>
                Select an active table fitting {reassignModal.res.partySize} guest(s).
              </p>
              {reassignError && (
                <div role="alert" style={{ padding: 10, borderRadius: 8, background: '#fef2f2', color: '#b91c1c', fontSize: 12, fontWeight: 600 }}>
                  {reassignError}
                </div>
              )}
              <select
                className="input"
                value={reassignTableId}
                onChange={(e) => setReassignTableId(e.target.value)}
                disabled={Boolean(busyActionId)}
                style={{ width: '100%', height: 38, fontSize: 13 }}
              >
                <option value="">Select a table...</option>
                {fittingTablesForModal(reassignModal.res).map((t) => (
                  <option key={t.id} value={String(t.id)}>
                    Table {t.tableName} ({t.capacity} seats{t.diningArea ? ` · ${t.diningArea}` : ''})
                  </option>
                ))}
              </select>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <Button type="button" variant="ghost" size="sm" onClick={() => setReassignModal(null)} disabled={Boolean(busyActionId)}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" size="sm" disabled={Boolean(busyActionId)}>
                  {busyActionId ? 'Updating...' : 'Save Table'}
                </Button>
              </div>
            </form>
          )}
        </Modal>
          </>
        )}
      </div>
    </OwnerLayout>
  );
}
