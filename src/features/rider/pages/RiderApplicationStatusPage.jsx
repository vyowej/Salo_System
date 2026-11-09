import { useLocation } from 'react-router-dom';
import Button from '../../../components/common/Button';
import { Card, CardBody } from '../../../components/common/Card';
import PageHeader from '../components/PageHeader';
import StateView from '../components/StateView';
import StatusBadge from '../components/StatusBadge';
import Timeline from '../components/Timeline';
import { riderMockData } from '../mocks';
import useScenario from '../hooks/useScenario';
import { applicationStatuses, accountStates } from '../constants/statusConfig';
import './RiderApplicationPage.css';

export default function RiderApplicationStatusPage() {
  const scenario = useScenario();
  const { pathname } = useLocation();
  const isAccountState = pathname === '/rider/account' || pathname === '/rider/account-status' || pathname === '/rider/activate';
  const currentStatus = riderMockData.profile.applicationStatus || 'under_review';
  const currentAccount = riderMockData.profile.accountStatus || 'active';

  const timelineItems = riderMockData.application.statuses.map((item) => ({
    label: item.status,
    time: item.date,
    note: item.note,
  }));

  return (
    <div className="rider-page-shell">
      <PageHeader
        title={isAccountState ? 'Account status' : 'Application status'}
        subtitle={riderMockData.previewCopy.notConnected}
        eyebrow={isAccountState ? 'Account overview' : 'Onboarding'}
      />

      <StateView state={scenario === 'default' ? 'ready' : scenario} emptyTitle="Status preview unavailable" emptyMessage="No rider status information is available in this preview." onRetry={() => window.location.reload()}>
        {isAccountState ? (
          <div className="rider-account-status-layout">
            {accountStates.map((item) => (
              <Card key={item.key} className={item.key === currentAccount ? 'rider-account-panel active' : 'rider-account-panel'}>
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
            <Card>
              <CardBody>
                <div className="rider-status-summary">
                  <div>
                    <h3>Current application status</h3>
                    <p>{riderMockData.profile.email}</p>
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
                <Button variant="outline" as="a" href="/rider/application">Review application</Button>
              </CardBody>
            </Card>
          </div>
        )}
      </StateView>
    </div>
  );
}
