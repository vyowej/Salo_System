import { Link } from 'react-router-dom';
import Button from '../../../components/common/Button';
import { Card, CardBody } from '../../../components/common/Card';
import PageHeader from '../components/PageHeader';
import StateView from '../components/StateView';
import StatusBadge from '../components/StatusBadge';
import EligibilityChecklist from '../components/EligibilityChecklist';
import { availabilityStatuses } from '../constants/statusConfig';
import { eligibilityConditions } from '../constants/eligibilityConditions';
import useScenario from '../hooks/useScenario';
import './RiderGoOnlinePage.css';

export default function RiderGoOnlinePage() {
  const scenario = useScenario();

  return (
    <div className="rider-page-shell">
      <PageHeader title="Go online" subtitle="Confirm rider eligibility before taking delivery offers." eyebrow="Availability" />
      <StateView state={scenario === 'default' ? 'ready' : scenario} emptyTitle="No availability data" emptyMessage="No driver-mode eligibility details are available in this preview." onRetry={() => window.location.reload()}>
        <Card>
          <CardBody className="rider-go-online-body">
            <div className="rider-go-online-header">
              <div>
                <h2>Driver Mode</h2>
                <p>Availability depends on account status, active shift, and safe location access.</p>
              </div>
              <StatusBadge status="online_available" config={availabilityStatuses} />
            </div>

            <EligibilityChecklist conditions={eligibilityConditions} />

            <div className="rider-go-online-legend">
              {availabilityStatuses.map((item) => (
                <StatusBadge key={item.key} status={item.key} config={availabilityStatuses} />
              ))}
            </div>

            <div className="rider-go-online-actions">
              <Button variant="primary" as={Link} to="/rider/deliveries">Activate Driver Mode</Button>
              <Button variant="outline" as={Link} to="/rider">Back to dashboard</Button>
            </div>
          </CardBody>
        </Card>
      </StateView>
    </div>
  );
}
