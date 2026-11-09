import { useState } from 'react';
import { Link } from 'react-router-dom';
import BrandMark from '../../components/common/BrandMark';
import Button from '../../components/common/Button';
import RiderApplicationStatus from './components/RiderApplicationStatus';
import './RiderApplicationStatusPage.css';

const STORAGE_KEY = 'salo_rider_applications';

export default function RiderApplicationStatusPage() {
  const [applicationData] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        const app = Array.isArray(parsed) ? parsed[0] : parsed;
        if (app) {
          return {
            referenceNumber: app.referenceNumber || app.id || 'SALO-RIDER-20261109-7814',
            name: app.name || (app.personal ? `${app.personal.firstName} ${app.personal.lastName}` : 'Juan Dela Cruz'),
            deliveryMethod: app.deliveryMethod || 'motorcycle',
            status: app.applicationStatus || app.status || 'Pending Review',
            submittedAt: app.submittedAt || new Date().toISOString(),
          };
        }
      }
    } catch {
      // fallback
    }
    return {
      referenceNumber: 'SALO-RIDER-20261109-7814',
      name: 'Juan Dela Cruz',
      deliveryMethod: 'motorcycle',
      status: 'Pending Review',
      submittedAt: new Date().toISOString(),
    };
  });

  const [currentStatus, setCurrentStatus] = useState(applicationData?.status || 'Pending Review');

  const handleStatusChange = (newStatus) => {
    setCurrentStatus(newStatus);
    // Update local storage so status stays synchronized
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      const parsed = stored ? JSON.parse(stored) : [];
      if (Array.isArray(parsed) && parsed.length > 0) {
        parsed[0].applicationStatus = newStatus;
        parsed[0].status = newStatus === 'Approved' ? 'Active' : newStatus === 'Rejected' ? 'Rejected' : 'Pending Verification';
        localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
      }
    } catch {
      // ignore
    }
  };

  return (
    <div className="rider-status-page">
      <header className="rider-status-header" role="banner">
        <div className="rider-status-header-inner">
          <div className="rider-status-brand">
            <BrandMark size="sm" />
            <div className="rider-status-title-group">
              <span className="rider-status-eyebrow">Fleet Onboarding</span>
              <h1 className="rider-status-page-title">Rider Application Status</h1>
            </div>
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
          <RiderApplicationStatus
            initialStatus={currentStatus}
            applicationData={applicationData}
            onStatusChange={handleStatusChange}
          />
        </div>
      </main>
    </div>
  );
}
