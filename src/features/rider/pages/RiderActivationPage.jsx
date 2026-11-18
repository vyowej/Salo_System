import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Badge from '../../../components/common/Badge';
import Button from '../../../components/common/Button';
import { Card, CardBody } from '../../../components/common/Card';
import { StateView as GlobalStateView } from '../../../components/feedback';
import PageHeader from '../components/PageHeader';
import riderService from '../../../services/riderService';
import applicationService from '../../../services/applicationService';
import { getRiderActivationViewModel } from '../utils/riderActivationStatus';

export default function RiderActivationPage() {
  const [profile, setProfile] = useState(null);
  const [application, setApplication] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [profileRes, appRes] = await Promise.allSettled([
        riderService.getProfile(),
        applicationService.getCurrentRiderApplication(),
      ]);

      const nextProfile = profileRes.status === 'fulfilled' ? profileRes.value : null;
      const nextApp = appRes.status === 'fulfilled' ? appRes.value : null;

      if (
        profileRes.status === 'rejected' &&
        profileRes.reason?.status !== 404 &&
        appRes.status === 'rejected'
      ) {
        throw profileRes.reason || appRes.reason;
      }

      if (profileRes.status === 'rejected' && profileRes.reason?.status !== 404 && !nextApp) {
        throw profileRes.reason;
      }

      setProfile(nextProfile);
      setApplication(nextApp);
    } catch (err) {
      setError(err?.message || 'Unable to load rider activation status.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    window.addEventListener('salo:riderUpdated', load);
    return () => window.removeEventListener('salo:riderUpdated', load);
  }, [load]);

  if (loading) {
    return (
      <div className="rider-page-shell">
        <PageHeader title="Account activation" subtitle="Rider account verification and activation status." eyebrow="Account" />
        <GlobalStateView state="loading" title="Loading activation status..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rider-page-shell">
        <PageHeader title="Account activation" subtitle="Rider account verification and activation status." eyebrow="Account" />
        <GlobalStateView state="error" title="Could not load activation status" description={error} onRetry={load} />
      </div>
    );
  }

  const view = getRiderActivationViewModel(profile, application);

  if (view.state === 'empty') {
    return (
      <div className="rider-page-shell">
        <PageHeader title="Account activation" subtitle="Rider account verification and activation status." eyebrow="Account" />
        <GlobalStateView
          state="empty"
          title={view.title}
          description={view.description}
          action={<Link to="/become-a-rider"><Button variant="primary" size="sm">Apply as a rider</Button></Link>}
        />
      </div>
    );
  }

  return (
    <div className="rider-page-shell">
      <PageHeader title="Account activation" subtitle="Rider account verification and activation status." eyebrow="Account" />
      <Card>
        <CardBody className="rider-stack">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0 }}>{view.title}</h2>
            <Badge variant={view.badgeVariant} size="md">{view.badgeLabel}</Badge>
          </div>

          <p style={{ margin: 0, color: 'var(--text-secondary)' }}>{view.description}</p>

          {view.reviewerNote && (
            <p role="note" style={{ margin: 0 }}>
              <strong>Reviewer note:</strong> {view.reviewerNote}
            </p>
          )}

          {profile && (
            <dl className="rider-profile-fields" style={{ margin: 0 }}>
              <div><dt>Rider status</dt><dd>{profile.rider_status || '—'}</dd></div>
              <div><dt>Base city</dt><dd>{profile.base_city || '—'}</dd></div>
              <div><dt>Vehicle</dt><dd>{[profile.vehicle_type, profile.plate_number].filter(Boolean).join(' · ') || '—'}</dd></div>
            </dl>
          )}

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {view.canGoOnline ? (
              <Link to="/rider/go-online">
                <Button variant="primary" size="sm">Go online</Button>
              </Link>
            ) : (
              <Button variant="secondary" size="sm" onClick={load}>
                Refresh status
              </Button>
            )}

            {view.statusKey === 'rejected' && (
              <Link to="/become-a-rider">
                <Button variant="primary" size="sm">Update application</Button>
              </Link>
            )}

            <Link to="/rider-application/status">
              <Button variant="outline" size="sm">View application status</Button>
            </Link>
            <Link to="/rider/account-status">
              <Button variant="ghost" size="sm">Account status</Button>
            </Link>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
