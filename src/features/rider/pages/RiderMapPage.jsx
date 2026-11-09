import { Card, CardBody } from '../../../components/common/Card';
import Button from '../../../components/common/Button';
import PageHeader from '../components/PageHeader';
import StateView from '../components/StateView';
import MapPanel from '../components/MapPanel';
import { getRiderMock } from '../mocks';
import useScenario from '../hooks/useScenario';
import { formatRelativeTime } from '../utils/format';
import './RiderMapPage.css';

export default function RiderMapPage() {
  const scenario = useScenario();
  const locationStatus = getRiderMock('locationStatus', scenario);
  const viewState = scenario === 'default' || scenario === 'active' || scenario === 'denied' || scenario === 'stale'
    ? 'ready'
    : scenario;
  const permissionState = locationStatus?.permission === 'denied' ? 'denied' : 'prompt';
  const stale = Boolean(locationStatus?.stale) || permissionState === 'denied';

  return (
    <div className="rider-page-shell">
      <PageHeader title="Map & tracking" subtitle="Check route status, rider location, and pickup timing." eyebrow="Location services" />
      <StateView
        state={viewState}
        emptyTitle="No location data"
        emptyMessage="No map data is available in this preview."
        onRetry={() => window.location.reload()}
      >
        <Card className="rider-map-card">
          <CardBody>
            <div className="rider-map-permission-card">
              <div>
                <p className="rider-map-label">Location access</p>
                <h3>{permissionState === 'denied' ? 'Location access denied' : 'Allow location access to complete route updates'}</h3>
              </div>
              <Button variant={permissionState === 'denied' ? 'outline' : 'primary'} size="sm">
                {permissionState === 'denied' ? 'Review permission' : 'Enable location access'}
              </Button>
            </div>
          </CardBody>
        </Card>

        {stale && (
          <div className="rider-map-banner" role="status">
            <strong>Location outdated</strong>
            <span>{locationStatus?.banner || 'Your last route update is no longer current.'}</span>
          </div>
        )}

        <MapPanel
          stale={stale}
          pickupLabel="Pickup"
          riderLabel="You"
          dropoffLabel="Drop-off"
          statusText="Location outdated"
        />

        <Card className="rider-map-legend-card">
          <CardBody>
            <div className="rider-map-legend">
              <span><i className="legend-dot pickup" />Pickup</span>
              <span><i className="legend-dot rider" />You</span>
              <span><i className="legend-dot dropoff" />Drop-off</span>
            </div>
            <div className="rider-map-last-updated">
              <span>Last updated</span>
              <strong>{locationStatus?.lastUpdated ? formatRelativeTime(locationStatus.lastUpdated) : 'No recent location update'}</strong>
            </div>
          </CardBody>
        </Card>
      </StateView>
    </div>
  );
}
