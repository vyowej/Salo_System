import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import BrandMark from '../../components/common/BrandMark';
import Button from '../../components/common/Button';
import RiderApplicationStatus from './components/RiderApplicationStatus';
import applicationService, { mapBackendApplicationStatus } from '../../services/applicationService';
import './RiderApplicationStatusPage.css';

export default function RiderApplicationStatusPage() {
  const location = useLocation();
  const redirectNotice = typeof location.state?.notice === 'string' ? location.state.notice : '';
  const [applicationData, setApplicationData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const app = await applicationService.getCurrentRiderApplication();
        if (!active) return;
        if (app) {
          setApplicationData({
            id: app.rider_application_id,
            referenceNumber: app.reference_number,
            name: `${app.legal_first_name} ${app.legal_last_name}`.trim(),
            deliveryMethod: app.vehicle_type,
            status: mapBackendApplicationStatus(app.application_status),
            submittedAt: app.submitted_at,
            reviewerNote: app.reviewer_note,
            requestedDocuments: (app.document_requests || []).map((req) => ({
              id: req.request_id,
              name: req.document_name,
              reason: req.reason,
              instructions: req.instructions,
              dueDate: req.due_date,
              status: req.request_status,
            })),
            documents: app.documents || [],
          });
        } else {
          setApplicationData(null);
        }
      } catch (err) {
        if (active) setError(err?.message || 'Unable to load rider application status.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="rider-status-page">
      <header className="rider-status-header" role="banner">
        <div className="rider-status-header-inner">
          <div className="rider-status-brand">
            <BrandMark size="sm" />
          </div>

          <div className="rider-status-header-links">
            <Button as={Link} to="/become-a-rider" variant="outline" size="sm">
              Application Form
            </Button>
            <Button as={Link} to="/customer" variant="ghost" size="sm">
              Customer Dashboard
            </Button>
          </div>
        </div>
      </header>

      <main className="rider-status-content">
        <div className="rider-status-inner">
          {redirectNotice && (
            <div
              role="status"
              style={{
                marginBottom: '16px',
                padding: '12px 16px',
                borderRadius: '10px',
                background: '#eff6ff',
                border: '1px solid #bfdbfe',
                color: '#1e3a8a',
                fontSize: '14px',
                fontWeight: 600,
              }}
            >
              {redirectNotice}
            </div>
          )}
          {loading && <p>Loading application status...</p>}
          {!loading && error && <p role="alert" style={{ color: '#b91c1c' }}>{error}</p>}
          {!loading && !error && !applicationData && (
            <div style={{ textAlign: 'center', padding: '40px 16px' }}>
              <h2>No Rider Application Found</h2>
              <p>You have not submitted a rider partner application yet.</p>
              <Button as={Link} to="/become-a-rider" variant="primary" size="md">
                Start Rider Application
              </Button>
            </div>
          )}
          {!loading && !error && applicationData && (
            <RiderApplicationStatus
              initialStatus={applicationData.status}
              applicationData={applicationData}
            />
          )}
        </div>
      </main>
    </div>
  );
}
