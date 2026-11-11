import { useState } from 'react';
import Button from '../../../components/common/Button';
import Modal from '../../../components/common/Modal';
import { Card, CardBody } from '../../../components/common/Card';
import PageHeader from '../components/PageHeader';
import StateView from '../components/StateView';
import useScenario from '../hooks/useScenario';
import { settingsSections, notificationPreferences, riderAgreementSections, updateRecordValue } from '../constants/riderSettings';
import { getRiderMock } from '../mocks';
import './RiderSettingsPage.css';

export default function RiderSettingsPage() {
  const scenario = useScenario();
  const profile = getRiderMock('riderProfile', scenario);
  const [section, setSection] = useState(settingsSections[0].key);
  const [preferences, setPreferences] = useState({});
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [logoutConfirmed, setLogoutConfirmed] = useState(false);
  const [passwordUpdated, setPasswordUpdated] = useState(false);
  const viewState = scenario === 'active' ? 'ready' : scenario;

  function togglePreference(key, checked) {
    setPreferences((current) => updateRecordValue(current, key, checked));
  }

  function updatePassword(event) {
    event.preventDefault();
    setPasswordUpdated(true);
  }

  return (
    <div className="rider-page-shell">
      <PageHeader title="Rider settings" subtitle="Manage communication, security, location guidance, and account information." eyebrow="Preferences" />
      <StateView state={viewState} emptyTitle="Settings unavailable" emptyMessage="Rider settings are not available in this preview." onRetry={() => window.location.reload()}>
        <div className="rider-settings-layout">
          <nav className="rider-settings-nav" aria-label="Settings sections">
            {settingsSections.map((item) => (
              <button type="button" className={section === item.key ? 'is-selected' : ''} key={item.key} onClick={() => setSection(item.key)} aria-current={section === item.key ? 'page' : undefined}>
                {item.label}
              </button>
            ))}
            <Button variant="danger-outline" onClick={() => setLogoutOpen(true)}>Log out</Button>
          </nav>
          <Card className="rider-settings-content">
            <CardBody>
              {section === 'notifications' && (
                <>
                  <h2>Notification preferences</h2>
                  <div className="rider-setting-toggle-list">
                    {notificationPreferences.map((item) => (
                      <label className="rider-setting-toggle" htmlFor={`rider-setting-${item.key}`} key={item.key}>
                        <span><strong>{item.label}</strong><small>{item.detail}</small></span>
                        <input id={`rider-setting-${item.key}`} type="checkbox" checked={preferences[item.key] ?? true} onChange={(event) => togglePreference(item.key, event.target.checked)} />
                      </label>
                    ))}
                  </div>
                </>
              )}
              {section === 'security' && (
                <>
                  <h2>Password & security</h2>
                  <form className="rider-settings-password-form" onSubmit={updatePassword}>
                    <label className="rider-field" htmlFor="rider-current-password">Current password</label>
                    <input id="rider-current-password" type="password" autoComplete="current-password" required />
                    <label className="rider-field" htmlFor="rider-new-password">New password</label>
                    <input id="rider-new-password" type="password" autoComplete="new-password" required />
                    <label className="rider-field" htmlFor="rider-confirm-password">Confirm new password</label>
                    <input id="rider-confirm-password" type="password" autoComplete="new-password" required />
                    <Button type="submit" variant="primary">Update password preview</Button>
                    {passwordUpdated && <p role="status">Password update preview submitted. No credentials were changed.</p>}
                  </form>
                </>
              )}
              {section === 'location' && (
                <>
                  <h2>Location guidance</h2>
                  <div className="rider-settings-info">
                    <strong>Location permission: {profile.locationStatus}</strong>
                    <p>Location access supports route preview and delivery context. Review your device permissions before a shift.</p>
                    <p>Only use the app while safely stopped.</p>
                  </div>
                </>
              )}
              {section === 'privacy' && (
                <>
                  <h2>Privacy</h2>
                  <div className="rider-settings-info">
                    <p>Use customer and delivery details only for the assigned delivery. Avoid sharing personal or order information outside the delivery workflow.</p>
                    <p>Contact Rider Support if you need help with account information or privacy concerns.</p>
                  </div>
                </>
              )}
              {section === 'terms' && (
                <>
                  <h2>Terms & rider agreement</h2>
                  <div className="rider-agreement-scroll" tabIndex="0">
                    {riderAgreementSections.map((item) => (
                      <section key={item.title}><h3>{item.title}</h3><p>{item.body}</p></section>
                    ))}
                    <p className="rider-agreement-disclaimer">Design preview only. Approved rider agreement copy must be supplied before release.</p>
                  </div>
                </>
              )}
            </CardBody>
          </Card>
        </div>
      </StateView>
      <Modal open={logoutOpen} onClose={() => setLogoutOpen(false)} title="Log out of the rider preview?">
        <div className="rider-logout-modal">
          <p>Confirm the sign-out preview for this rider account.</p>
          <div>
            <Button variant="secondary" onClick={() => setLogoutOpen(false)}>Cancel</Button>
            <Button variant="danger" onClick={() => { setLogoutConfirmed(true); setLogoutOpen(false); }}>Confirm log out</Button>
          </div>
          {logoutConfirmed && <p role="status">Sign-out preview confirmed. No authentication state was changed.</p>}
        </div>
      </Modal>
    </div>
  );
}
