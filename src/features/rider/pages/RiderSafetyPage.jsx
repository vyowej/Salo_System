import { Card, CardBody } from '../../../components/common/Card';
import PageHeader from '../components/PageHeader';
import StateView from '../components/StateView';
import useScenario from '../hooks/useScenario';
import { safetyContent, emergencyContacts } from '../constants';
import './RiderSafetyPage.css';

export default function RiderSafetyPage() {
  const scenario = useScenario();
  const viewState = scenario === 'active' ? 'ready' : scenario;

  return (
    <div className="rider-page-shell">
      <PageHeader title="Safety & welfare" subtitle="Review practical guidance before and during your rider shift." eyebrow="Rider safety" />
      <StateView state={viewState} emptyTitle="Safety guidance unavailable" emptyMessage="Safety resources are not available in this preview." onRetry={() => window.location.reload()}>
        <div className="rider-safety-notice" role="note">
          <strong>Important</strong>
          <span>{safetyContent.notice}</span>
        </div>
        <div className="rider-safety-grid">
          <Card>
            <CardBody>
              <h2>Safety guidelines</h2>
              <div className="rider-safety-accordion">
                {safetyContent.sections.map((item) => (
                  <details key={item.title}>
                    <summary>{item.title}</summary>
                    <p>{item.body}</p>
                  </details>
                ))}
              </div>
            </CardBody>
          </Card>
          <Card>
            <CardBody>
              <h2>Shift checklist</h2>
              <ul className="rider-safety-checklist">
                {safetyContent.equipment.map((item) => <li key={item}><span aria-hidden="true">✓</span>{item}</li>)}
              </ul>
              <div className="rider-safety-reminders">
                {safetyContent.reminders.map((item) => <p key={item}>{item}</p>)}
              </div>
            </CardBody>
          </Card>
          <Card className="rider-safety-contacts">
            <CardBody>
              <h2>Emergency contacts</h2>
              <div className="rider-safety-contact-list">
                {emergencyContacts.map((item) => (
                  <div key={item.label}><strong>{item.label}</strong><a href={`tel:${item.number}`}>{item.number}</a></div>
                ))}
              </div>
            </CardBody>
          </Card>
        </div>
      </StateView>
    </div>
  );
}
