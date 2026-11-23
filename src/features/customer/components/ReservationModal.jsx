import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Modal from '../../../components/common/Modal';
import Button from '../../../components/common/Button';
import Badge from '../../../components/common/Badge';
import { useAuth } from '../../../hooks/useAuth';
import customerService from '../../../services/customerService';

const REASON_LABELS = {
  TOO_SOON: 'Within minimum notice window',
  PAST_TIME: 'Time has passed',
  FULLY_BOOKED: 'All suitable tables reserved',
  NO_FIT: 'No table fits party size/area',
  CLOSED: 'Outside operating hours',
};

function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function monthKeyFromDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function makeIdempotencyKey() {
  const rand = Math.random().toString(36).slice(2, 12);
  const ts = Date.now().toString(36);
  return `res-${ts}-${rand}`;
}

export default function ReservationModal({ open, onClose, restaurant, onReservationCreated }) {
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  // Calendar navigation state
  const [calendarDate, setCalendarDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d;
  });

  const [date, setDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return localDateKey(d);
  });

  const [time, setTime] = useState('');
  const [selectedStartIso, setSelectedStartIso] = useState('');
  const [guests, setGuests] = useState(2);
  const [seatingArea, setSeatingArea] = useState('any');
  const [selectedTableId, setSelectedTableId] = useState('');
  const [specialRequests, setSpecialRequests] = useState('');

  // Guest contact details
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [guestEmail, setGuestEmail] = useState('');

  // API state
  const [reservationInfo, setReservationInfo] = useState(null);
  const [monthOverviewMap, setMonthOverviewMap] = useState({});
  const [monthLoading, setMonthLoading] = useState(false);
  const [dayAvailability, setDayAvailability] = useState(null);
  const [dayLoading, setDayLoading] = useState(false);
  const [slotTables, setSlotTables] = useState([]);
  const [tablesLoading, setTablesLoading] = useState(false);

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmedReservation, setConfirmedReservation] = useState(null);
  const [formError, setFormError] = useState('');
  const [suggestedAlternatives, setSuggestedAlternatives] = useState([]);
  const [idempotencyKey, setIdempotencyKey] = useState(() => makeIdempotencyKey());

  // Prefill guest information from user auth
  useEffect(() => {
    if (user) {
      const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ').trim();
      setGuestName((prev) => prev || fullName || user.name || user.username || '');
      setGuestEmail((prev) => prev || user.email || '');
      setGuestPhone((prev) => prev || user.phone_number || user.phone || '');
    }
  }, [user]);

  // Regenerate idempotency key when booking parameters change
  useEffect(() => {
    setIdempotencyKey(makeIdempotencyKey());
  }, [restaurant?.id, date, time, selectedStartIso, guests, seatingArea, selectedTableId]);

  const restaurantId = restaurant?.id;
  const currentMonthKey = useMemo(() => monthKeyFromDate(calendarDate), [calendarDate]);
  const selectedSlotRef = useRef({ time: '', selectedStartIso: '' });

  useEffect(() => {
    selectedSlotRef.current = { time, selectedStartIso };
  }, [time, selectedStartIso]);

  // 1. Load restaurant reservation policy info when modal opens
  useEffect(() => {
    if (!open || !restaurantId) return undefined;
    let active = true;

    customerService.getReservationInfo(restaurantId)
      .then((info) => {
        if (!active || !info) return;
        setReservationInfo(info);
        if (info.effectiveMaxPartySize) {
          const maxParty = Math.max(1, info.effectiveMaxPartySize);
          setGuests((prev) => (prev > maxParty ? maxParty : prev));
        }
      })
      .catch(() => {
        if (active) setReservationInfo(null);
      });

    return () => {
      active = false;
    };
  }, [open, restaurantId]);

  // 2. Load monthly availability overview when month or party size changes
  const loadMonthOverview = useCallback(async () => {
    if (!open || !restaurantId) return;
    setMonthLoading(true);
    try {
      const overview = await customerService.getReservationMonthOverview(
        restaurantId,
        currentMonthKey,
        guests,
      );
      const nextMap = {};
      (overview?.days || []).forEach((d) => {
        nextMap[d.date] = {
          status: d.status,
          isClosed: d.status === 'closed',
          availableSlots: d.availableSlots,
          totalSlots: d.totalSlots,
          reasonCode: d.reasonCode,
        };
      });
      setMonthOverviewMap(nextMap);
    } catch {
      setMonthOverviewMap({});
    } finally {
      setMonthLoading(false);
    }
  }, [open, restaurantId, currentMonthKey, guests]);

  useEffect(() => {
    loadMonthOverview();
  }, [loadMonthOverview]);

  // 3. Load daily slot availability when date, party size, or preferred dining area changes
  const loadDayAvailability = useCallback(async () => {
    if (!open || !restaurantId || !date) return;
    setDayLoading(true);
    try {
      const areaParam = seatingArea && seatingArea !== 'any' ? seatingArea : '';
      const avail = await customerService.getReservationAvailability(
        restaurantId,
        date,
        guests,
        areaParam,
      );
      setDayAvailability(avail);

      // Clear selected time if it is no longer available in the refreshed slot list
      const { time: currentTime, selectedStartIso: currentStartIso } = selectedSlotRef.current;
      if (currentTime && avail?.slots) {
        const matching = avail.slots.find(
          (s) => (s.start === currentStartIso || s.time === currentTime) && s.available,
        );
        if (!matching) {
          setTime('');
          setSelectedStartIso('');
          setSelectedTableId('');
          setSlotTables([]);
        }
      }
    } catch (err) {
      setDayAvailability({
        bookable: false,
        isClosed: false,
        message: err?.message || 'Unable to load available time slots for this date.',
        slots: [],
      });
    } finally {
      setDayLoading(false);
    }
  }, [open, restaurantId, date, guests, seatingArea]);

  useEffect(() => {
    loadDayAvailability();
  }, [loadDayAvailability]);

  // 4. Load available tables for the chosen time slot
  useEffect(() => {
    if (!open || !restaurantId || !selectedStartIso) {
      setSlotTables([]);
      setSelectedTableId('');
      return undefined;
    }

    let active = true;
    setTablesLoading(true);
    const areaParam = seatingArea && seatingArea !== 'any' ? seatingArea : '';

    customerService.getReservationTables(restaurantId, selectedStartIso, guests, areaParam)
      .then((res) => {
        if (!active) return;
        const tables = Array.isArray(res?.availableTables) ? res.availableTables : [];
        setSlotTables(tables);
        setSelectedTableId((prevTableId) => {
          if (!prevTableId) return prevTableId;
          return tables.some((t) => String(t.tableId) === String(prevTableId)) ? prevTableId : '';
        });
      })
      .catch(() => {
        if (active) setSlotTables([]);
      })
      .finally(() => {
        if (active) setTablesLoading(false);
      });

    return () => {
      active = false;
    };
  }, [open, restaurantId, selectedStartIso, guests, seatingArea]);

  // Generate calendar days matrix
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

  const seatingAreaOptions = useMemo(() => {
    const areas = Array.isArray(reservationInfo?.diningAreas) ? reservationInfo.diningAreas : [];
    return [
      { id: 'any', name: 'Any Available Area', desc: 'Best available table across all dining zones' },
      ...areas.map((areaName) => ({
        id: areaName,
        name: areaName,
        desc: `Tables in the ${areaName} section`,
      })),
    ];
  }, [reservationInfo]);

  const maxPartySize = useMemo(() => {
    return Number(
      reservationInfo?.effectiveMaxPartySize ??
        reservationInfo?.reservationMaxPartySize ??
        restaurant?.reservationMaxPartySize ??
        8,
    );
  }, [reservationInfo, restaurant]);

  const minPartySize = useMemo(() => {
    return Math.max(1, Number(reservationInfo?.smallestMinPartySize ?? 1));
  }, [reservationInfo]);

  const partySizePresets = useMemo(() => {
    const base = [1, 2, 3, 4, 6, 8, 10, 12];
    const valid = base.filter((n) => n >= minPartySize && n <= maxPartySize);
    if (!valid.includes(maxPartySize) && maxPartySize >= minPartySize) {
      valid.push(maxPartySize);
    }
    return valid.length > 0 ? valid : [1, 2, 4];
  }, [minPartySize, maxPartySize]);

  if (!restaurant) return null;

  const depositRequired = Boolean(
    reservationInfo?.reservationDepositRequired ?? restaurant.reservationDepositRequired ?? false,
  );
  const depositAmount = depositRequired
    ? Number(reservationInfo?.reservationDepositAmount ?? restaurant.reservationDepositAmount ?? 0)
    : 0;
  const serviceFee = Number(
    reservationInfo?.reservationServiceFee ?? restaurant.reservationServiceFee ?? 0,
  );
  const totalPayable = depositAmount + serviceFee;

  const acceptingReservations =
    reservationInfo !== null
      ? reservationInfo.bookable && reservationInfo.acceptingReservations
      : restaurant.canReserve !== false && restaurant.operatingSchedule?.acceptingReservations !== false;

  const todayKey = localDateKey(new Date());

  const handleMonthShift = (step) => {
    const next = new Date(calendarDate);
    next.setMonth(next.getMonth() + step);
    setCalendarDate(next);
  };

  const handleSelectDate = (dateKey, isDisabled) => {
    if (isDisabled) return;
    setDate(dateKey);
    setTime('');
    setSelectedStartIso('');
    setSelectedTableId('');
    setFormError('');
    setSuggestedAlternatives([]);
  };

  const handleSelectSlot = (slot) => {
    if (!slot || !slot.available) return;
    setTime(slot.time || slot.timeLabel || '');
    setSelectedStartIso(slot.start || `${date}T${slot.time}`);
    setSelectedTableId('');
    setFormError('');
    setSuggestedAlternatives([]);
  };

  const validateReservation = () => {
    if (!isAuthenticated) {
      return 'Please sign in to your customer account to book a table reservation.';
    }
    if (!date) return 'Please choose a dining date on the availability calendar.';
    if (date < todayKey) return 'Reservations must be scheduled for today or a future date.';
    if (!time && !selectedStartIso) return 'Please select an available arrival time slot.';
    if (!guestName.trim()) return 'Please provide the primary guest name.';
    if (!guestPhone.trim()) return 'Please provide a contact phone number for confirmation.';

    return '';
  };

  const handleBookTable = async () => {
    const validationMessage = validateReservation();
    if (validationMessage) {
      setFormError(validationMessage);
      return;
    }

    setIsSubmitting(true);
    setFormError('');
    setSuggestedAlternatives([]);

    try {
      const startPayload = selectedStartIso || `${date}T${time}`;
      const created = await customerService.createReservation({
        restaurantId: Number(restaurant.id),
        start: startPayload,
        partySize: Number(guests),
        tableId: selectedTableId ? Number(selectedTableId) : null,
        diningArea: seatingArea && seatingArea !== 'any' ? seatingArea : null,
        contactName: guestName.trim(),
        contactPhone: guestPhone.trim(),
        specialRequests: specialRequests.trim() || null,
        idempotencyKey,
      });

      setConfirmedReservation(created);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('salo:notificationsUpdated'));
      }
      if (typeof onReservationCreated === 'function') {
        onReservationCreated(created);
      }
    } catch (err) {
      setFormError(err?.message || 'Unable to complete your reservation request.');
      if (Array.isArray(err?.suggestedAlternatives) && err.suggestedAlternatives.length > 0) {
        setSuggestedAlternatives(err.suggestedAlternatives);
      }
      // Refresh slot availability so latest booked slots are reflected
      loadDayAvailability();
      loadMonthOverview();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetAndClose = () => {
    setConfirmedReservation(null);
    setFormError('');
    setSuggestedAlternatives([]);
    onClose();
  };

  const handleViewMyBookings = () => {
    handleResetAndClose();
    navigate('/customer/reservations');
  };

  return (
    <Modal
      open={open}
      onClose={handleResetAndClose}
      title=""
      size="lg"
      footer={
        confirmedReservation ? (
          <div style={{ display: 'flex', gap: 'var(--space-2)', width: '100%' }}>
            <Button variant="outline" fullWidth onClick={handleResetAndClose}>
              Close
            </Button>
            <Button variant="primary" fullWidth onClick={handleViewMyBookings}>
              Done &amp; View My Bookings
            </Button>
          </div>
        ) : !acceptingReservations ? (
          <Button variant="primary" fullWidth disabled>
            Reservations Unavailable
          </Button>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', gap: 'var(--space-3)' }}>
            <div style={{ lineHeight: 1.2 }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                {totalPayable > 0 ? 'Estimated Deposit & Fee' : 'No Upfront Deposit Required'}
              </span>
              <p style={{ fontSize: 'var(--font-size-md)', fontWeight: 700, color: 'var(--text-primary)', margin: '2px 0 0' }}>
                ₱{totalPayable.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>

            <Button
              variant="primary"
              size="md"
              loading={isSubmitting}
              onClick={handleBookTable}
              disabled={!date || (!time && !selectedStartIso) || isSubmitting}
              style={{ minWidth: 220 }}
            >
              {isSubmitting ? 'Submitting...' : 'Submit Reservation Request'}
            </Button>
          </div>
        )
      }
    >
      {confirmedReservation ? (
        /* Celebratory Confirmation Screen */
        <div style={{ textAlign: 'center', padding: 'var(--space-4) 0' }}>
          <div style={{
            width: 60,
            height: 60,
            borderRadius: '50%',
            background: 'rgba(16, 185, 129, 0.12)',
            color: '#10b981',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 30,
            margin: '0 auto var(--space-3)',
          }}>
            ✓
          </div>

          <Badge
            variant={confirmedReservation.statusCode === 'confirmed' ? 'success' : 'warning'}
            dot
            size="sm"
            style={{ marginBottom: 'var(--space-2)' }}
          >
            {confirmedReservation.statusCode === 'confirmed'
              ? 'Reservation Automatically Confirmed'
              : 'Pending Restaurant Host Review'}
          </Badge>

          <h3 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 800, margin: '0 0 var(--space-1)', color: 'var(--text-primary)' }}>
            {confirmedReservation.statusCode === 'confirmed'
              ? `Table Confirmed at ${restaurant.name}`
              : `Request Sent to ${restaurant.name}`}
          </h3>

          <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', marginBottom: 'var(--space-5)' }}>
            Booking Reference:{' '}
            <strong style={{ color: 'var(--accent)', fontFamily: 'monospace' }}>
              {confirmedReservation.reference || `#${confirmedReservation.id}`}
            </strong>
          </p>

          {confirmedReservation.assignedDiningAreaDiffers && (
            <div
              role="status"
              style={{
                marginBottom: 'var(--space-3)',
                padding: '10px 14px',
                borderRadius: 'var(--radius-md)',
                background: 'rgba(245, 158, 11, 0.12)',
                color: '#92400e',
                fontSize: 12,
                textAlign: 'left',
              }}
            >
              Your preferred dining area was full for this slot, so we assigned the best available table in{' '}
              <strong>{confirmedReservation.diningArea}</strong>.
            </div>
          )}

          <div style={{
            background: 'var(--surface-secondary)',
            borderRadius: 'var(--radius-lg)',
            padding: 'var(--space-4)',
            textAlign: 'left',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-2)',
            fontSize: 'var(--font-size-xs)',
            marginBottom: 'var(--space-4)',
            border: '1px solid var(--border-secondary)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Date &amp; Arrival Time:</span>
              <strong style={{ color: 'var(--text-primary)' }}>
                {confirmedReservation.date || date} at {confirmedReservation.time || time}
              </strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Party Size:</span>
              <strong style={{ color: 'var(--text-primary)' }}>
                {confirmedReservation.guests || guests} {(confirmedReservation.guests || guests) === 1 ? 'Guest' : 'Guests'}
              </strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Guest Name:</span>
              <strong style={{ color: 'var(--text-primary)' }}>{confirmedReservation.guestName || guestName}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Assigned Table &amp; Area:</span>
              <strong style={{ color: 'var(--text-primary)' }}>
                {confirmedReservation.tableName ? `Table ${confirmedReservation.tableName} · ` : ''}
                {confirmedReservation.seatingArea || 'General Dining'}
              </strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Reservation Status:</span>
              <strong style={{ color: 'var(--text-primary)' }}>{confirmedReservation.status}</strong>
            </div>
          </div>

          <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>
            You can view your live reservation status, table details, or request a cancellation from your Reservations page.
          </p>
        </div>
      ) : !acceptingReservations ? (
        <div role="status" style={{ padding: 'var(--space-5)', borderRadius: 'var(--radius-lg)', background: 'var(--bg-secondary)', color: 'var(--text-secondary)', textAlign: 'center' }}>
          <h2 style={{ margin: '0 0 var(--space-2)', color: 'var(--text-primary)', fontSize: 'var(--font-size-lg)' }}>
            Reservations Currently Unavailable
          </h2>
          <p style={{ margin: 0, fontSize: 'var(--font-size-sm)' }}>
            {reservationInfo?.message || 'This restaurant is not accepting reservation requests right now. Please check back later.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {/* Header */}
          <div>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Table Availability &amp; Booking
            </span>
            <h2 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 800, color: 'var(--text-primary)', margin: '4px 0 2px' }}>
              Reserve a Table at {restaurant.name}
            </h2>
            <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', margin: 0 }}>
              {reservationInfo?.reservationNotes || 'Select your party size, date, and arrival time to book an available table.'}
            </p>
          </div>

          {formError && (
            <div
              role="alert"
              style={{
                background: 'var(--status-error-bg, #fef2f2)',
                color: 'var(--status-error-text, #b91c1c)',
                borderRadius: 'var(--radius-md)',
                padding: 'var(--space-3)',
                fontSize: 'var(--font-size-xs)',
                fontWeight: 600,
              }}
            >
              <div>{formError}</div>
              {suggestedAlternatives.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <span style={{ display: 'block', marginBottom: 4, fontWeight: 700 }}>
                    Nearest available times on {date}:
                  </span>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {suggestedAlternatives.map((alt) => (
                      <button
                        key={alt.start || alt.time}
                        type="button"
                        onClick={() => handleSelectSlot({ ...alt, available: true })}
                        style={{
                          padding: '4px 10px',
                          borderRadius: 6,
                          border: '1px solid var(--accent)',
                          background: '#ffffff',
                          color: 'var(--accent)',
                          fontWeight: 700,
                          fontSize: 11,
                          cursor: 'pointer',
                        }}
                      >
                        {alt.time_label || alt.timeLabel || alt.time} ({alt.available_table_count ?? alt.availableTableCount ?? 1} open)
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Party size bar */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'var(--space-3)',
            padding: 'var(--space-3) var(--space-4)',
            background: 'var(--surface-secondary)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-secondary)',
            flexWrap: 'wrap',
          }}>
            <div>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>
                👥 Party Size ({minPartySize}–{maxPartySize} Guests)
              </span>
              <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--text-muted)' }}>
                Availability updates dynamically to ensure your party fits.
              </p>
            </div>

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              {partySizePresets.map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => setGuests(num)}
                  style={{
                    padding: '4px 12px',
                    borderRadius: 'var(--radius-sm, 6px)',
                    fontSize: 12,
                    fontWeight: 700,
                    border: guests === num ? '1.5px solid var(--accent)' : '1px solid var(--border-primary)',
                    background: guests === num ? 'var(--accent)' : 'var(--surface-primary)',
                    color: guests === num ? '#ffffff' : 'var(--text-primary)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {num} {num === 1 ? 'Guest' : 'Guests'}
                </button>
              ))}
            </div>
          </div>

          {/* ── Two-Column Availability Experience ───────────────────── */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1.2fr 1fr',
            gap: 'var(--space-4)',
            alignItems: 'start',
          }}>
            {/* Left: Monthly Availability Calendar */}
            <div style={{
              background: 'var(--surface-primary)',
              border: '1px solid var(--border-primary)',
              borderRadius: 'var(--radius-lg, 12px)',
              padding: 'var(--space-3)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-2)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>
                  {calendarDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                  {monthLoading ? ' …' : ''}
                </span>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button
                    type="button"
                    onClick={() => handleMonthShift(-1)}
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 6,
                      border: '1px solid var(--border-primary)',
                      background: 'var(--surface-secondary)',
                      cursor: 'pointer',
                      fontWeight: 700,
                    }}
                    aria-label="Previous Month"
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMonthShift(1)}
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 6,
                      border: '1px solid var(--border-primary)',
                      background: 'var(--surface-secondary)',
                      cursor: 'pointer',
                      fontWeight: 700,
                    }}
                    aria-label="Next Month"
                  >
                    ›
                  </button>
                </div>
              </div>

              {/* Visual Legend */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 10,
                color: 'var(--text-muted)',
                flexWrap: 'wrap',
                padding: '4px 0',
                borderBottom: '1px solid var(--border-secondary)',
              }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981' }} /> Available
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b' }} /> Limited
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444' }} /> Full
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#94a3b8' }} /> Closed
                </span>
              </div>

              {/* Day names */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', textAlign: 'center', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)' }}>
                {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
                  <span key={i} style={{ padding: '2px 0' }}>{d}</span>
                ))}
              </div>

              {/* Day cells grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3 }}>
                {calendarDays.map((item, idx) => {
                  const key = localDateKey(item.date);
                  const isPast = key < todayKey;
                  const isSelected = key === date;
                  const isToday = key === todayKey;
                  const dayAvail = monthOverviewMap[key];
                  const dayStatus = isPast ? 'unavailable' : (dayAvail?.status || 'available');
                  const isClosedOrUnavail =
                    isPast || dayStatus === 'closed' || dayStatus === 'unavailable';

                  const dotColor = isClosedOrUnavail
                    ? '#cbd5e1'
                    : dayStatus === 'available'
                      ? '#10b981'
                      : dayStatus === 'limited'
                        ? '#f59e0b'
                        : '#ef4444';

                  return (
                    <button
                      key={idx}
                      type="button"
                      disabled={isClosedOrUnavail || item.isOutsideMonth}
                      onClick={() => handleSelectDate(key, isClosedOrUnavail)}
                      style={{
                        height: 38,
                        borderRadius: 6,
                        border: isSelected
                          ? '2px solid var(--accent)'
                          : isToday
                            ? '1px solid var(--accent)'
                            : '1px solid var(--border-secondary)',
                        background: isSelected
                          ? 'var(--accent-subtle, rgba(234, 88, 12, 0.12))'
                          : item.isOutsideMonth || isClosedOrUnavail
                            ? 'var(--surface-secondary)'
                            : 'var(--surface-primary)',
                        color: isClosedOrUnavail || item.isOutsideMonth
                          ? 'var(--text-muted)'
                          : isSelected
                            ? 'var(--accent)'
                            : 'var(--text-primary)',
                        opacity: item.isOutsideMonth ? 0.35 : isClosedOrUnavail ? 0.55 : 1,
                        cursor: isClosedOrUnavail || item.isOutsideMonth ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 2,
                        padding: 0,
                      }}
                    >
                      <span style={{ fontSize: 11, fontWeight: isSelected || isToday ? 800 : 600 }}>
                        {item.date.getDate()}
                      </span>
                      {!item.isOutsideMonth && !isPast && (
                        <span style={{ width: 4, height: 4, borderRadius: '50%', background: dotColor }} />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Right: Selected Date Time Slot Schedule */}
            <div style={{
              background: 'var(--surface-primary)',
              border: '1px solid var(--border-primary)',
              borderRadius: 'var(--radius-lg, 12px)',
              padding: 'var(--space-3)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-2)',
            }}>
              <div style={{ borderBottom: '1px solid var(--border-secondary)', paddingBottom: 6 }}>
                <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                  Selected Dining Date
                </span>
                <h4 style={{ margin: '2px 0 0', fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>
                  📅 {new Date(`${date}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                </h4>
              </div>

              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>
                Available Arrival Time Slots:
              </span>

              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                maxHeight: 260,
                overflowY: 'auto',
                paddingRight: 2,
              }}>
                {dayLoading ? (
                  <div style={{ padding: 'var(--space-4)', textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>
                    Checking open tables for {date}…
                  </div>
                ) : !dayAvailability || (dayAvailability.slots || []).length === 0 ? (
                  <div style={{ padding: 'var(--space-4)', textAlign: 'center', fontSize: 12, color: 'var(--text-muted)', background: 'var(--surface-secondary)', borderRadius: 8 }}>
                    {dayAvailability?.message || 'No time slots available on this date.'}
                  </div>
                ) : (
                  (dayAvailability.slots || []).map((slot) => {
                    const isSelected =
                      (selectedStartIso && slot.start === selectedStartIso) ||
                      (!selectedStartIso && time === slot.time);
                    const isAvailable = Boolean(slot.available);
                    const count = Number(slot.availableTableCount ?? 0);
                    const statusLabel = isAvailable
                      ? `${count} ${count === 1 ? 'table' : 'tables'}`
                      : (REASON_LABELS[slot.reasonCode] || 'Unavailable');

                    return (
                      <button
                        key={slot.start || slot.time}
                        type="button"
                        disabled={!isAvailable}
                        onClick={() => handleSelectSlot(slot)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '8px 10px',
                          borderRadius: 8,
                          border: isSelected
                            ? '2px solid var(--accent)'
                            : '1px solid var(--border-primary)',
                          background: isSelected
                            ? 'var(--accent-subtle, rgba(234, 88, 12, 0.1))'
                            : !isAvailable
                              ? 'var(--surface-secondary)'
                              : 'var(--surface-primary)',
                          cursor: !isAvailable ? 'not-allowed' : 'pointer',
                          opacity: !isAvailable ? 0.6 : 1,
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <div style={{ textAlign: 'left' }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: isSelected ? 'var(--accent)' : 'var(--text-primary)' }}>
                            🕒 {slot.timeLabel || slot.time}
                          </span>
                          <p style={{ margin: '1px 0 0', fontSize: 10, color: 'var(--text-muted)' }}>
                            {isAvailable
                              ? (slot.diningAreasAvailable?.length
                                  ? `Areas: ${slot.diningAreasAvailable.join(', ')}`
                                  : 'Open for booking')
                              : (REASON_LABELS[slot.reasonCode] || 'Unavailable')}
                          </p>
                        </div>

                        <Badge
                          variant={isAvailable ? (count <= 1 ? 'warning' : 'success') : 'error'}
                          size="xs"
                        >
                          {statusLabel}
                        </Badge>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Seating Area Selection */}
          <div>
            <label style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, display: 'block', marginBottom: 6, color: 'var(--text-primary)' }}>
              Preferred Seating Area
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 'var(--space-2)' }}>
              {seatingAreaOptions.map((area) => (
                <label
                  key={area.id}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 2,
                    padding: 'var(--space-2) var(--space-3)',
                    borderRadius: 'var(--radius-md)',
                    border: seatingArea === area.id ? '1.5px solid var(--accent)' : '1px solid var(--border-primary)',
                    background: seatingArea === area.id ? 'var(--accent-subtle, rgba(234, 88, 12, 0.06))' : 'var(--surface-primary)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input
                      type="radio"
                      name="seating"
                      checked={seatingArea === area.id}
                      onChange={() => setSeatingArea(area.id)}
                    />
                    <strong style={{ fontSize: 12, color: 'var(--text-primary)' }}>{area.name}</strong>
                  </div>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', paddingLeft: 18 }}>{area.desc}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Optional Specific Table Selection for Selected Slot */}
          {selectedStartIso && (slotTables.length > 0 || tablesLoading) && (
            <div>
              <label
                htmlFor="reservation-table-select"
                style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, display: 'block', marginBottom: 4, color: 'var(--text-primary)' }}
              >
                Table Preference (Optional)
              </label>
              <select
                id="reservation-table-select"
                className="input"
                value={selectedTableId}
                onChange={(e) => setSelectedTableId(e.target.value)}
                disabled={tablesLoading}
                style={{ width: '100%', height: 36, fontSize: 12 }}
              >
                <option value="">Best available table (Auto-assign)</option>
                {slotTables.map((t) => (
                  <option key={t.tableId} value={String(t.tableId)}>
                    Table {t.tableName} ({t.capacity} seats{t.diningArea ? ` · ${t.diningArea}` : ''})
                    {t.description ? ` — ${t.description}` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Contact Details */}
          <div style={{
            background: 'var(--surface-secondary)',
            borderRadius: 'var(--radius-md)',
            padding: 'var(--space-3)',
            border: '1px solid var(--border-secondary)',
          }}>
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
              Primary Guest Contact Information
            </span>
            <div className="grid-cols-2" style={{ gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
              <div>
                <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 2 }}>
                  Full Name *
                </label>
                <input
                  type="text"
                  className="input"
                  maxLength={150}
                  placeholder="Primary guest name"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  style={{ width: '100%', height: 36, fontSize: 12 }}
                />
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 2 }}>
                  Mobile Phone *
                </label>
                <input
                  type="tel"
                  className="input"
                  maxLength={30}
                  placeholder="0917-000-0000"
                  value={guestPhone}
                  onChange={(e) => setGuestPhone(e.target.value)}
                  style={{ width: '100%', height: 36, fontSize: 12 }}
                />
              </div>
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 2 }}>
                Email Address
              </label>
              <input
                type="email"
                className="input"
                placeholder="guest@example.com"
                value={guestEmail}
                onChange={(e) => setGuestEmail(e.target.value)}
                style={{ width: '100%', height: 36, fontSize: 12 }}
              />
            </div>
          </div>

          {/* Special Requests */}
          <div>
            <label style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, display: 'block', marginBottom: 4, color: 'var(--text-primary)' }}>
              Special Requests / Dietary Notes (Optional)
            </label>
            <textarea
              placeholder="High chair for toddler, celebration setup, quiet table..."
              maxLength={500}
              value={specialRequests}
              onChange={(e) => setSpecialRequests(e.target.value)}
              rows={2}
              className="textarea"
              style={{ width: '100%' }}
            />
          </div>

          {/* Transparent Financial Policy Breakdown */}
          <div style={{
            background: 'var(--surface-secondary)',
            borderRadius: 'var(--radius-md)',
            padding: 'var(--space-3) var(--space-4)',
            border: '1px solid var(--border-secondary)',
            fontSize: 'var(--font-size-xs)',
            color: 'var(--text-secondary)',
            lineHeight: 1.5,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span>Table Reservation Deposit:</span>
              <strong>₱{depositAmount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span>Platform Reservation Fee:</span>
              <strong>₱{serviceFee.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
            </div>
            <div style={{ borderTop: '1px solid var(--border-secondary)', paddingTop: 4, marginTop: 4, display: 'flex', justifyContent: 'space-between', color: 'var(--text-primary)', fontWeight: 700 }}>
              <span>Total Reservation Charges:</span>
              <span style={{ color: 'var(--accent)' }}>
                ₱{totalPayable.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
