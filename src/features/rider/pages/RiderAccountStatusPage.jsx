import { useMemo } from 'react';
import { Card, CardBody } from '../../../components/common/Card';
import PageHeader from '../components/PageHeader';
import StateView from '../components/StateView';
import StatusBadge from '../components/StatusBadge';
import { accountStates } from '../constants/statusConfig';
import { riderMockData } from '../mocks';
import useScenario from '../hooks/useScenario';
import './RiderAccountStatusPage.css';

export default function RiderAccountStatusPage() {
  const scenario = useScenario();
  const current = useMemo(() => riderMockData.profile.accountStatus || 'pending_approval', []);

  return (
    <div className="rider-page-shell">
      <PageHeader title="Account status" subtitle="Review the current rider account state." eyebrow="Account overview" />
      <StateView state={scenario === 'default' ? 'ready' : scenario} emptyTitle="Account status unavailable" emptyMessage="This preview has no rider account status information." onRetry={() => window.location.reload()}>
        <div className="rider-account-status-grid">
          {accountStates.map((item) => (
            <Card key={item.key} className={item.key === current ? 'rider-account-card is-current' : 'rider-account-card'}>
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
      </StateView>
    </div>
  );
}
