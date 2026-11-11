import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import CustomerLayout from '../../../layouts/CustomerLayout';
import customerService from '../../../services/customerService';
import Button from '../../../components/common/Button';
import Badge from '../../../components/common/Badge';
import Modal from '../../../components/common/Modal';
import './CustomerRecords.css';

export default function ReservationsPage() {
  const [reservations, setReservations] = useState([]);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [selectedResId, setSelectedResId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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

  const handleCancelClick = (id) => {
    setSelectedResId(id);
    setCancelModalOpen(true);
  };

  const handleConfirmCancel = () => {
    if (selectedResId) {
      try {
        setError('');
        const updated = customerService.cancelReservation(selectedResId);
        setReservations(updated);
        setCancelModalOpen(false);
      } catch (cancelError) {
        setError(cancelError.message || 'Unable to request cancellation.');
      }
    }
  };

  return (
    <CustomerLayout>
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
        <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          This sends a cancellation request to the restaurant. Your reservation remains active until the restaurant reviews it. Any fee or refund will be confirmed after review.
        </p>
      </Modal>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 'var(--space-4)' }}>
          <Link to="/customer/restaurants" style={{ textDecoration: 'none' }}>
            <Button variant="primary" size="md">
              + Book Another Table
            </Button>
          </Link>
      </div>

      {error && <div role="alert" className="form-error" style={{ marginBottom: 'var(--space-4)' }}>{error}</div>}
      {loading ? (
        <p role="status">Loading reservations…</p>
      ) : reservations.length === 0 ? (
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
            <article
              key={res.id}
              className="customer-reservation-card brand-card brand-card--green"
            >
              <div className="customer-reservation-card__heading">
                <div>
                  <div className="customer-reservation-card__title-row">
                    <h2>
                      {res.restaurantName}
                    </h2>
                    <Badge variant={['Approved', 'Confirmed', 'Arrived', 'Seated', 'Completed'].includes(res.status) ? 'success' : res.status === 'Pending' ? 'warning' : ['Cancelled', 'Rejected', 'No-Show', 'Expired'].includes(res.status) ? 'error' : 'default'} dot size="sm">
                      {res.status}
                    </Badge>
                  </div>
                  <p className="customer-reservation-card__meta">
                    Booking Ref: <strong>#{res.id}</strong> · Area: {res.seatingArea}
                  </p>
                </div>

                <div className="customer-reservation-card__actions">
                  {!['Cancelled', 'Rejected', 'Completed', 'No-Show', 'Expired'].includes(res.status) && !['requested', 'approved'].includes(res.cancellationRequest?.status) && (
                    <Button variant="danger-outline" size="sm" onClick={() => handleCancelClick(res.id)}>
                      Request cancellation
                    </Button>
                  )}
                  {res.cancellationRequest?.status === 'requested' && <Badge variant="warning" size="sm">Cancellation under review</Badge>}
                </div>
              </div>

              {/* Booking Details Grid */}
              <div className="customer-reservation-card__details">
                <div>
                  <span>Date &amp; Time</span>
                  <p>
                    📅 {res.date} at {res.time}
                  </p>
                </div>

                <div>
                  <span>Party Size</span>
                  <p>
                    👥 {res.guests} Guests
                  </p>
                </div>

                <div>
                  <span>Reservation fee / payment</span>
                  <p className={res.paymentStatus === 'Paid' ? 'is-paid' : ''}>
                    ₱{res.fee ?? res.depositAmount ?? 0} · {res.paymentStatus || 'Pending'}
                  </p>
                </div>

                {res.cancellationDeadline && (
                <div>
                  <span>Cancellation Deadline</span>
                  <p>{res.cancellationDeadline}</p>
                </div>
                )}
              </div>

              {res.specialRequests && (
                <div className="customer-reservation-card__note">
                  <span>Note to restaurant:</span> {res.specialRequests}
                </div>
              )}
              {res.cancellationRequest?.resolutionReason && (
                <p className="customer-reservation-card__note">
                  Cancellation update: {res.cancellationRequest.resolutionReason}
                </p>
              )}
            </article>
          ))}
        </div>
      )}
    </CustomerLayout>
  );
}
