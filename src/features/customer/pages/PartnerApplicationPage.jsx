import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import CustomerLayout from '../../../layouts/CustomerLayout';
import { useAuth } from '../../../hooks/useAuth';
import Button from '../../../components/common/Button';
import Badge from '../../../components/common/Badge';
import applicationService, { mapBackendApplicationStatus } from '../../../services/applicationService';
import './PartnerApplicationPage.css';

function normalizePartnerApplication(application) {
  if (!application || !application.status) {
    return null;
  }

  return {
    status: mapBackendApplicationStatus(application.status),
    submittedAt: application.submitted_at ?? null,
    updatedAt: application.updated_at ?? null,
    reviewerNote: application.reviewer_note ?? null,
  };
}

export default function PartnerApplicationPage() {
  const { user } = useAuth();
  const hasUser = Boolean(user?.id || user?.user_id);

  const [applications, setApplications] = useState({ restaurant: null, rider: null });
  const [loading, setLoading] = useState(hasUser);
  const [notification, setNotification] = useState(null);

  useEffect(() => {
    if (!hasUser) {
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);

    (async () => {
      try {
        const data = await applicationService.getAccountApplications();
        if (!active || !data) return;

        setApplications({
          restaurant: normalizePartnerApplication(data.restaurant_application),
          rider: normalizePartnerApplication(data.rider_application),
        });
      } catch {
        // Leave empty state if request fails
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [hasUser]);

  const getStatusBadge = (status) => {
    if (loading) {
      return <Badge variant="default" size="md">Checking...</Badge>;
    }
    if (!status) {
      return <Badge variant="default" size="md">Not Applied</Badge>;
    }
    if (status === 'Approved') {
      return <Badge variant="success" size="md">Approved</Badge>;
    }
    if (status === 'Rejected') {
      return <Badge variant="error" size="md">Rejected</Badge>;
    }
    return <Badge variant="warning" size="md">{status}</Badge>;
  };

  const renderApplicationActions = ({
    application,
    applyPath,
    applyLabel,
    statusPath,
    portalPath,
    portalLabel,
  }) => {
    if (loading) {
      return (
        <div className="partner-status-box">
          <p style={{ fontSize: 13, margin: 0, color: 'var(--text-secondary)' }}>
            Checking application status...
          </p>
        </div>
      );
    }

    if (application?.status === 'Approved') {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
          <Button as={Link} to={portalPath} variant="primary" size="lg" fullWidth>
            {portalLabel}
          </Button>
          <Button as={Link} to={statusPath} variant="outline" size="sm" fullWidth>
            View Application Status
          </Button>
        </div>
      );
    }

    if (application?.status) {
      const isRejected = application.status === 'Rejected';
      const submittedLabel = application.submittedAt
        ? `Submitted on ${new Date(application.submittedAt).toLocaleDateString()}`
        : 'Review in progress by SALO Onboarding Operations';

      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%' }}>
          <div className={`partner-status-box ${isRejected ? 'rejected' : 'pending'}`}>
            <p
              style={{
                fontWeight: 700,
                margin: '0 0 4px',
                color: isRejected ? 'var(--status-danger-text, #b91c1c)' : 'var(--salo-warning)',
              }}
            >
              Application: {application.status}
            </p>
            <p style={{ fontSize: 12, margin: 0, color: 'var(--text-secondary)' }}>
              {submittedLabel}
            </p>
            {application.reviewerNote && (
              <p style={{ fontSize: 12, margin: '6px 0 0', color: 'var(--text-secondary)' }}>
                Note: {application.reviewerNote}
              </p>
            )}
          </div>
          <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
            <Button as={Link} to={statusPath} variant="primary" size="md" fullWidth>
              Check Status
            </Button>
            <Button as={Link} to={applyPath} variant="outline" size="md" fullWidth>
              Edit Application
            </Button>
          </div>
        </div>
      );
    }

    return (
      <div className="partner-card-actions-stack">
        <Button as={Link} to={applyPath} variant="primary" size="lg" fullWidth>
          {applyLabel}
        </Button>
        <Button as={Link} to={statusPath} variant="outline" size="md" fullWidth>
          View Application Status
        </Button>
      </div>
    );
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
                {renderApplicationActions({
                  application: applications.restaurant,
                  applyPath: '/become-a-partner',
                  applyLabel: 'Apply as a Restaurant Partner',
                  statusPath: '/business-application/status',
                  portalPath: '/owner',
                  portalLabel: 'Open Merchant Portal →',
                })}
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
                {getStatusBadge(applications.rider?.status)}
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
                {renderApplicationActions({
                  application: applications.rider,
                  applyPath: '/become-a-rider',
                  applyLabel: 'Apply as a Rider Partner',
                  statusPath: '/rider-application/status',
                  portalPath: '/rider',
                  portalLabel: 'Open Rider Portal →',
                })}
              </div>
            </div>
          </div>
        </div>

      </div>
    </CustomerLayout>
  );
}
