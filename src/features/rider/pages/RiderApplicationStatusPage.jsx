import { useLocation } from 'react-router-dom';
import Button from '../../../components/common/Button';
import { Card, CardBody } from '../../../components/common/Card';
import PageHeader from '../components/PageHeader';
import StateView from '../components/StateView';
import StatusBadge from '../components/StatusBadge';
import Timeline from '../components/Timeline';
import ScenarioLink from '../components/ScenarioLink';
import { getRiderMock } from '../mocks';
import useScenario from '../hooks/useScenario';
import { applicationStatuses, accountStates } from '../constants/statusConfig';
import './RiderApplicationPage.css';

function statusCardClass(status) {
  if (['approved', 'active'].includes(status)) return 'card--tint-green';
  if (['rejected', 'suspended'].includes(status)) return 'card--danger';
  if (['draft', 'submitted', 'under_review', 'requires_info', 'pending_approval', 'awaiting_activation'].includes(status)) {
    return 'card--tint-gold';
  }
  return '';
}

export default function RiderApplicationStatusPage() {
  const scenario = useScenario();
  const { pathname } = useLocation();
  const profile = getRiderMock('riderProfile', scenario);
  const application = getRiderMock('application', scenario);
  const isAccountState = pathname === '/rider/account' || pathname === '/rider/account-status' || pathname === '/rider/activate';
  const currentStatus = profile.applicationStatus || 'under_review';
  const currentAccount = accountStates.find(
    (status) => status.key === profile.accountStatus || status.label.toLowerCase() === profile.accountStatus.toLowerCase(),
  )?.key || 'pending_approval';

  const timelineItems = application.statuses;

  return (
    <div className="rider-page-shell">
      <PageHeader
        title={isAccountState ? 'Account status' : 'Application status'}
        subtitle="Review your application progress and next account steps."
        eyebrow={isAccountState ? 'Account overview' : 'Onboarding'}
      />

      <StateView state={scenario === 'default' ? 'ready' : scenario} emptyTitle="Status preview unavailable" emptyMessage="No rider status information is available in this preview." onRetry={() => window.location.reload()}>
        {isAccountState ? (
          <div className="rider-account-status-layout">
            {accountStates.map((item) => (
              <Card key={item.key} className={`rider-account-panel ${statusCardClass(item.key)}${item.key === currentAccount ? ' active' : ''}`}>
                <CardBody>
                  <div className="rider-account-panel-top">
                    <h3>{item.label}</h3>
                    <StatusBadge status={item.key} config={accountStates} />
                  </div>
                  <p>{item.label === 'Active' ? 'Your rider account is ready for active dispatch.' : 'This mock state reflects a rider account preview.'}</p>
                </CardBody>
              </Card>
            ))}
          </div>
        ) : (
          <div className="rider-status-grid">
            <Card className={statusCardClass(currentStatus)}>
              <CardBody>
                <div className="rider-status-summary">
                  <div>
                    <h3>Current application status</h3>
                    <p>{profile.email}</p>
                  </div>
                  <StatusBadge status={currentStatus} config={applicationStatuses} />
                </div>
                <Timeline items={timelineItems} />
              </CardBody>
            </Card>

            <Card>
              <CardBody>
                <h3>Account state</h3>
                <div className="rider-status-stack">
                  {accountStates.map((item) => (
                    <div key={item.key} className="rider-status-row">
                      <StatusBadge status={item.key} config={accountStates} />
                      <span>{item.label}</span>
                    </div>
                  ))}
                </div>
                <div className="rider-status-actions">
                  <Button variant="secondary" as={ScenarioLink} to="/rider/application-form">Start or continue application</Button>
                  <Button variant="secondary" as={ScenarioLink} to="/rider/activate">Activate account</Button>
                  <Button variant="secondary" as={ScenarioLink} to="/rider/account-status">View account status</Button>
                </div>
              </CardBody>
            </Card>
          </div>
        )}
      </StateView>
    </div>
  );
}
