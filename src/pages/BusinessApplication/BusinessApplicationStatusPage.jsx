import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import BrandMark from '../../components/common/BrandMark';
import Button from '../../components/common/Button';
import ApplicationStatus from './components/ApplicationStatus';
import applicationService, { mapBackendApplicationStatus } from '../../services/applicationService';
import './BusinessApplicationStatusPage.css';

export default function BusinessApplicationStatusPage() {
  const [applicationData, setApplicationData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const app = await applicationService.getCurrentRestaurantApplication();
        if (!active) return;
        if (app) {
          setApplicationData({
            id: app.restaurant_application_id,
            referenceNumber: app.reference_number,
            name: app.restaurant_name,
            status: mapBackendApplicationStatus(app.application_status),
            submittedAt: app.submitted_at,
            reviewerNote: app.reviewer_note,
            logoImage: app.logo_image || null,
            coverImage: app.cover_image || null,
            menuItems: app.menu_items || [],
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
        if (active) setError(err?.message || 'Unable to load restaurant application status.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="biz-status-page">
      <header className="biz-status-header" role="banner">
        <div className="biz-status-header-inner">
          <div className="biz-status-brand">
            <BrandMark size="sm" />
          </div>

          <div className="biz-status-header-links">
            <Button as={Link} to="/become-a-partner" variant="outline" size="sm">
              Application Form
            </Button>
            <Button as={Link} to="/customer" variant="ghost" size="sm">
              Customer Dashboard
            </Button>
          </div>
        </div>
      </header>

      <main className="biz-status-content">
        <div className="biz-status-inner">
          {loading && <p>Loading application status...</p>}
          {!loading && error && <p role="alert" style={{ color: '#b91c1c' }}>{error}</p>}
          {!loading && !error && !applicationData && (
            <div style={{ textAlign: 'center', padding: '40px 16px' }}>
              <h2>No Restaurant Application Found</h2>
              <p>You have not submitted a restaurant partner application yet.</p>
              <Button as={Link} to="/become-a-partner" variant="primary" size="md">
                Start Restaurant Application
              </Button>
            </div>
          )}
          {!loading && !error && applicationData && (
            <ApplicationStatus
              initialStatus={applicationData.status}
              applicationData={applicationData}
              onApplicationUpdated={(updatedApp) => {
                if (!updatedApp) return;
                setApplicationData({
                  id: updatedApp.restaurant_application_id,
                  referenceNumber: updatedApp.reference_number,
                  name: updatedApp.restaurant_name,
                  status: mapBackendApplicationStatus(updatedApp.application_status),
                  submittedAt: updatedApp.submitted_at,
                  reviewerNote: updatedApp.reviewer_note,
                  logoImage: updatedApp.logo_image || null,
                  coverImage: updatedApp.cover_image || null,
                  menuItems: updatedApp.menu_items || [],
                  requestedDocuments: (updatedApp.document_requests || []).map((req) => ({
                    id: req.request_id,
                    name: req.document_name,
                    reason: req.reason,
                    instructions: req.instructions,
                    dueDate: req.due_date,
                    status: req.request_status,
                  })),
                  documents: updatedApp.documents || [],
                });
              }}
            />
          )}
        </div>
      </main>
    </div>
  );
}
