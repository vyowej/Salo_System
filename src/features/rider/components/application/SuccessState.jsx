import Button from '../../../../components/common/Button';
import { Card, CardBody } from '../../../../components/common/Card';
import StatusBadge from '../StatusBadge';
import ScenarioLink from '../ScenarioLink';
import { applicationStatuses } from '../../constants/statusConfig';
import './SuccessState.css';

export default function SuccessState() {
  return (
    <Card className="rider-application-result">
      <CardBody className="rider-application-result-body">
        <span className="rider-application-result-icon" aria-hidden="true">✓</span>
        <h2>Application submitted</h2>
        <StatusBadge status="under_review" config={applicationStatuses} />
        <p>Your application is under review and no data was submitted in this design preview.</p>
        <Button as={ScenarioLink} to="/rider/application" variant="primary">View application status</Button>
      </CardBody>
    </Card>
  );
}
