import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import Modal from '../../../components/common/Modal';
import Button from '../../../components/common/Button';
import Badge from '../../../components/common/Badge';
import customerService from '../../../services/customerService';
import { useAuth } from '../../../hooks/useAuth';
import {
  computeSlotAvailability,
  computeDayAvailability,
  getMonthAvailabilityMap,
  STANDARD_TIME_SLOTS,
} from '../../../services/demo/reservationAvailability';

const SEATING_AREAS = [
  { id: 'indoor', name: 'Main Indoor Hall', desc: 'Air-conditioned, cozy ambient lighting' },
  { id: 'alfresco', name: 'Al Fresco / Garden Patio', desc: 'Open-air garden dining with greenery' },
  { id: 'balcony', name: '2nd Floor Balcony', desc: 'Overlooking the cityscape, romantic view' },
];

function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function ReservationModal({ open, onClose, restaurant, onSuccess }) {
  const { user } = useAuth();
  const navigate = useNavigate();

  // Calendar navigation state
  const [calendarDate, setCalendarDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1); // default tomorrow
    return d;
  });

  const [date, setDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return localDateKey(d);
  });

  const [time, setTime] = useState('');
  const [guests, setGuests] = useState(4);
  const [seatingArea, setSeatingArea] = useState('indoor');
  const [specialRequests, setSpecialRequests] = useState('');

  // Guest contact details
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [guestEmail, setGuestEmail] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmedReservation, setConfirmedReservation] = useState(null);
  const [formError, setFormError] = useState('');

  // Prefill guest information from user auth
  useEffect(() => {
    if (user) {
      setGuestName((prev) => prev || user.name || '');
      setGuestEmail((prev) => prev || user.email || '');
      setGuestPhone((prev) => prev || user.phone || '');
    }
  }, [user]);

  const existingReservations = useMemo(() => {
    return restaurant?.reservations || [];
  }, [restaurant]);

  // Pre-calculate month availability map
  const monthAvailability = useMemo(() => {
    if (!restaurant) return {};
    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();
    return getMonthAvailabilityMap(year, month, restaurant, existingReservations, Number(guests));
  }, [calendarDate, restaurant, existingReservations, guests]);

  // Compute selected day slots
  const selectedDayData = useMemo(() => {
    if (!restaurant || !date) return null;
    return computeDayAvailability(date, restaurant, existingReservations, Number(guests));
  }, [date, restaurant, existingReservations, guests]);

  // Generate calendar days matrix
  const calendarDays = useMemo(() => {
    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();

    const firstDay = new Date(year, month, 1);
    const startOffset = (firstDay.getDay() + 6) % 7; // Monday = 0
    const totalDays = new Date(year, month + 1, 0).getDate();

    const days = [];
    const prevMonthDays = new Date(year, month, 0).getDate();

    // Leading days
    for (let i = startOffset - 1; i >= 0; i--) {
      days.push({
        date: new Date(year, month - 1, prevMonthDays - i),
        isOutsideMonth: true,
      });
    }

    // Current month days
    for (let d = 1; d <= totalDays; d++) {
      days.push({
        date: new Date(year, month, d),
        isOutsideMonth: false,
      });
    }

    // Trailing days
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

  if (!restaurant) return null;

  const depositAmount = restaurant.reservationDeposit || 500;
  const serviceFee = 50; // transparent platform fee
  const totalPayable = depositAmount + serviceFee;
  const acceptingReservations = restaurant.operatingSchedule?.acceptingReservations !== false;
  const todayKey = localDateKey(new Date());

  const handleMonthShift = (step) => {
    const next = new Date(calendarDate);
    next.setMonth(next.getMonth() + step);
    setCalendarDate(next);
  };

  const handleSelectDate = (dateKey, isPast, isClosed) => {
    if (isPast || isClosed) return;
    setDate(dateKey);
    setTime(''); // reset selected slot when changing date
    setFormError('');
  };

  const validateReservation = () => {
    if (!date) return 'Please choose a dining date on the availability calendar.';
    if (date < todayKey) return 'Reservations must be scheduled for today or a future date.';
    if (!time) return 'Please select an available arrival time slot.';

    const slotAvail = computeSlotAvailability(time, date, restaurant, existingReservations, Number(guests));
    if (!slotAvail.canAccommodate) {
      return slotAvail.reason || 'This time slot cannot accommodate your requested party size.';
    }

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

    setFormError('');
    setIsSubmitting(true);
    try {
      const selectedAreaObj = SEATING_AREAS.find((s) => s.id === seatingArea);
      const res = customerService.createReservation({
        restaurantId: restaurant.id,
        restaurantName: restaurant.name,
        date,
        time,
        guests: Number(guests),
        seatingArea: selectedAreaObj?.name || 'Main Indoor Hall',
        depositAmount,
        serviceFee,
        specialRequests: specialRequests.trim(),
        guestName: guestName.trim() || user?.name || 'Guest',
        guestPhone: guestPhone.trim() || user?.phone || '',
        guestEmail: guestEmail.trim() || user?.email || '',
      });

      setConfirmedReservation(res);
      onSuccess?.(res);
    } catch (submitError) {
      setFormError(submitError.message || 'Unable to submit your reservation request.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetAndClose = () => {
    setConfirmedReservation(null);
    setFormError('');
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
                Demo estimate · not charged
              </span>
              <p style={{ fontSize: 'var(--font-size-md)', fontWeight: 700, color: 'var(--text-primary)', margin: '2px 0 0' }}>
                ₱{totalPayable.toLocaleString()}
              </p>
            </div>

            <Button
              variant="primary"
              size="md"
              loading={isSubmitting}
              onClick={handleBookTable}
              disabled={!date || !time}
              style={{ minWidth: 220 }}
            >
              Submit Reservation Request
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

          <Badge variant="warning" dot size="sm" style={{ marginBottom: 'var(--space-2)' }}>
            Pending Restaurant Host Review
          </Badge>

          <h3 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 800, margin: '0 0 var(--space-1)', color: 'var(--text-primary)' }}>
            Request Sent to {restaurant.name}
          </h3>

          <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', marginBottom: 'var(--space-5)' }}>
            Booking Reference: <strong style={{ color: 'var(--accent)', fontFamily: 'monospace' }}>#{confirmedReservation.id}</strong>
          </p>

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
              <strong style={{ color: 'var(--text-primary)' }}>{date} at {time}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Party Size:</span>
              <strong style={{ color: 'var(--text-primary)' }}>{guests} Guests</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Guest Name:</span>
              <strong style={{ color: 'var(--text-primary)' }}>{confirmedReservation.guestName}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Seating Area:</span>
              <strong style={{ color: 'var(--text-primary)' }}>{confirmedReservation.seatingArea}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Reservation Status:</span>
              <strong style={{ color: 'var(--text-primary)' }}>{confirmedReservation.status}</strong>
            </div>
          </div>

          <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>
            The restaurant host will review table capacity and confirm your reservation. Table deposits are credited towards your dining bill.
          </p>
        </div>
      ) : !acceptingReservations ? (
        <div role="status" style={{ padding: 'var(--space-5)', borderRadius: 'var(--radius-lg)', background: 'var(--bg-secondary)', color: 'var(--text-secondary)', textAlign: 'center' }}>
          <h2 style={{ margin: '0 0 var(--space-2)', color: 'var(--text-primary)', fontSize: 'var(--font-size-lg)' }}>Reservations are Paused</h2>
          <p style={{ margin: 0, fontSize: 'var(--font-size-sm)' }}>This restaurant is not accepting reservation requests right now. Please check back later.</p>
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
              Visually check open dates and time slot capacities before confirming your gathering.
            </p>
          </div>

          {formError && (
            <div style={{
              background: 'var(--status-error-bg)',
              color: 'var(--status-error-text)',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--space-2) var(--space-3)',
              fontSize: 'var(--font-size-xs)',
              fontWeight: 600,
            }}>
              {formError}
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
                👥 Party Size (Guests)
              </span>
              <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--text-muted)' }}>
                Availability updates dynamically to ensure your party fits.
              </p>
            </div>

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[1, 2, 4, 6, 8, 10, 12, 16].map((num) => (
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
              {/* Calendar Month Navigation */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>
                  {calendarDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
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
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b' }} /> Partial
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
                  const dayAvail = monthAvailability[key];
                  const dayStatus = isPast ? 'unavailable' : (dayAvail?.status || 'available');
                  const isClosed = dayAvail?.isClosed || false;

                  const dotColor = isPast || isClosed
                    ? '#cbd5e1'
                    : dayStatus === 'available'
                    ? '#10b981'
                    : dayStatus === 'partially_booked'
                    ? '#f59e0b'
                    : '#ef4444';

                  return (
                    <button
                      key={idx}
                      type="button"
                      disabled={isPast || isClosed || item.isOutsideMonth}
                      onClick={() => handleSelectDate(key, isPast, isClosed)}
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
                          : item.isOutsideMonth || isPast
                          ? 'var(--surface-secondary)'
                          : 'var(--surface-primary)',
                        color: isPast || item.isOutsideMonth
                          ? 'var(--text-muted)'
                          : isSelected
                          ? 'var(--accent)'
                          : 'var(--text-primary)',
                        opacity: item.isOutsideMonth ? 0.35 : isPast ? 0.5 : 1,
                        cursor: isPast || isClosed || item.isOutsideMonth ? 'not-allowed' : 'pointer',
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
                {(selectedDayData?.slots || STANDARD_TIME_SLOTS.map((t) => ({ time: t, status: 'available', canAccommodate: true }))).map((slot) => {
                  const isSelected = time === slot.time;
                  const isFull = slot.status === 'fully_booked';
                  const isClosed = slot.isClosed;
                  const cannotFit = !slot.canAccommodate;

                  return (
                    <button
                      key={slot.time}
                      type="button"
                      disabled={isFull || isClosed || cannotFit}
                      onClick={() => setTime(slot.time)}
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
                          : isFull || cannotFit
                          ? 'var(--surface-secondary)'
                          : 'var(--surface-primary)',
                        cursor: isFull || cannotFit ? 'not-allowed' : 'pointer',
                        opacity: isFull || cannotFit ? 0.6 : 1,
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <div style={{ textAlign: 'left' }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: isSelected ? 'var(--accent)' : 'var(--text-primary)' }}>
                          🕒 {slot.time}
                        </span>
                        <p style={{ margin: '1px 0 0', fontSize: 10, color: 'var(--text-muted)' }}>
                          {slot.reason || 'Open for booking'}
                        </p>
                      </div>

                      <Badge
                        variant={slot.status === 'available' ? 'success' : slot.status === 'limited' ? 'warning' : 'error'}
                        size="xs"
                      >
                        {slot.statusLabel}
                      </Badge>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Seating Area Selection */}
          <div>
            <label style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, display: 'block', marginBottom: 6, color: 'var(--text-primary)' }}>
              Preferred Seating Area
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-2)' }}>
              {SEATING_AREAS.map((area) => (
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
              <span>Table Reservation Deposit (credited to final bill):</span>
              <strong>₱{depositAmount.toLocaleString()}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span>Platform Reservation Fee:</span>
              <strong>₱{serviceFee.toLocaleString()}</strong>
            </div>
            <div style={{ borderTop: '1px solid var(--border-secondary)', paddingTop: 4, marginTop: 4, display: 'flex', justifyContent: 'space-between', color: 'var(--text-primary)', fontWeight: 700 }}>
              <span>Estimated Total (demo estimate):</span>
              <span style={{ color: 'var(--accent)' }}>₱{totalPayable.toLocaleString()}</span>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
