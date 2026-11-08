import { useState } from 'react';
import Modal from '../../../components/common/Modal';
import Button from '../../../components/common/Button';
import Badge from '../../../components/common/Badge';
import customerService from '../../../services/customerService';

const SEATING_AREAS = [
  { id: 'indoor', name: 'Main Indoor Hall', desc: 'Air-conditioned, cozy ambient lighting' },
  { id: 'alfresco', name: 'Al Fresco / Garden Patio', desc: 'Open-air garden dining with greenery' },
  { id: 'balcony', name: '2nd Floor Balcony', desc: 'Overlooking Tomas Morato, romantic view' },
];

const TIME_SLOTS = [
  '11:30 AM', '12:00 PM', '12:30 PM', '1:00 PM', '1:30 PM',
  '6:00 PM', '6:30 PM', '7:00 PM', '7:30 PM', '8:00 PM', '8:30 PM',
];

export default function ReservationModal({ open, onClose, restaurant, onSuccess }) {
  const [date, setDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  });
  const [time, setTime] = useState('7:00 PM');
  const [guests, setGuests] = useState(4);
  const [seatingArea, setSeatingArea] = useState('indoor');
  const [specialRequests, setSpecialRequests] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmedReservation, setConfirmedReservation] = useState(null);
  const [formError, setFormError] = useState('');

  if (!restaurant) return null;

  const depositAmount = restaurant.reservationDeposit || 500;
  const serviceFee = 50; // transparent platform reservation fee
  const totalPayable = depositAmount + serviceFee;

  const validateReservation = () => {
    if (!date) {
      return 'Please choose a dining date.';
    }

    const selectedDate = new Date(`${date}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (selectedDate < today) {
      return 'Reservations must be scheduled for today or a future date.';
    }

    if (!time) {
      return 'Please select an arrival time slot.';
    }

    if (!Number.isFinite(Number(guests)) || Number(guests) <= 0) {
      return 'Please choose a valid number of guests.';
    }

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

  return (
    <Modal
      open={open}
      onClose={handleResetAndClose}
      title=""
      size="md"
      footer={
        confirmedReservation ? (
          <Button variant="primary" fullWidth onClick={handleResetAndClose}>
            Done & View My Bookings
          </Button>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', gap: 'var(--space-3)' }}>
            <div style={{ lineHeight: 1.2 }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Demo estimate · not charged</span>
              <p style={{ fontSize: 'var(--font-size-md)', fontWeight: 700, color: 'var(--text-primary)' }}>
                ₱{totalPayable.toLocaleString()}
              </p>
            </div>

            <Button
              variant="primary"
              size="md"
              loading={isSubmitting}
              onClick={handleBookTable}
              style={{ minWidth: 200 }}
            >
              Submit reservation request
            </Button>
          </div>
        )
      }
    >
      {confirmedReservation ? (
        <div style={{ textAlign: 'center', padding: 'var(--space-4) 0' }}>
          <div style={{
            width: 56,
            height: 56,
            borderRadius: '50%',
            background: 'var(--status-success-bg)',
            color: 'var(--status-success-text)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 28,
            margin: '0 auto var(--space-3)',
          }}>
            ✓
          </div>

          <Badge variant="warning" dot size="sm" style={{ marginBottom: 'var(--space-2)' }}>
            Pending restaurant review
          </Badge>

          <h3 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700, marginBottom: 'var(--space-1)' }}>
            Request sent to {restaurant.name}
          </h3>

          <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', marginBottom: 'var(--space-6)' }}>
            Reference: <strong style={{ color: 'var(--accent)', fontFamily: 'monospace' }}>#{confirmedReservation.id}</strong>
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
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Date & Time:</span>
              <strong>{date} at {time}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Party Size:</span>
              <strong>{guests} Guests</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Seating Area:</span>
              <strong>{confirmedReservation.seatingArea}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Reservation status:</span>
              <strong>{confirmedReservation.status}</strong>
            </div>
          </div>

          <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            The restaurant must approve the request and confirm any payment requirements before your reservation is confirmed.
          </p>
        </div>
      ) : (
        <div>
          <div style={{ marginBottom: 'var(--space-5)' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Reservation request
            </span>
            <h2 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700, color: 'var(--text-primary)', marginTop: 2 }}>
              Reserve a Table at {restaurant.name}
            </h2>
            <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
              Submit your preferred date and party size. The restaurant will review the request and confirm availability.
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
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

            {/* Date & Guests */}
            <div className="grid-cols-2" style={{ gap: 'var(--space-3)' }}>
              <div>
                <label style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, display: 'block', marginBottom: 4 }}>
                  Dining Date
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="input"
                  style={{ width: '100%', height: 40 }}
                />
              </div>

              <div>
                <label style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, display: 'block', marginBottom: 4 }}>
                  Number of Guests
                </label>
                <select
                  value={guests}
                  onChange={(e) => setGuests(Number(e.target.value))}
                  className="select"
                  style={{ width: '100%', height: 40 }}
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 16].map((n) => (
                    <option key={n} value={n}>
                      {n} {n === 1 ? 'Guest' : 'Guests'}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Time Slot Picker */}
            <div>
              <label style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, display: 'block', marginBottom: 6 }}>
                Select Arrival Time Slot
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {TIME_SLOTS.map((slot) => (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => setTime(slot)}
                    style={{
                      padding: '6px 10px',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: 11,
                      fontWeight: 600,
                      border: time === slot ? '1.5px solid var(--accent)' : '1px solid var(--border-primary)',
                      background: time === slot ? 'var(--accent)' : 'var(--surface-primary)',
                      color: time === slot ? '#fff' : 'var(--text-primary)',
                      cursor: 'pointer',
                    }}
                  >
                    {slot}
                  </button>
                ))}
              </div>
            </div>

            {/* Seating Area Selection */}
            <div>
              <label style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, display: 'block', marginBottom: 6 }}>
                Preferred Seating Area
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                {SEATING_AREAS.map((area) => (
                  <label
                    key={area.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--space-3)',
                      padding: 'var(--space-3)',
                      borderRadius: 'var(--radius-md)',
                      border: seatingArea === area.id ? '1.5px solid var(--accent)' : '1px solid var(--border-primary)',
                      background: seatingArea === area.id ? 'var(--accent-subtle)' : 'var(--surface-primary)',
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="radio"
                      name="seating"
                      checked={seatingArea === area.id}
                      onChange={() => setSeatingArea(area.id)}
                    />
                    <div>
                      <p style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600 }}>{area.name}</p>
                      <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>{area.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Special Request */}
            <div>
              <label style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, display: 'block', marginBottom: 4 }}>
                Special Requests / Occasion
              </label>
              <textarea
                placeholder="Birthday setup, high chair for toddler, anniversary..."
                value={specialRequests}
                onChange={(e) => setSpecialRequests(e.target.value)}
                rows={2}
                className="textarea"
                style={{ width: '100%' }}
              />
            </div>

            {/* Transparent Financial Policy Breakdown (Master Rules compliant) */}
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
                <span>Reservation fee (demo estimate):</span>
                <strong>₱{depositAmount}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span>Additional fee (demo estimate):</span>
                <strong>₱{serviceFee}</strong>
              </div>
              <div style={{ borderTop: '1px solid var(--border-secondary)', paddingTop: 4, marginTop: 4, display: 'flex', justifyContent: 'space-between', color: 'var(--text-primary)', fontWeight: 700 }}>
                <span>Estimated total (not charged):</span>
                <span style={{ color: 'var(--accent)' }}>₱{totalPayable}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
