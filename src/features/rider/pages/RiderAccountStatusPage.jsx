import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Button from '../../../components/common/Button';
import { StateView as GlobalStateView } from '../../../components/feedback';
import PageHeader from '../components/PageHeader';
import applicationService, { mapBackendApplicationStatus } from '../../../services/applicationService';

export default function RiderAccountStatusPage() {
  const [application, setApplication] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const app = await applicationService.getCurrentRiderApplication();
        if (active) setApplication(app);
      } catch (err) {
        if (active) setError(err?.message || 'Unable to load rider application status.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  return (
    <div className="rider-page-shell">
      <PageHeader title="Account status" subtitle="Your rider application and verification status." eyebrow="Account" />
      {loading ? (
        <GlobalStateView state="loading" title="Loading status..." />
      ) : error ? (
        <GlobalStateView state="error" title="Could not load status" description={error} />
      ) : !application ? (
        <GlobalStateView
          state="empty"
          title="No rider application found"
          description="Apply to become a SALO delivery rider to view your application status."
          action={<Link to="/become-a-rider"><Button variant="primary" size="sm">Apply now</Button></Link>}
        />
      ) : (
        <div className="rider-stack">
          <p><strong>Status:</strong> {mapBackendApplicationStatus(application.application_status)}</p>
          {application.reviewer_note && <p><strong>Reviewer note:</strong> {application.reviewer_note}</p>}
          <Link to="/rider-application/status"><Button variant="secondary" size="sm">View full status</Button></Link>
        </div>
      )}
    </div>
  );
}
