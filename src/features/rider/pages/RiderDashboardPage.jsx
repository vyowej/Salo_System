import { useState } from 'react';
import Button from '../../../components/common/Button';
import { Card, CardBody } from '../../../components/common/Card';
import PageHeader from '../components/PageHeader';
import StateView from '../components/StateView';
import StatusBadge from '../components/StatusBadge';
import StatCard from '../components/StatCard';
import EligibilityChecklist from '../components/EligibilityChecklist';
import ScenarioLink from '../components/ScenarioLink';
import { accountStates, availabilityStatuses, deliveryStatuses } from '../constants/statusConfig';
import { eligibilityConditions } from '../constants/eligibilityConditions';
import { dashboardMetricIcons, dashboardQuickActions } from '../constants/riderSettings';
import { getRiderMock } from '../mocks';
import useScenario from '../hooks/useScenario';
import { formatRelativeTime } from '../utils/format';
import './RiderDashboardPage.css';

const availabilityTones = {
  offline: 'brown',
  online_available: 'green',
  receiving_offer: 'orange',
  on_delivery: 'orange',
  temporarily_unavailable: 'gold',
  shift_ended: 'brown',
};

const dashboardMetricTones = {
  "Today's deliveries": 'green',
  "Today's earnings": 'gold',
  'Pending COD': 'brown',
  'Current shift': 'brown',
};

export default function RiderDashboardPage() {
  const scenario = useScenario();
  const dashboard = getRiderMock('dashboard', scenario);
  const profile = getRiderMock('riderProfile', scenario);
  const notifications = getRiderMock('notifications', scenario);
  const activeDelivery = getRiderMock('deliveries', scenario)?.active;
  const [online, setOnline] = useState(profile.availability === 'online_available');
  const availability = online ? 'online_available' : 'offline';
  const unmetConditions = eligibilityConditions.filter((condition) => !condition.met);
  const unmetSummary = unmetConditions.map((condition) => condition.label).join(', ');
  const accountStatus = accountStates.find(
    (status) => status.key === profile.accountStatus || status.label.toLowerCase() === profile.accountStatus.toLowerCase(),
  )?.key || 'pending_approval';
  const viewState = scenario === 'default' || scenario === 'active' ? 'ready' : scenario;

  return (
    <div className="rider-page-shell rider-dashboard-page">
      <PageHeader title="Rider dashboard" subtitle="Ready for today's deliveries?" eyebrow="Rider overview" />
      <StateView
        state={viewState}
        emptyTitle="No dashboard data"
        emptyMessage="This preview has no rider dashboard content."
        onRetry={() => window.location.reload()}
      >
        <section className="rider-dashboard-profile-row" aria-label="Rider profile and availability">
          <Card className={`rider-dashboard-profile card--tint-${availabilityTones[availability] || 'brown'} card--status`}>
            <CardBody>
              <div className="rider-dashboard-profile-main">
                <div className="rider-avatar-round" aria-hidden="true">{profile.initials}</div>
                <div className="rider-dashboard-profile-copy">
                  <h2>{profile.name}</h2>
                  <p>{profile.zone}</p>
                </div>
                <StatusBadge status={accountStatus} config={accountStates} />
              </div>
              <div className="rider-dashboard-availability">
                <StatusBadge status={availability} config={availabilityStatuses} />
                <label className="rider-mode-control" htmlFor="rider-dashboard-mode">
                  <span id="rider-dashboard-mode-label">Driver Mode</span>
                  <button
                    id="rider-dashboard-mode"
                    type="button"
                    role="switch"
                    aria-labelledby="rider-dashboard-mode-label"
                    aria-checked={online}
                    className={`rider-mode-toggle ${online ? 'is-on' : ''}`}
                    onClick={() => setOnline((current) => !current)}
                  >
                    <span className="rider-mode-toggle-track" aria-hidden="true" />
                    <span>{online ? 'Online' : 'Offline'}</span>
                  </button>
                </label>
              </div>
            </CardBody>
          </Card>
        </section>

        <section className="rider-stats-grid" aria-label="Today's rider summary">
          {dashboard.metrics.map((metric, index) => (
            <StatCard
              key={metric.label}
              label={metric.label}
              value={metric.value}
              helper={metric.detail}
              icon={dashboardMetricIcons[index]}
              tone={dashboardMetricTones[metric.label] || 'neutral'}
            />
          ))}
        </section>

        <section className="rider-dashboard-columns" aria-label="Current delivery and location">
          <Card className="rider-active-preview-card card--tint-orange card--status">
            <CardBody>
              <div className="rider-dashboard-section-head">
                <h2>Active delivery</h2>
                {activeDelivery && (
                  <div className="rider-dashboard-inline-actions">
                    <Button as={ScenarioLink} to="/rider/deliveries/active" variant="outline" size="sm">
                      Open delivery
                    </Button>
                    <Button as={ScenarioLink} to={`/rider/map?deliveryId=${encodeURIComponent(activeDelivery.id)}`} variant="outline" size="sm">
                      View map
                    </Button>
                  </div>
                )}
              </div>
              {activeDelivery ? (
                <div className="rider-active-preview">
                  <div className="rider-dashboard-delivery-status">
                    <strong>{activeDelivery.orderReference}</strong>
                    <StatusBadge status={activeDelivery.status} config={deliveryStatuses} />
                  </div>
                  <p><span>Pickup</span>{activeDelivery.restaurant} · {activeDelivery.restaurantAddress || activeDelivery.pickup}</p>
                  <p><span>Drop-off</span>{activeDelivery.dropoff}</p>
                  <Button as={ScenarioLink} to="/rider/deliveries/active" variant="outline" fullWidth>
                    View active delivery
                  </Button>
                </div>
              ) : (
                <div className="rider-empty-box">
                  <span aria-hidden="true">⌁</span>
                  <strong>No active delivery</strong>
                  <Button as={ScenarioLink} to="/rider/deliveries" variant="outline">Browse delivery offers</Button>
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <div className="rider-dashboard-section-head">
                <h2>Location status</h2>
                <Button as={ScenarioLink} to="/rider/map" variant="outline" size="sm">Map & tracking</Button>
              </div>
              <div className="rider-location-status">
                <StatusBadge status={dashboard.location.status} />
                <p>{dashboard.location.message || dashboard.location.status}</p>
                <small>Last updated: {formatRelativeTime(dashboard.location.updatedAt)}</small>
              </div>
            </CardBody>
          </Card>
        </section>

        <section className="rider-dashboard-lower-columns" aria-label="Notifications and quick actions">
          <Card>
            <CardBody>
              <div className="rider-dashboard-section-head">
                <h2>Recent notifications</h2>
                <Button as={ScenarioLink} to="/rider/notifications" variant="outline" size="sm">View all</Button>
              </div>
              {notifications.slice(0, 5).length ? (
                <div className="rider-list-stack">
                  {notifications.slice(0, 5).map((notice) => (
                    <article key={notice.id} className="rider-mini-list-row">
                      <div>
                        <div className="rider-notification-title">
                          <strong>{notice.title}</strong>
                          <span>{notice.unread ? 'Unread' : 'Read'}</span>
                        </div>
                        <p>{notice.message}</p>
                      </div>
                      <small>{formatRelativeTime(notice.time)}</small>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="rider-dashboard-muted">No recent notifications.</p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <div className="rider-dashboard-section-head">
                <h2>Quick actions</h2>
              </div>
              <div className="rider-inline-actions">
                {dashboardQuickActions.map((action) => (
                  <Button
                    key={action.key}
                    as={ScenarioLink}
                    to={action.path}
                    variant={action.key === 'go_online' ? 'primary' : 'outline'}
                    fullWidth
                  >
                    {action.label}
                  </Button>
                ))}
              </div>
            </CardBody>
          </Card>
        </section>

        <Card className="rider-dashboard-eligibility">
          <CardBody>
            <div className="rider-dashboard-section-head">
              <div>
                <h2>Go Online eligibility</h2>
                <p>Review the requirements before enabling Driver Mode.</p>
              </div>
              <Button as={ScenarioLink} to="/rider/go-online" variant="outline">View details</Button>
            </div>
            <EligibilityChecklist conditions={eligibilityConditions} />
            <div className="rider-dashboard-go-online">
              <Button variant="primary" disabled={unmetConditions.length > 0}>
                Go Online
              </Button>
              {unmetConditions.length > 0 && (
                <p role="status">Go Online is unavailable until these requirements are met: {unmetSummary}.</p>
              )}
            </div>
          </CardBody>
        </Card>
      </StateView>
    </div>
  );
}
