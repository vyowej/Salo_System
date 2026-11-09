import { Link } from 'react-router-dom';
import Button from '../../../components/common/Button';
import { Card, CardBody } from '../../../components/common/Card';
import PageHeader from '../components/PageHeader';
import StateView from '../components/StateView';
import StatusBadge from '../components/StatusBadge';
import StatCard from '../components/StatCard';
import EligibilityChecklist from '../components/EligibilityChecklist';
import { applicationStatuses, availabilityStatuses, statusConfig } from '../constants/statusConfig';
import { eligibilityConditions } from '../constants/eligibilityConditions';
import { riderMockData } from '../mocks';
import useScenario from '../hooks/useScenario';
import './RiderDashboardPage.css';

export default function RiderDashboardPage() {
  const scenario = useScenario();
  const dashboard = riderMockData.dashboard;
  const notifications = riderMockData.notifications;
  const currentState = dashboard.availability;

  return (
    <div className="rider-page-shell">
      <PageHeader title="Rider dashboard" subtitle="Today at a glance" eyebrow="Rider overview" />
      <StateView state={scenario === 'default' ? 'ready' : scenario} emptyTitle="No dashboard data" emptyMessage="This preview has no rider dashboard content." onRetry={() => window.location.reload()}>
        <div className="rider-dashboard-grid">
          <Card className="rider-dashboard-profile">
            <CardBody className="rider-dashboard-profile-body">
              <div className="rider-profile-summary">
                <div className="rider-avatar-round">{riderMockData.profile.initials}</div>
                <div>
                  <h2>{riderMockData.profile.name}</h2>
                  <StatusBadge status={riderMockData.profile.accountStatus} config={applicationStatuses} />
                </div>
              </div>

              <div className="rider-profile-meta">
                <span>{riderMockData.profile.zone}</span>
                <StatusBadge status={currentState} config={availabilityStatuses} />
              </div>

              <div className="rider-toggle-row">
                <span>Driver Mode</span>
                <button type="button" className={`rider-mode-toggle ${currentState === 'online_available' ? 'is-on' : ''}`}>
                  {currentState === 'online_available' ? 'On' : 'Off'}
                </button>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <div className="rider-dashboard-section-head">
                <h3>Current shift</h3>
                <Button as={Link} to="/rider/schedule" variant="outline" size="sm">View schedule</Button>
              </div>
              <div className="rider-sub-card-meta">
                <strong>{dashboard.shift.date}</strong>
                <StatusBadge status={dashboard.shift.status || 'upcoming'} config={statusConfig.shiftStatuses} />
              </div>
              <p>{dashboard.shift.start} – {dashboard.shift.end}</p>
            </CardBody>
          </Card>
        </div>

        <div className="rider-stats-grid">
          {dashboard.metrics.map((metric, index) => (
            <StatCard
              key={metric.label}
              label={metric.label}
              value={metric.value}
              helper={metric.detail}
              icon={['◔', '◍', '◌'][index % 3]}
              tone={index === 0 ? 'info' : index === 1 ? 'success' : 'warning'}
            />
          ))}
        </div>

        <div className="rider-dashboard-columns">
          <Card>
            <CardBody>
              <div className="rider-dashboard-section-head">
                <h3>Active delivery</h3>
                <Button as={Link} to="/rider/deliveries" variant="outline" size="sm">View offers</Button>
              </div>
              <div className="rider-empty-box">
                <span aria-hidden="true">⌁</span>
                <strong>No active delivery</strong>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <div className="rider-dashboard-section-head">
                <h3>Location status</h3>
              </div>
              <p>{dashboard.location.status}</p>
              <small>{dashboard.location.updatedAt}</small>
            </CardBody>
          </Card>
        </div>

        <div className="rider-dashboard-columns">
          <Card>
            <CardBody>
              <div className="rider-dashboard-section-head">
                <h3>Recent notifications</h3>
                <Button as={Link} to="/rider/notifications" variant="outline" size="sm">View all</Button>
              </div>
              <div className="rider-list-stack">
                {notifications.slice(0, 3).map((notice) => (
                  <div key={notice.id} className="rider-mini-list-row">
                    <div>
                      <strong>{notice.title}</strong>
                      <p>{notice.message}</p>
                    </div>
                    <small>{notice.time}</small>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <div className="rider-dashboard-section-head">
                <h3>Quick actions</h3>
              </div>
              <div className="rider-inline-actions">
                <Button as={Link} to="/rider/go-online" variant="primary" size="sm">Go online</Button>
                <Button as={Link} to="/rider/deliveries" variant="outline" size="sm">View offers</Button>
                <Button as={Link} to="/rider/earnings" variant="outline" size="sm">Earnings</Button>
                <Button as={Link} to="/rider/support" variant="outline" size="sm">Support</Button>
              </div>
            </CardBody>
          </Card>
        </div>

        <Card>
          <CardBody>
            <div className="rider-dashboard-section-head">
              <h3>Go online checklist</h3>
            </div>
            <EligibilityChecklist conditions={eligibilityConditions} />
          </CardBody>
        </Card>
      </StateView>
    </div>
  );
}
