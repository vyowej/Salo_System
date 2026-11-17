import { Link } from 'react-router-dom';
import Button from '../../../components/common/Button';
import { StateView as GlobalStateView } from '../../../components/feedback';
import PageHeader from '../components/PageHeader';

export default function RiderActivationPage() {
  return (
    <div className="rider-page-shell">
      <PageHeader title="Account activation" subtitle="Rider account activation steps." eyebrow="Account" />
      <GlobalStateView
        state="empty"
        title="Activation checklist is not available yet"
        description="Your rider account status can be viewed on your profile or application status page."
        action={<Link to="/rider/account-status"><Button variant="secondary" size="sm">Check account status</Button></Link>}
      />
    </div>
  );
}
