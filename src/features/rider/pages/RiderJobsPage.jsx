import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import RiderLayout from '../../../layouts/RiderLayout';
import riderService from '../../../services/riderService';
import Button from '../../../components/common/Button';
import Badge from '../../../components/common/Badge';

export default function RiderJobsPage() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(riderService.getRiderProfile());
  const [jobs, setJobs] = useState([]);
  const [activeDelivery, setActiveDelivery] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  function loadData() {
    setProfile(riderService.getRiderProfile());
    setJobs(riderService.getAvailableJobs());
    setActiveDelivery(riderService.getActiveDelivery());
  }

  function handleAccept(jobId) {
    const newActive = riderService.acceptJob(jobId);
    if (newActive) {
      navigate('/rider/active');
    }
  }

  function handleDecline(jobId) {
    const updated = riderService.declineJob(jobId);
    setJobs([...updated]);
  }

  return (
    <RiderLayout>
      {/* ── Page Header ────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-6)', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
        <div>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: 'var(--salo-green)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            Live Dispatch Board
          </span>
          <h1 className="page-title" style={{ fontSize: 'var(--font-size-2xl)', marginTop: 'var(--space-1)' }}>
            Available Delivery Jobs ({jobs.length})
          </h1>
          <p className="page-subtitle">
            Orders packaged and waiting for pickup in {profile.zone}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <Badge variant={profile.isOnline ? 'success' : 'default'} size="lg" dot>
            {profile.isOnline ? 'Active Dispatch Zone' : 'Currently Offline'}
          </Badge>
        </div>
      </div>

      {/* ── Active Delivery Warning Notice ─────────────── */}
      {activeDelivery && (
        <div style={{
          background: 'var(--status-warning-bg, #FFFBEB)',
          border: '1.5px solid var(--fiesta-gold, #F59E0B)',
          borderRadius: 'var(--radius-xl)',
          padding: 'var(--space-4) var(--space-5)',
          marginBottom: 'var(--space-6)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 'var(--space-3)',
        }}>
          <div>
            <strong style={{ color: 'var(--status-warning-text, #92400E)', display: 'block' }}>
              Active Trip in Progress ({activeDelivery.id})
            </strong>
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
              You must complete your active delivery to {activeDelivery.customerName} before accepting new orders.
            </span>
          </div>
          <Link to="/rider/active" style={{ textDecoration: 'none' }}>
            <Button variant="primary" size="sm">
              Return to Active Trip →
            </Button>
          </Link>
        </div>
      )}

      {/* ── Offline Prompt ─────────────────────────────── */}
      {!profile.isOnline && (
        <div style={{
          textAlign: 'center',
          padding: 'var(--space-10) var(--space-4)',
          background: 'var(--surface-primary)',
          border: '1px dashed var(--border-primary)',
          borderRadius: 'var(--radius-xl)',
          marginBottom: 'var(--space-6)',
        }}>
          <span style={{ fontSize: 36 }}>⏸</span>
          <h3 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 700, margin: '8px 0 4px' }}>
            You are Currently Offline
          </h3>
          <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', maxWidth: 420, margin: '0 auto var(--space-4)' }}>
            Switch your status to Online in the top bar to receive live dispatch offers and start earning delivery fees.
          </p>
          <Button variant="primary" size="sm" onClick={() => { riderService.toggleOnlineStatus(); loadData(); }}>
            Go Online Now
          </Button>
        </div>
      )}

      {/* ── Jobs Grid ──────────────────────────────────── */}
      {jobs.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: 'var(--space-12) var(--space-4)',
          background: 'var(--surface-primary)',
          border: '1px solid var(--border-primary)',
          borderRadius: 'var(--radius-xl)',
        }}>
          <span style={{ fontSize: 40 }}>🛵</span>
          <h3 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 700, margin: '8px 0 4px' }}>
            No Dispatch Requests Available
          </h3>
          <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-muted)' }}>
            All current orders have been claimed. Check back shortly as restaurants finish cooking.
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 'var(--space-5)' }}>
          {jobs.map((job) => (
            <div
              key={job.id}
              style={{
                background: 'var(--surface-primary)',
                border: '1px solid var(--border-primary)',
                borderRadius: 'var(--radius-xl)',
                padding: 'var(--space-5)',
                boxShadow: 'var(--shadow-sm)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                transition: 'border-color var(--transition-fast)',
              }}
            >
              <div>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-3)' }}>
                  <div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      Dispatch {job.id} · {job.orderId}
                    </span>
                    <h3 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 700, color: 'var(--text-primary)', margin: '2px 0 0' }}>
                      {job.restaurantName}
                    </h3>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800, color: 'var(--salo-green)' }}>
                      ₱{job.payout}
                    </span>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)', display: 'block' }}>Guaranteed Fare</span>
                  </div>
                </div>

                <Badge variant="info" size="sm" style={{ marginBottom: 'var(--space-3)' }}>
                  {job.readyStatus}
                </Badge>

                {/* Route specs */}
                <div style={{
                  padding: 'var(--space-3)',
                  background: 'var(--bg-secondary)',
                  borderRadius: 'var(--radius-lg)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  fontSize: 'var(--font-size-xs)',
                  marginBottom: 'var(--space-4)',
                }}>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Pick up at: </span>
                    <strong style={{ color: 'var(--text-primary)' }}>{job.restaurantAddress}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Deliver to: </span>
                    <strong style={{ color: 'var(--text-primary)' }}>{job.dropoffAddress}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 6, borderTop: '1px solid var(--border-secondary)' }}>
                    <span>Distance: <strong>{job.distanceKm} km ({job.estimatedMinutes})</strong></span>
                    <span style={{ color: job.cashToCollect ? 'var(--accent)' : 'var(--salo-green)', fontWeight: 600 }}>
                      {job.cashToCollect ? `COD (Collect ₱${job.cashToCollect})` : 'Prepaid (Online)'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 'var(--space-2)' }}>
                <Button
                  variant="primary"
                  size="md"
                  onClick={() => handleAccept(job.id)}
                  disabled={Boolean(activeDelivery) || !profile.isOnline}
                >
                  Accept & Ride →
                </Button>
                <Button
                  variant="ghost"
                  size="md"
                  onClick={() => handleDecline(job.id)}
                  style={{ color: 'var(--text-muted)' }}
                >
                  Pass
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </RiderLayout>
  );
}
