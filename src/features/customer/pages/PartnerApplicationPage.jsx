import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import CustomerLayout from '../../../layouts/CustomerLayout';
import { useAuth } from '../../../hooks/useAuth';
import Button from '../../../components/common/Button';
import Badge from '../../../components/common/Badge';
import applicationService, { mapBackendApplicationStatus } from '../../../services/applicationService';
import './PartnerApplicationPage.css';

export default function PartnerApplicationPage() {
  const { user } = useAuth();

  const [applications, setApplications] = useState({ restaurant: null });
  const [riderApp, setRiderApp] = useState(null);
  const [notification, setNotification] = useState(null);

  useEffect(() => {
    if (!user?.id && !user?.user_id) return;
    let active = true;

    (async () => {
      try {
        const data = await applicationService.getAccountApplications();
        if (!active || !data) return;

        if (data.restaurant_application) {
          setApplications({
            restaurant: {
              status: mapBackendApplicationStatus(data.restaurant_application.application_status),
              submittedAt: data.restaurant_application.submitted_at,
              reviewerNote: data.restaurant_application.reviewer_note,
            },
          });
        } else {
          setApplications({ restaurant: null });
        }

        if (data.rider_application) {
          setRiderApp({
            applicationStatus: mapBackendApplicationStatus(data.rider_application.application_status),
            submittedAt: data.rider_application.submitted_at,
            reviewerNote: data.rider_application.reviewer_note,
          });
        } else {
          setRiderApp(null);
        }
      } catch {
        // Leave empty state if request fails
      }
    })();

    return () => {
      active = false;
    };
  }, [user?.id, user?.user_id]);

  // Submit Rider Partner Application
  const getStatusBadge = (status) => {
    switch (status) {
      case 'Approved':
        return <Badge variant="success" size="md">Approved</Badge>;
      case 'Pending Review':
        return <Badge variant="warning" size="md">Pending Review</Badge>;
      case 'Rejected':
        return <Badge variant="error" size="md">Rejected</Badge>;
      default:
        return <Badge variant="default" size="md">Not Applied</Badge>;
    }
  };

  return (
    <CustomerLayout>
      <div className="partner-page-container">
        {notification && (
          <div className="partner-alert-banner" role="status">
            <span style={{ fontSize: 18 }}>✓</span>
            <span>{notification}</span>
            <button
              type="button"
              onClick={() => setNotification(null)}
              style={{ background: 'none', border: 'none', marginLeft: 'auto', cursor: 'pointer', color: 'inherit' }}
            >
              ✕
            </button>
          </div>
        )}

        {/* ── Partner Application Cards Grid ──────────────── */}
        <div className="partner-cards-grid">
          {/* Card 1: Restaurant Partner */}
          <div className="partner-card">
            <div className="partner-card-media">
              <img
                src="/images/landing/restaurant-interior.png"
                alt="SALO Restaurant Partner Dining Room"
                className="partner-card-img"
              />
              <div className="partner-card-status-pill">
                {getStatusBadge(applications.restaurant?.status)}
              </div>
            </div>

            <div className="partner-card-body">
              <span className="partner-type-tag">Kitchens & Dining</span>
              <h2 className="partner-card-title">Restaurant Partner</h2>
              <p className="partner-card-desc">
                Bring your restaurant to SALO and reach more customers. Benefit from consolidated multi-kitchen orders, automated table bookings, and fair 10% platform commission.
              </p>

              <div className="partner-perks-list">
                <div className="partner-perk-item">
                  <span className="perk-bullet">✓</span>
                  <span>Direct table reservation system with guest deposits</span>
                </div>
                <div className="partner-perk-item">
                  <span className="perk-bullet">✓</span>
                  <span>Single-ticket multi-order packaging and real-time kitchen tracking</span>
                </div>
                <div className="partner-perk-item">
                  <span className="perk-bullet">✓</span>
                  <span>Weekly automated bank payouts and sales analytics</span>
                </div>
              </div>

              <div className="partner-card-action">
                {applications.restaurant?.status === 'Approved' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
                    <Button as={Link} to="/owner" variant="primary" size="lg" fullWidth>
                      Open Merchant Portal →
                    </Button>
                    <Button as={Link} to="/business-application/status" variant="outline" size="sm" fullWidth>
                      View Application Status
                    </Button>
                  </div>
                ) : applications.restaurant?.status ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%' }}>
                    <div className="partner-status-box pending">
                      <p style={{ fontWeight: 700, margin: '0 0 4px', color: 'var(--salo-warning)' }}>
                        Application: {applications.restaurant.status}
                      </p>
                      <p style={{ fontSize: 12, margin: 0, color: 'var(--text-secondary)' }}>
                        Ref: {applications.restaurant.referenceNumber || applications.restaurant.id || 'SALO-REST-20261109-001'} · {applications.restaurant.submittedAt ? `Submitted on ${applications.restaurant.submittedAt}` : 'Review in progress by SALO Onboarding Operations'}
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
                      <Button as={Link} to="/business-application/status" variant="primary" size="md" fullWidth>
                        Check Status
                      </Button>
                      <Button as={Link} to="/become-a-partner" variant="outline" size="md" fullWidth>
                        Edit Application
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="partner-card-actions-stack">
                    <Button
                      as={Link}
                      to="/become-a-partner"
                      variant="primary"
                      size="lg"
                      fullWidth
                    >
                      Apply as a Restaurant Partner
                    </Button>
                    <Button as={Link} to="/business-application/status" variant="outline" size="md" fullWidth>
                      View Application Status
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Card 2: Delivery Rider */}
          <div className="partner-card">
            <div className="partner-card-media">
              <img
                src="/images/rider/rider-hero.png"
                alt="SALO Delivery Courier"
                className="partner-card-img"
              />
              <div className="partner-card-status-pill">
                {getStatusBadge(riderApp ? (riderApp.applicationStatus || 'Pending Review') : null)}
              </div>
            </div>

            <div className="partner-card-body">
              <span className="partner-type-tag">Fleet & Courier</span>
              <h2 className="partner-card-title">Rider Partner</h2>
              <p className="partner-card-desc">
                Deliver food with SALO and earn on your schedule. Choose from motorcycle, bicycle, e-bike, e-scooter, or walking delivery with transparent payouts and road safety support.
              </p>

              <div className="partner-perks-list">
                <div className="partner-perk-item">
                  <span className="perk-bullet">✓</span>
                  <span>5 transport modes: Motorcycle, Bicycle, E-bike, E-scooter, & Walking</span>
                </div>
                <div className="partner-perk-item">
                  <span className="perk-bullet">✓</span>
                  <span>Weekly automated payouts directly to GCash, Maya, or bank account</span>
                </div>
                <div className="partner-perk-item">
                  <span className="perk-bullet">✓</span>
                  <span>Free thermal delivery gear and rider accident coverage</span>
                </div>
              </div>

              <div className="partner-card-action">
                {riderApp ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%' }}>
                    <div className="partner-status-box pending">
                      <p style={{ fontWeight: 700, margin: '0 0 4px', color: 'var(--salo-warning)' }}>
                        Application: {riderApp.applicationStatus || 'Pending Review'}
                      </p>
                      <p style={{ fontSize: 12, margin: 0, color: 'var(--text-secondary)' }}>
                        Ref: {riderApp.referenceNumber || riderApp.id} · Mode: {riderApp.deliveryMethod || 'motorcycle'}
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
                      <Button as={Link} to="/rider-application/status" variant="primary" size="md" fullWidth>
                        Check Status
                      </Button>
                      <Button as={Link} to="/become-a-rider" variant="outline" size="md" fullWidth>
                        Edit Application
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="partner-card-actions-stack">
                    <Button as={Link} to="/become-a-rider" variant="primary" size="lg" fullWidth>
                      Apply as a Rider Partner
                    </Button>
                    <Button as={Link} to="/rider-application/status" variant="outline" size="md" fullWidth>
                      View Application Status
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

      </div>
    </CustomerLayout>
  );
}
