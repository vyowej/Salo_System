import { useState } from 'react';
import Button from '../../../components/common/Button';
import Modal from '../../../components/common/Modal';
import { Card, CardBody } from '../../../components/common/Card';
import PageHeader from '../components/PageHeader';
import StateView from '../components/StateView';
import StatusBadge from '../components/StatusBadge';
import ScenarioLink from '../components/ScenarioLink';
import { applicationStatuses, documentStatuses } from '../constants/statusConfig';
import { profileChangeReasons } from '../constants/riderSettings';
import useScenario from '../hooks/useScenario';
import { getRiderMock } from '../mocks';
import './RiderProfilePage.css';

export default function RiderProfilePage() {
  const scenario = useScenario();
  const profile = getRiderMock('riderProfile', scenario);
  const [modalOpen, setModalOpen] = useState(false);
  const [reason, setReason] = useState(profileChangeReasons[0]);
  const [details, setDetails] = useState('');
  const [pendingReview, setPendingReview] = useState(false);
  const viewState = scenario === 'active' ? 'ready' : scenario;

  function submitChange(event) {
    event.preventDefault();
    setPendingReview(true);
    setModalOpen(false);
  }

  return (
    <div className="rider-page-shell">
      <PageHeader
        title="Rider profile"
        subtitle="Review the account details, vehicle information, and submitted documents on file."
        eyebrow="Your account"
        actions={<Button variant="outline" size="sm" onClick={() => setModalOpen(true)}>Request change</Button>}
      />
      <StateView state={viewState} emptyTitle="Profile not available" emptyMessage="Rider profile details are not available in this preview." onRetry={() => window.location.reload()}>
        <div className="rider-profile-account-links">
          <Button as={ScenarioLink} to="/rider/activate" variant="outline">Account activation</Button>
          <Button as={ScenarioLink} to="/rider/account-status" variant="outline">Account status</Button>
        </div>
        {pendingReview && <div className="rider-profile-pending" role="status"><strong>Pending review</strong><span>Your change request has been added to this local preview.</span></div>}
        <div className="rider-profile-layout">
          <Card>
            <CardBody>
              <div className="rider-profile-identity">
                {profile.photo ? <img src={profile.photo} alt={`${profile.name} profile`} /> : <div className="rider-profile-avatar" aria-label={`${profile.name} photo placeholder`}>{profile.initials}</div>}
                <div>
                  <h2>{profile.name}</h2>
                  <p>{profile.zone}</p>
                  <StatusBadge status={profile.verificationStatus} config={applicationStatuses} />
                </div>
              </div>
              <dl className="rider-profile-fields">
                <div><dt>Email</dt><dd>{profile.email}</dd></div>
                <div><dt>Contact number</dt><dd>{profile.phone}</dd></div>
                <div><dt>Residential address</dt><dd>{profile.address}</dd></div>
                <div><dt>Account status</dt><dd>{profile.accountStatus}</dd></div>
              </dl>
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <h2>Vehicle</h2>
              <dl className="rider-profile-fields">
                <div><dt>Type</dt><dd>{profile.vehicleType}</dd></div>
                <div><dt>Vehicle</dt><dd>{profile.vehicle}</dd></div>
                <div><dt>Plate number</dt><dd>{profile.plate}</dd></div>
                <div><dt>Operating zone</dt><dd>{profile.zone}</dd></div>
              </dl>
            </CardBody>
          </Card>

          <Card className="rider-profile-documents">
            <CardBody>
              <h2>Documents</h2>
              <div className="rider-profile-document-list">
                {profile.documents.map((document) => (
                  <div className="rider-profile-document-row" key={document.key}>
                    <div><strong>{document.label}</strong><span>{document.reference}</span></div>
                    <StatusBadge status={document.status} config={documentStatuses} />
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <h2>Emergency contact</h2>
              <dl className="rider-profile-fields">
                <div><dt>Name</dt><dd>{profile.emergencyContact.name}</dd></div>
                <div><dt>Relationship</dt><dd>{profile.emergencyContact.relationship}</dd></div>
                <div><dt>Contact</dt><dd>{profile.emergencyContact.phone}</dd></div>
              </dl>
            </CardBody>
          </Card>
        </div>
      </StateView>
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Request a profile change">
        <form className="rider-profile-change-form" onSubmit={submitChange}>
          <label className="rider-field" htmlFor="rider-profile-change-reason">What needs to change?</label>
          <select id="rider-profile-change-reason" value={reason} onChange={(event) => setReason(event.target.value)}>
            {profileChangeReasons.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <label className="rider-field" htmlFor="rider-profile-change-details">Details</label>
          <textarea id="rider-profile-change-details" value={details} onChange={(event) => setDetails(event.target.value)} rows="4" placeholder="Describe the requested update." required />
          <Button type="submit" variant="primary" disabled={!details.trim()}>Submit request</Button>
        </form>
      </Modal>
    </div>
  );
}
