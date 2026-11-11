import { useState } from 'react';
import Badge from '../../../components/common/Badge';
import Button from '../../../components/common/Button';
import CustomerLayout from '../../../layouts/CustomerLayout';
import {
  CUSTOMER_INVITATION_COUNT,
  CUSTOMER_INVITATION_SAMPLES,
  TEAM_PREVIEW_STATES,
} from '../../restaurant/pages/team/teamSamples';
import './InvitationsInboxPage.css';

function PreviewState({ state, onRetry }) {
  if (state === 'Loading') return <div className="customer-invitations-state" aria-label="Loading invitations"><span className="customer-invitations-spinner" /><p>Loading invitations…</p></div>;
  if (state === 'Empty') return <div className="customer-invitations-state"><span className="customer-invitations-state-icon" aria-hidden="true">✦</span><h2>You’re all caught up</h2><p>Invitations to join a restaurant team will appear here.</p></div>;
  if (state === 'Error') return <div className="customer-invitations-state" role="alert"><span className="customer-invitations-state-icon error" aria-hidden="true">!</span><h2>Invitations couldn’t load</h2><p>This sample error state demonstrates how a retry message will appear.</p><Button variant="outline" onClick={onRetry}>Try again</Button></div>;
  return null;
}

export default function InvitationsInboxPage() {
  const [previewState, setPreviewState] = useState('Sample data');
  const [decisions, setDecisions] = useState({});
  const pendingCount = CUSTOMER_INVITATION_COUNT - Object.keys(decisions).length;
  const setPreviewSample = () => setPreviewState('Sample data');

  const decide = (invitation, response) => {
    setDecisions((current) => ({ ...current, [invitation.id]: response }));
  };

  return <CustomerLayout>
    <main className="customer-invitations-page">
      <div className="customer-invitations-preview"><span><strong>Design preview - sample data</strong><small>Presentation only · responses are not sent or saved</small></span>{import.meta.env.DEV && <label>Preview state<select value={previewState} onChange={(event) => setPreviewState(event.target.value)} aria-label="Choose invitation inbox preview state">{TEAM_PREVIEW_STATES.map((state) => <option key={state}>{state}</option>)}</select></label>}</div>
      {previewState !== 'Sample data' ? <PreviewState state={previewState} onRetry={setPreviewSample} /> : CUSTOMER_INVITATION_SAMPLES.length === 0 ? <PreviewState state="Empty" /> : <div className="customer-invitation-list" aria-live="polite">
        {CUSTOMER_INVITATION_SAMPLES.map((invitation) => {
          const decision = decisions[invitation.id];
          const isOwnership = invitation.type === 'ownership';
          return <article className={`customer-invitation-card ${isOwnership ? 'ownership' : 'staff'}`} key={invitation.id}>
            <div className="customer-invitation-card-top"><div className={`customer-invitation-mark ${isOwnership ? 'ownership' : ''}`} aria-hidden="true">{isOwnership ? '♛' : '✦'}</div><div><span className={`customer-invitation-type ${isOwnership ? 'ownership' : ''}`}>{isOwnership ? 'Ownership invitation' : 'Staff invitation'}</span><h2>{invitation.restaurant}</h2><p>Invited by <strong>{invitation.invitingOwner}</strong></p></div><Badge variant={decision ? (decision === 'Accepted' ? 'success' : 'default') : isOwnership ? 'warning' : 'info'}>{decision || 'Awaiting response'}</Badge></div>
            <div className="customer-invitation-details">
              <div><span>{isOwnership ? 'Membership' : 'Position'}</span><strong>{invitation.position}</strong></div>
              <div><span>Invitation date</span><strong>{invitation.date}</strong></div>
              <div className="customer-invitation-responsibilities"><span>{isOwnership ? 'Ownership details' : 'Requested responsibilities'}</span><div>{invitation.details.map((detail) => <span className="customer-invitation-chip" key={detail}>{detail}</span>)}</div></div>
            </div>
            {isOwnership && <div className="customer-ownership-warning" role="note"><strong>Important: co-owner access</strong><p>Accepting an ownership invitation grants full owner-level access to this restaurant. This is different from staff access.</p></div>}
            {decision ? <div className="customer-invitation-response" role="status"><span aria-hidden="true">{decision === 'Accepted' ? '✓' : '↗'}</span><p><strong>{decision} in this preview</strong><br />No invitation response was sent or saved.</p></div> : <div className="customer-invitation-actions"><Button variant="outline" onClick={() => decide(invitation, 'Declined')}>Decline</Button><Button onClick={() => decide(invitation, 'Accepted')}>{isOwnership ? 'Accept ownership invitation' : 'Accept invitation'}</Button></div>}
          </article>;
        })}
      </div>}
      {previewState === 'Sample data' && <p className="customer-invitations-count" aria-live="polite">{Math.max(0, pendingCount)} sample invitations awaiting response</p>}
    </main>
  </CustomerLayout>;
}
