import { useState } from 'react';
import Badge from '../../../components/common/Badge';
import Button from '../../../components/common/Button';
import ConfirmDialog from '../../../components/common/ConfirmDialog';
import { StateView } from '../../../components/feedback';
import CustomerLayout from '../../../layouts/CustomerLayout';
import { CUSTOMER_INVITATION_SAMPLES } from '../../restaurant/pages/team/teamSamples';
import './InvitationsInboxPage.css';

export default function InvitationsInboxPage() {
  const [decisions, setDecisions] = useState({});
  const [confirmTarget, setConfirmTarget] = useState(null);

  const invitations = CUSTOMER_INVITATION_SAMPLES;
  const pendingCount = invitations.filter((inv) => !decisions[inv.id]).length;

  const applyDecision = (invitation, response) => {
    setDecisions((current) => ({ ...current, [invitation.id]: response }));
  };

  const handleAcceptClick = (invitation) => {
    if (invitation.type === 'ownership') {
      setConfirmTarget(invitation);
      return;
    }
    applyDecision(invitation, 'Accepted');
  };

  return (
    <CustomerLayout>
      <main className="customer-invitations-page">
        {invitations.length === 0 ? (
          <StateView
            state="empty"
            title="You're all caught up"
            description="Invitations to join a restaurant team will appear here."
          />
        ) : (
          <>
            <div className="customer-invitation-list" aria-live="polite">
              {invitations.map((invitation) => {
                const decision = decisions[invitation.id];
                const isOwnership = invitation.type === 'ownership';
                const details = invitation.details || [];
                const shownDetails = details.slice(0, 3);
                const extraDetails = details.slice(3);

                return (
                  <article
                    key={invitation.id}
                    className={`customer-invitation-card ${isOwnership ? 'ownership' : 'staff'}`}
                  >
                    <div className="customer-invitation-main">
                      <div className="customer-invitation-top">
                        <div className="customer-invitation-title-group">
                          <span className={`customer-invitation-mark ${isOwnership ? 'ownership' : ''}`} aria-hidden="true">
                            {isOwnership ? (
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M2 18h20l-2-11-5 4-3-6-3 6-5-4-2 11z" />
                              </svg>
                            ) : (
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
                                <circle cx="8.5" cy="7" r="4" />
                                <line x1="20" y1="8" x2="20" y2="14" />
                                <line x1="23" y1="11" x2="17" y2="11" />
                              </svg>
                            )}
                          </span>
                          <span className={`customer-invitation-type ${isOwnership ? 'ownership' : ''}`}>
                            {isOwnership ? 'OWNERSHIP INVITATION' : 'STAFF INVITATION'}
                          </span>
                          <h2>{invitation.restaurant}</h2>
                        </div>

                        <Badge
                          variant={decision ? (decision === 'Accepted' ? 'completed' : 'default') : isOwnership ? 'upcoming' : 'info'}
                          size="sm"
                        >
                          {decision || 'Awaiting response'}
                        </Badge>
                      </div>

                      <p className="customer-invitation-meta">
                        Invited by <strong>{invitation.invitingOwner}</strong> · {invitation.position} · {invitation.date}
                      </p>

                      <div className="customer-invitation-bottom">
                        <div className="customer-invitation-chips">
                          {shownDetails.map((detail) => (
                            <span className="customer-invitation-chip" key={detail}>
                              {detail}
                            </span>
                          ))}
                          {extraDetails.length > 0 && (
                            <span
                              className="customer-invitation-chip customer-invitation-chip--more"
                              title={extraDetails.join(', ')}
                            >
                              +{extraDetails.length} more
                            </span>
                          )}
                        </div>

                        {!decision && (
                          <div className="customer-invitation-actions">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => applyDecision(invitation, 'Declined')}
                            >
                              Decline
                            </Button>
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => handleAcceptClick(invitation)}
                            >
                              Accept invitation
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
            <p className="customer-invitations-count" aria-live="polite">
              {pendingCount} {pendingCount === 1 ? 'invitation' : 'invitations'} awaiting response
            </p>
          </>
        )}
      </main>

      <ConfirmDialog
        open={Boolean(confirmTarget)}
        title="Accept ownership invitation?"
        message={confirmTarget ? `Accepting co-owner access for ${confirmTarget.restaurant} grants full owner-level permissions, distinct from staff access.` : ''}
        confirmLabel="Accept ownership"
        cancelLabel="Cancel"
        onClose={() => setConfirmTarget(null)}
        onConfirm={() => {
          if (confirmTarget) {
            applyDecision(confirmTarget, 'Accepted');
          }
          setConfirmTarget(null);
        }}
      />
    </CustomerLayout>
  );
}
