import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import CustomerLayout from '../../../layouts/CustomerLayout';
import { useAuth } from '../../../hooks/useAuth';
import Button from '../../../components/common/Button';
import Badge from '../../../components/common/Badge';
import { adminService } from '../../../services/adminService';
import './PartnerApplicationPage.css';

const STORAGE_KEY = 'salo_partner_applications';

export default function PartnerApplicationPage() {
  const { user } = useAuth();

  // Restaurant application preview remains separate from the rider UI flow.
  const [applications, setApplications] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? { restaurant: JSON.parse(stored).restaurant || null } : { restaurant: null };
    } catch {
      return { restaurant: null };
    }
  });

  const [riderApp] = useState(() => {
    try {
      const stored = localStorage.getItem('salo_rider_applications');
      if (stored) {
        const parsed = JSON.parse(stored);
        return Array.isArray(parsed) ? parsed[0] : parsed;
      }
    } catch {
      return null;
    }
    return null;
  });

  const [notification, setNotification] = useState(null);

  // Synchronize live status with adminService
  useEffect(() => {
    if (!user?.email) return;

    // Check if user's restaurant application exists in adminService
    const adminRestaurants = adminService.getRestaurants();
    const existingRest = adminRestaurants.find((r) => r.ownerEmail?.toLowerCase() === user.email.toLowerCase());

    setApplications((prev) => {
      const next = { ...prev };
      if (existingRest) {
        let status = 'Pending Review';
        if (existingRest.status === 'Active') status = 'Approved';
        if (existingRest.status === 'Suspended') status = 'Rejected';
        next.restaurant = {
          ...next.restaurant,
          name: existingRest.name,
          status,
          id: existingRest.id,
          submittedAt: existingRest.joinedDate || '',
        };
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, [user]);

  // Submit Rider Partner Application
  const getStatusBadge = (status) => {
    switch (status) {
      case 'Approved':
        return <Badge variant="success" size="md">Approved</Badge>;
      case 'Pending Review':
        return <Badge variant="warning" size="md">Pending Review</Badge>;
      case 'Rejected':
        return <Badge variant="danger" size="md">Rejected</Badge>;
      default:
        return <Badge variant="neutral" size="md">Not Applied</Badge>;
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
                  <Button
                    as={Link}
                    to="/become-a-partner"
                    variant="primary"
                    size="lg"
                    fullWidth
                  >
                    Apply as a Restaurant Partner
                  </Button>
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
                {riderApp ? getStatusBadge(riderApp.applicationStatus || 'Pending Review') : <Badge variant="neutral" size="md">Not Applied</Badge>}
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
                  <div className="rider-partner-actions" style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
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
