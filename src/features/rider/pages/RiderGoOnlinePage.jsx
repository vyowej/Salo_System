import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Button from '../../../components/common/Button';
import { Card, CardBody } from '../../../components/common/Card';
import { StateView as GlobalStateView } from '../../../components/feedback';
import PageHeader from '../components/PageHeader';
import riderService from '../../../services/riderService';
import locationApiService from '../../../services/locationApiService';
import './RiderGoOnlinePage.css';

export default function RiderGoOnlinePage() {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await riderService.getDashboard();
      setDashboard(data);
    } catch (err) {
      setError(err?.message || 'Unable to load availability.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const isRiderOnline = (avail) => (
    typeof avail === 'string'
      ? avail === 'online'
      : Boolean(avail?.is_online || avail?.status === 'online')
  );

  const handleToggle = async () => {
    if (saving) return;
    const nextStatus = isRiderOnline(dashboard?.availability) ? 'offline' : 'online';
    setSaving(true);
    setError(null);
    setNotice('');
    try {
      await riderService.updateAvailability(nextStatus);
      if (nextStatus === 'online' && typeof navigator !== 'undefined' && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          async (pos) => {
            try {
              await locationApiService.recordRiderLocation({
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude,
                accuracy: pos.coords.accuracy,
              });
            } catch {
              // Ignore optional location ping failure
            }
          },
          () => {},
        );
      }
      await load();
      window.dispatchEvent(new Event('salo:riderUpdated'));
      setNotice(`Status updated to ${nextStatus}.`);
    } catch (err) {
      setError(err?.message || 'Unable to update availability.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="rider-page-shell">
        <PageHeader title="Go online" subtitle="Manage your driver availability." eyebrow="Availability" />
        <GlobalStateView state="loading" title="Loading availability..." />
      </div>
    );
  }

  if (error && !dashboard) {
    return (
      <div className="rider-page-shell">
        <PageHeader title="Go online" subtitle="Manage your driver availability." eyebrow="Availability" />
        <GlobalStateView state="error" title="Could not load availability" description={error} onRetry={load} />
      </div>
    );
  }

  const isOnline = isRiderOnline(dashboard?.availability);
  const isRiderActive = dashboard?.rider?.rider_status === 'active';

  return (
    <div className="rider-page-shell">
      <PageHeader title="Go online" subtitle="Manage your driver availability." eyebrow="Availability" />
      <Card>
        <CardBody className="rider-go-online-body">
          {!isRiderActive && (
            <div role="status" style={{ marginBottom: 'var(--space-3)', color: 'var(--status-warning-text, #7c5800)', fontWeight: 600 }}>
              Awaiting activation — only active riders can go online.
            </div>
          )}
          <div className="rider-go-online-header">
            <div>
              <h2>Driver Mode: {isOnline ? 'Online' : 'Offline'}</h2>
              <p>Base city: {dashboard?.rider?.base_city || 'Not set'} · Account status: {dashboard?.rider?.rider_status || 'pending'}</p>
            </div>
          </div>

          {error && <p role="alert" style={{ color: 'var(--danger, #c62828)' }}>{error}</p>}
          {notice && <p role="status" style={{ color: 'var(--success, #2e7d32)' }}>{notice}</p>}

          <div className="rider-go-online-actions">
            <Button variant={isOnline ? 'secondary' : 'primary'} onClick={handleToggle} disabled={saving || !isRiderActive}>
              {!isRiderActive ? 'Awaiting activation' : saving ? 'Updating...' : isOnline ? 'Go offline' : 'Go online'}
            </Button>
            <Link to="/rider">
              <Button variant="secondary">Back to dashboard</Button>
            </Link>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
