import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Button from '../../../components/common/Button';
import { Card, CardBody } from '../../../components/common/Card';
import { StateView as GlobalStateView } from '../../../components/feedback';
import PageHeader from '../components/PageHeader';
import riderService from '../../../services/riderService';
import { useAuth } from '../../../hooks/useAuth';
import './RiderProfilePage.css';

export default function RiderProfilePage() {
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await riderService.getProfile();
      setProfile(data);
    } catch (err) {
      setError(err?.message || 'Unable to load rider profile.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="rider-page-shell">
        <PageHeader title="Rider profile" subtitle="Review your rider account and vehicle details." eyebrow="Your account" />
        <GlobalStateView state="loading" title="Loading rider profile..." />
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="rider-page-shell">
        <PageHeader title="Rider profile" subtitle="Review your rider account and vehicle details." eyebrow="Your account" />
        <GlobalStateView state="error" title="Profile unavailable" description={error || 'No rider profile found.'} onRetry={load} />
      </div>
    );
  }

  const displayName = user?.name || profile.name || user?.username || 'Rider';

  return (
    <div className="rider-page-shell">
      <PageHeader title="Rider profile" subtitle="Review your rider account and vehicle details." eyebrow="Your account" />
      <div className="rider-profile-account-links">
        <Link to="/rider/account-status"><Button variant="secondary">Account status</Button></Link>
      </div>
      <div className="rider-profile-layout">
        <Card>
          <CardBody>
            <div className="rider-profile-identity">
              <div className="rider-profile-avatar" aria-hidden="true">{displayName.slice(0, 2).toUpperCase()}</div>
              <div>
                <h2>{displayName}</h2>
                <p>{profile.base_city || 'Base city not set'}</p>
              </div>
            </div>
            <dl className="rider-profile-fields">
              <div><dt>Email</dt><dd>{user?.email || profile.email || '—'}</dd></div>
              <div><dt>Contact number</dt><dd>{user?.phone || profile.phone_number || '—'}</dd></div>
              <div><dt>Vehicle type</dt><dd>{profile.vehicle_type || '—'}</dd></div>
              <div><dt>Plate number</dt><dd>{profile.plate_number || '—'}</dd></div>
              <div><dt>Emergency contact</dt><dd>{profile.emergency_contact_name || '—'}</dd></div>
              <div><dt>Emergency phone</dt><dd>{profile.emergency_contact_phone || '—'}</dd></div>
              <div><dt>Account status</dt><dd>{profile.rider_status || '—'}</dd></div>
            </dl>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
