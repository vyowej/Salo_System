import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import CustomerLayout from '../../../layouts/CustomerLayout';
import customerService from '../../../services/customerService';
import Button from '../../../components/common/Button';
import Badge from '../../../components/common/Badge';
import Modal from '../../../components/common/Modal';

export default function ReservationsPage() {
  const [reservations, setReservations] = useState([]);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [selectedResId, setSelectedResId] = useState(null);

  useEffect(() => {
    setReservations(customerService.getReservations());
  }, []);

  const handleCancelClick = (id) => {
    setSelectedResId(id);
    setCancelModalOpen(true);
  };

  const handleConfirmCancel = () => {
    if (selectedResId) {
      const updated = customerService.cancelReservation(selectedResId);
      setReservations(updated);
      setCancelModalOpen(false);
    }
  };

  return (
    <CustomerLayout>
      <Modal
        open={cancelModalOpen}
        onClose={() => setCancelModalOpen(false)}
        title="Cancel Table Reservation"
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
        <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          Are you sure you want to cancel this booking? If cancelled before the 24-hour deadline, your dining deposit of ₱500 will be refunded to your original payment method.
        </p>
      </Modal>

      <div style={{ marginBottom: 'var(--space-6)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
          <div>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Table Bookings
            </span>
            <h1 className="page-title" style={{ fontSize: 'var(--font-size-2xl)' }}>
              My Table Reservations
            </h1>
            <p className="page-subtitle">
              Guaranteed restaurant table seating with transparent deposit tracking.
            </p>
          </div>

          <Link to="/customer/restaurants" style={{ textDecoration: 'none' }}>
            <Button variant="primary" size="md">
              + Book Another Table
            </Button>
          </Link>
        </div>
      </div>

      {reservations.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: 'var(--space-12) 0',
          background: 'var(--surface-primary)',
          borderRadius: 'var(--radius-xl)',
          border: '1px solid var(--border-primary)',
        }}>
          <p style={{ color: 'var(--text-muted)', marginBottom: 'var(--space-4)' }}>
            You have no upcoming table reservations.
          </p>
          <Link to="/customer/restaurants" style={{ textDecoration: 'none' }}>
            <Button variant="outline" size="md">
              Find a Restaurant Table
            </Button>
          </Link>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {reservations.map((res) => (
            <div
              key={res.id}
              style={{
                background: 'var(--surface-primary)',
                border: '1px solid var(--border-primary)',
                borderRadius: 'var(--radius-xl)',
                padding: 'var(--space-6)',
                boxShadow: 'var(--shadow-xs)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-1)' }}>
                    <h2 style={{ fontSize: 'var(--font-size-md)', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {res.restaurantName}
                    </h2>
                    <Badge variant={res.status === 'Confirmed' ? 'success' : 'error'} dot size="sm">
                      {res.status}
                    </Badge>
                  </div>
                  <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>
                    Booking Ref: <strong style={{ color: 'var(--accent)', fontFamily: 'monospace' }}>#{res.id}</strong> · Area: {res.seatingArea}
                  </p>
                </div>

                <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                  {res.status === 'Confirmed' && (
                    <Button variant="danger-outline" size="sm" onClick={() => handleCancelClick(res.id)}>
                      Cancel Booking
                    </Button>
                  )}
                </div>
              </div>

              {/* Booking Details Grid */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: 'var(--space-3)',
                marginTop: 'var(--space-4)',
                paddingTop: 'var(--space-4)',
                borderTop: '1px solid var(--border-secondary)',
                fontSize: 'var(--font-size-xs)',
              }}>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Date & Time</span>
                  <p style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                    📅 {res.date} at {res.time}
                  </p>
                </div>

                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Party Size</span>
                  <p style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                    👥 {res.guests} Guests
                  </p>
                </div>

                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Deposit Paid</span>
                  <p style={{ fontWeight: 600, color: 'var(--salo-success)' }}>
                    ₱{res.depositAmount} (Deductible on bill)
                  </p>
                </div>

                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Cancellation Deadline</span>
                  <p style={{ color: 'var(--text-secondary)' }}>
                    {res.cancellationDeadline}
                  </p>
                </div>
              </div>

              {res.specialRequests && (
                <div style={{ marginTop: 'var(--space-3)', fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
                  <span style={{ fontWeight: 600 }}>Note to restaurant:</span> {res.specialRequests}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </CustomerLayout>
  );
}
