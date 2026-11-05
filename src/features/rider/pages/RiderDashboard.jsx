import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import RiderLayout from '../../../layouts/RiderLayout';
import riderService from '../../../services/riderService';
import Button from '../../../components/common/Button';
import Badge from '../../../components/common/Badge';

export default function RiderDashboard() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(riderService.getRiderProfile());
  const [activeDelivery, setActiveDelivery] = useState(riderService.getActiveDelivery());
  const [availableJobs, setAvailableJobs] = useState(riderService.getAvailableJobs());
  const [earnings, setEarnings] = useState(riderService.getEarningsSummary());

  useEffect(() => {
    setProfile(riderService.getRiderProfile());
    setActiveDelivery(riderService.getActiveDelivery());
    setAvailableJobs(riderService.getAvailableJobs());
    setEarnings(riderService.getEarningsSummary());
  }, []);

  function handleAcceptJob(jobId) {
    const newDelivery = riderService.acceptJob(jobId);
    if (newDelivery) {
      setActiveDelivery(newDelivery);
      setAvailableJobs(riderService.getAvailableJobs());
      navigate('/rider/active');
    }
  }

  return (
    <RiderLayout>
      {/* ── Page Header ────────────────────────────────── */}
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-1)' }}>
          <span className="fiesta-pill fiesta-pill-green">🛵 Salo Rider Dispatch</span>
          <span className="fiesta-pill">{profile.zone}</span>
        </div>
        <h1 className="page-title" style={{ fontSize: 'var(--font-size-3xl)', marginTop: 'var(--space-1)' }}>
          Ready for today&apos;s deliveries, {profile.name.split(' ')[0]}?
        </h1>
        <p className="page-subtitle">
          Keep your motorcycle tuned, follow safety guidelines, and deliver hot meals to Filipino homes.
        </p>
      </div>

      {/* ── 4 KPI Stat Cards ────────────────────────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
        gap: 'var(--space-4)',
        marginBottom: 'var(--space-8)',
      }}>
        {/* Today's Pay */}
        <div style={{
          background: 'var(--surface-primary)',
          border: '1px solid var(--border-primary)',
          borderRadius: 'var(--radius-xl)',
          padding: 'var(--space-5)',
          boxShadow: 'var(--shadow-sm)',
        }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.06em' }}>
            Today&apos;s Take-Home
          </span>
          <p style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800, color: 'var(--salo-green)', margin: 'var(--space-2) 0' }}>
            ₱{earnings.todayEarnings.toLocaleString('en-PH')}
          </p>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
            Fees: ₱{earnings.deliveryFees} + Tips: ₱{earnings.tips}
          </span>
        </div>

        {/* Trips Completed */}
        <div style={{
          background: 'var(--surface-primary)',
          border: '1px solid var(--border-primary)',
          borderRadius: 'var(--radius-xl)',
          padding: 'var(--space-5)',
          boxShadow: 'var(--shadow-sm)',
        }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.06em' }}>
            Trips Completed
          </span>
          <p style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800, color: 'var(--text-primary)', margin: 'var(--space-2) 0' }}>
            {earnings.completedTrips}
          </p>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>
            {profile.totalTrips} career deliveries
          </span>
        </div>

        {/* Cash on Hand (COD) */}
        <div style={{
          background: 'var(--surface-primary)',
          border: '1px solid var(--border-primary)',
          borderRadius: 'var(--radius-xl)',
          padding: 'var(--space-5)',
          boxShadow: 'var(--shadow-sm)',
        }}>
          <span style={{ fontSize: 11, color: 'var(--accent)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.06em' }}>
            Cash On Hand (COD)
          </span>
          <p style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800, color: 'var(--accent)', margin: 'var(--space-2) 0' }}>
            ₱{profile.cashOnHand.toLocaleString('en-PH')}
          </p>
          <Link to="/rider/earnings" style={{ fontSize: 'var(--font-size-xs)', color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>
            Remit via GCash / Maya →
          </Link>
        </div>

        {/* Rider Rating */}
        <div style={{
          background: 'var(--surface-primary)',
          border: '1px solid var(--border-primary)',
          borderRadius: 'var(--radius-xl)',
          padding: 'var(--space-5)',
          boxShadow: 'var(--shadow-sm)',
        }}>
          <span style={{ fontSize: 11, color: 'var(--fiesta-gold, #F59E0B)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.06em' }}>
            Customer Rating
          </span>
          <p style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800, color: 'var(--fiesta-gold, #F59E0B)', margin: 'var(--space-2) 0' }}>
            ★ {profile.rating}
          </p>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--salo-green)', fontWeight: 600 }}>
            Top Tier Courier Badge
          </span>
        </div>
      </div>

      {/* ── Active Delivery Live Section ────────────────── */}
      <div style={{ marginBottom: 'var(--space-8)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
          <h2 className="section-title" style={{ margin: 0 }}>Active Assignment</h2>
          {activeDelivery && (
            <Badge variant="primary" dot size="md">
              {activeDelivery.status}
            </Badge>
          )}
        </div>

        {activeDelivery ? (
          <div style={{
            background: 'var(--surface-primary)',
            border: '2px solid var(--salo-green)',
            borderRadius: 'var(--radius-xl)',
            padding: 'var(--space-6)',
            boxShadow: 'var(--shadow-md)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
              <div>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.06em' }}>
                  Trip {activeDelivery.id} · Order #{activeDelivery.orderId}
                </span>
                <h3 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700, color: 'var(--text-primary)', marginTop: 2 }}>
                  {activeDelivery.restaurantName} → {activeDelivery.customerName}
                </h3>
                <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', marginTop: 4 }}>
                  📍 Drop-off: <strong>{activeDelivery.deliveryAddress}</strong>
                </p>
              </div>

              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>
                  Trip Earning
                </span>
                <p style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800, color: 'var(--salo-green)', margin: '2px 0 0' }}>
                  ₱{activeDelivery.payout + activeDelivery.tip}
                </p>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  Fee ₱{activeDelivery.payout} + Tip ₱{activeDelivery.tip}
                </span>
              </div>
            </div>

            {/* Pickup & COD strip */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 'var(--space-3)',
              padding: 'var(--space-4)',
              background: 'var(--bg-secondary)',
              borderRadius: 'var(--radius-lg)',
              marginBottom: 'var(--space-5)',
              fontSize: 'var(--font-size-xs)',
            }}>
              <div>
                <span style={{ color: 'var(--text-muted)', display: 'block' }}>Pickup Location:</span>
                <strong>{activeDelivery.restaurantAddress}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)', display: 'block' }}>Payment & Collection:</span>
                <strong style={{ color: activeDelivery.cashToCollect > 0 ? 'var(--accent)' : 'var(--salo-green)' }}>
                  {activeDelivery.paymentMethod} {activeDelivery.cashToCollect > 0 ? `(Collect ₱${activeDelivery.cashToCollect})` : '(Prepaid)'}
                </strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)', display: 'block' }}>Distance & Route:</span>
                <strong>{activeDelivery.distanceKm} km direct ride</strong>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)' }}>
              <Link to="/rider/active" style={{ textDecoration: 'none' }}>
                <Button variant="primary" size="md">
                  Open Live Step-by-Step Navigation →
                </Button>
              </Link>
            </div>
          </div>
        ) : (
          <div style={{
            background: 'var(--surface-primary)',
            border: '1px dashed var(--border-primary)',
            borderRadius: 'var(--radius-xl)',
            padding: 'var(--space-10) var(--space-4)',
            textAlign: 'center',
          }}>
            <span style={{ fontSize: 40 }}>🛵</span>
            <h3 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 700, marginTop: 8 }}>
              No Active Delivery in Progress
            </h3>
            <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', maxWidth: 420, margin: '6px auto var(--space-4)' }}>
              You are currently free. Check the available orders below or head over to the jobs board to accept a delivery trip.
            </p>
            <Link to="/rider/jobs" style={{ textDecoration: 'none' }}>
              <Button variant="secondary" size="sm">
                Browse Available Jobs ({availableJobs.length})
              </Button>
            </Link>
          </div>
        )}
      </div>

      {/* ── Available Jobs Preview ───────────────────────── */}
      <div style={{ marginBottom: 'var(--space-8)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
          <div>
            <h2 className="section-title" style={{ margin: 0 }}>Available Deliveries Nearby</h2>
            <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', margin: '2px 0 0' }}>
              Orders ready for pickup in your designated zone
            </p>
          </div>
          <Link to="/rider/jobs" style={{ textDecoration: 'none' }}>
            <Button variant="outline" size="sm">
              View All Jobs ({availableJobs.length}) →
            </Button>
          </Link>
        </div>

        {availableJobs.length === 0 ? (
          <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-muted)' }}>
            No pending dispatch requests at this moment. You will be notified when a new order is ready!
          </p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 'var(--space-4)' }}>
            {availableJobs.slice(0, 2).map((job) => (
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
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-2)' }}>
                    <Badge variant="info" size="sm">{job.readyStatus}</Badge>
                    <span style={{ fontSize: 'var(--font-size-md)', fontWeight: 800, color: 'var(--salo-green)' }}>
                      ₱{job.payout}
                    </span>
                  </div>

                  <h3 style={{ fontSize: 'var(--font-size-md)', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>
                    {job.restaurantName}
                  </h3>
                  <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', margin: '0 0 var(--space-3)' }}>
                    Pickup: {job.restaurantAddress}
                  </p>

                  <div style={{
                    padding: 'var(--space-3)',
                    background: 'var(--bg-secondary)',
                    borderRadius: 'var(--radius-md)',
                    fontSize: '11px',
                    color: 'var(--text-secondary)',
                    marginBottom: 'var(--space-4)',
                  }}>
                    <span>📍 Deliver to: <strong>{job.dropoffAddress}</strong></span>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                      <span>Distance: {job.distanceKm} km ({job.estimatedMinutes})</span>
                      <span>Payment: {job.paymentMethod}</span>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 'var(--space-2)' }}>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => handleAcceptJob(job.id)}
                    disabled={Boolean(activeDelivery)}
                  >
                    {activeDelivery ? 'Finish Current Trip First' : 'Accept & Start Trip (₱' + job.payout + ')'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </RiderLayout>
  );
}
