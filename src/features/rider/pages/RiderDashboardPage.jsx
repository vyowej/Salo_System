import { useState } from 'react';
import Button from '../../../components/common/Button';
import { Card, CardBody } from '../../../components/common/Card';
import PageHeader from '../components/PageHeader';
import StateView from '../components/StateView';
import StatusBadge from '../components/StatusBadge';
import StatCard from '../components/StatCard';
import ScenarioLink from '../components/ScenarioLink';
import { accountStates, deliveryStatuses } from '../constants/statusConfig';
import { eligibilityConditions } from '../constants/eligibilityConditions';
import { dashboardMetricIcons, driverModeEligibilityNotice } from '../constants/riderSettings';
import { getRiderMock } from '../mocks';
import useScenario from '../hooks/useScenario';
import { formatRelativeTime } from '../utils/format';
import './RiderDashboardPage.css';

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
  const unmetConditions = eligibilityConditions.filter((condition) => !condition.met);
  const accountStatus = accountStates.find(
    (status) => status.key === profile.accountStatus || status.label.toLowerCase() === profile.accountStatus.toLowerCase(),
  )?.key || 'pending_approval';
  const viewState = scenario === 'default' || scenario === 'active' ? 'ready' : scenario;

  const isLocationWarning = dashboard.location?.status?.toLowerCase().includes('not enabled') || dashboard.location?.status?.toLowerCase().includes('denied');
  const isSwitchDisabled = unmetConditions.length > 0 && !online;

  return (
    <div className="rider-page-shell rider-dashboard-page">
      <PageHeader title="Rider dashboard" subtitle="Ready for today's deliveries?" eyebrow="Rider overview" />
      <StateView
        state={viewState}
        emptyTitle="No dashboard data"
        emptyMessage="This preview has no rider dashboard content."
        onRetry={() => window.location.reload()}
      >
        {/* 1. Status Bar (Replaces old profile card) */}
        <section className="rider-dashboard-status-bar-section" aria-label="Rider status and driver mode">
          <Card className={`rider-status-bar ${online ? 'card--tint-green' : ''}`}>
            <CardBody className="rider-status-bar-body">
              <div className="rider-status-bar-left">
                <div className="rider-status-bar-avatar" aria-hidden="true">{profile.initials}</div>
                <div className="rider-status-bar-info">
                  <div className="rider-status-bar-name-row">
                    <span className="rider-status-bar-name">{profile.name}</span>
                    <StatusBadge status={accountStatus} config={accountStates} />
                  </div>
                  <p className="rider-status-bar-zone">{profile.zone}</p>
                </div>
              </div>
              <div className="rider-status-bar-right">
                <label className="rider-mode-control" htmlFor="rider-dashboard-mode">
                  <span className="rider-mode-label">Driver Mode</span>
                  <button
                    id="rider-dashboard-mode"
                    type="button"
                    role="switch"
                    aria-label="Driver Mode"
                    aria-checked={online}
                    disabled={isSwitchDisabled}
                    className={`rider-mode-toggle ${online ? 'is-on' : ''} ${isSwitchDisabled ? 'is-disabled' : ''}`}
                    onClick={() => {
                      if (!isSwitchDisabled) {
                        setOnline((current) => !current);
                      }
                    }}
                  >
                    <span className="rider-mode-toggle-track" aria-hidden="true" />
                    <span>{online ? 'Online' : 'Offline'}</span>
                  </button>
                </label>
                {unmetConditions.length > 0 && (
                  <small className="rider-mode-helper">
                    <span>{driverModeEligibilityNotice.message}</span>
                    <ScenarioLink to={driverModeEligibilityNotice.path} className="rider-mode-requirements-link">
                      {driverModeEligibilityNotice.linkLabel}
                    </ScenarioLink>
                  </small>
                )}
              </div>
            </CardBody>
          </Card>
        </section>

        {/* 2. KPI Row */}
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

        {/* 3. Two columns: Active Delivery (2/3) and Location Status (1/3) */}
        <section className="rider-dashboard-columns" aria-label="Current delivery and location">
          <Card className={`rider-active-delivery-card${activeDelivery ? ' card--live card--tint-orange' : ''}`}>
            <CardBody>
              <div className="rider-dashboard-section-head">
                <h2 className="rider-card-title">Active delivery</h2>
                {activeDelivery && (
                  <div className="rider-dashboard-inline-actions">
                    <Button as={ScenarioLink} to="/rider/deliveries/active" variant="secondary" size="sm">
                      Open delivery
                    </Button>
                    <Button as={ScenarioLink} to={`/rider/map?deliveryId=${encodeURIComponent(activeDelivery.id)}`} variant="secondary" size="sm">
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
                  <Button as={ScenarioLink} to="/rider/deliveries/active" variant="primary" fullWidth>
                    View active delivery
                  </Button>
                </div>
              ) : (
                <div className="rider-empty-box">
                  <span className="rider-empty-icon" aria-hidden="true">🛵</span>
                  <p className="rider-empty-title">No active delivery</p>
                  <Button as={ScenarioLink} to="/rider/deliveries" variant="secondary" size="sm">
                    Browse delivery offers
                  </Button>
                </div>
              )}
            </CardBody>
          </Card>

          <Card className="rider-location-card">
            <CardBody>
              <div className="rider-dashboard-section-head">
                <h2 className="rider-card-title">Location status</h2>
              </div>
              <div className="rider-location-status">
                <StatusBadge
                  status={dashboard.location.status}
                  tone={isLocationWarning ? 'warning' : 'neutral'}
                />
                <p className="rider-location-desc">
                  {dashboard.location.message && dashboard.location.message.toLowerCase() !== dashboard.location.status?.toLowerCase()
                    ? dashboard.location.message
                    : 'Enable GPS permission to allow accurate order tracking and dispatch.'}
                </p>
                <small className="rider-location-updated">
                  Last updated: {formatRelativeTime(dashboard.location.updatedAt)}
                </small>
                <Button as={ScenarioLink} to="/rider/map" variant="secondary" size="sm" fullWidth>
                  Map & tracking
                </Button>
              </div>
            </CardBody>
          </Card>
        </section>

        {/* 4. Recent Notifications (3 items only, compact rows) */}
        <section className="rider-dashboard-notifications-section" aria-label="Recent notifications">
          <Card className="rider-notifications-card">
            <CardBody>
              <div className="rider-dashboard-section-head">
                <h2 className="rider-card-title">Recent notifications</h2>
                <ScenarioLink to="/rider/notifications" className="rider-link-tertiary">
                  View all
                </ScenarioLink>
              </div>
              {notifications.slice(0, 3).length ? (
                <div className="rider-notifications-list">
                  {notifications.slice(0, 3).map((notice) => (
                    <article key={notice.id} className="rider-notification-compact-row">
                      {notice.unread && <span className="rider-unread-dot" aria-label="Unread" />}
                      <div className="rider-notification-content">
                        <strong className="rider-notification-title">{notice.title}</strong>
                        <p className="rider-notification-text">{notice.message}</p>
                      </div>
                      <small className="rider-notification-time">{formatRelativeTime(notice.time)}</small>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="rider-dashboard-muted">No recent notifications.</p>
              )}
            </CardBody>
          </Card>
        </section>

      </StateView>
    </div>
  );
}
