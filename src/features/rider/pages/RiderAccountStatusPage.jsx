import { useMemo } from 'react';
import { Card, CardBody } from '../../../components/common/Card';
import PageHeader from '../components/PageHeader';
import StateView from '../components/StateView';
import StatusBadge from '../components/StatusBadge';
import Button from '../../../components/common/Button';
import ScenarioLink from '../components/ScenarioLink';
import { accountStates } from '../constants/statusConfig';
import { getRiderMock } from '../mocks';
import useScenario from '../hooks/useScenario';
import './RiderAccountStatusPage.css';

function accountStatusCardClass(status) {
  const tone = {
    pending_approval: 'orange',
    awaiting_activation: 'gold',
    active: 'green',
    suspended: 'danger',
    deactivated: 'brown',
  }[status] || '';
  const tintClass = tone && tone !== 'danger' ? ` card--tint-${tone}` : '';
  return `rider-account-card${tintClass}${tone === 'danger' ? ' card--danger' : ''}`;
}

export default function RiderAccountStatusPage() {
  const scenario = useScenario();
  const profile = getRiderMock('riderProfile', scenario);
  const current = useMemo(() => accountStates.find(
    (status) => status.key === profile.accountStatus || status.label.toLowerCase() === profile.accountStatus.toLowerCase(),
  )?.key || 'pending_approval', [profile.accountStatus]);

  return (
    <div className="rider-page-shell">
      <PageHeader title="Account status" subtitle="Review the current rider account state." eyebrow="Account overview" />
      <StateView state={scenario === 'default' ? 'ready' : scenario} emptyTitle="Account status unavailable" emptyMessage="This preview has no rider account status information." onRetry={() => window.location.reload()}>
        <div className="rider-account-status-grid">
          {accountStates.map((item) => (
            <Card key={item.key} className={`${accountStatusCardClass(item.key)}${item.key === current ? ' is-current' : ''}`}>
              <CardBody className="rider-account-card-body">
                <div className="rider-account-header">
                  <span className="rider-account-icon" aria-hidden="true">{item.key === 'active' ? '✓' : item.key === 'suspended' ? '!' : '•'}</span>
                  <h3>{item.label}</h3>
                </div>
                <StatusBadge status={item.key} config={accountStates} />
                <p>{item.label === 'Active' ? 'Your rider account is active and ready for dispatch.' : 'This preview state explains the current rider account status.'}</p>
              </CardBody>
            </Card>
          ))}
        </div>
        <div className="rider-account-status-actions">
          <Button as={ScenarioLink} to="/rider/activate" variant="primary">Go to account activation</Button>
          <Button as={ScenarioLink} to="/rider/application" variant="secondary">View application status</Button>
        </div>
      </StateView>
    </div>
  );
}
