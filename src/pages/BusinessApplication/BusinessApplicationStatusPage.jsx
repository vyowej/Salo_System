import { useState } from 'react';
import { Link } from 'react-router-dom';
import BrandMark from '../../components/common/BrandMark';
import Button from '../../components/common/Button';
import ApplicationStatus from './components/ApplicationStatus';
import './BusinessApplicationStatusPage.css';

const STORAGE_KEY = 'salo_partner_applications';

export default function BusinessApplicationStatusPage() {
  const [applicationData] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.restaurant) {
          return {
            id: parsed.restaurant.id || parsed.restaurant.referenceNumber,
            referenceNumber: parsed.restaurant.referenceNumber || parsed.restaurant.id || 'SALO-APP-20261109-8421',
            name: parsed.restaurant.name || 'Barrio Fiesta Bistro',
            status: parsed.restaurant.status || 'Pending Review',
            submittedAt: parsed.restaurant.submittedAt || new Date().toISOString(),
            requestedDocuments: parsed.restaurant.requestedDocuments || [],
          };
        }
      }
    } catch {
      // fallback
    }
    return {
      id: 'SALO-APP-20261109-8421',
      referenceNumber: 'SALO-APP-20261109-8421',
      name: 'Barrio Fiesta Bistro',
      status: 'Pending Review',
      submittedAt: new Date().toISOString(),
      requestedDocuments: [],
    };
  });

  const [currentStatus, setCurrentStatus] = useState(applicationData?.status || 'Pending Review');

  const handleStatusChange = (newStatus) => {
    setCurrentStatus(newStatus);
    // Update local storage so status stays synchronized
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      const parsed = stored ? JSON.parse(stored) : {};
      parsed.restaurant = {
        ...parsed.restaurant,
        status: newStatus,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
    } catch {
      // ignore
    }
  };

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
          <ApplicationStatus
            initialStatus={currentStatus}
            applicationData={applicationData}
            onStatusChange={handleStatusChange}
          />
        </div>
      </main>
    </div>
  );
}
