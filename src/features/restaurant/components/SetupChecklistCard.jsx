import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  BUSINESS_ONBOARDING_CONTENT,
  interpolateCopy,
} from '../../../config/onboarding';
import {
  ONBOARDING_CHANGED_EVENT,
  isSetupChecklistDismissed,
  dismissSetupChecklist,
} from '../../../services/onboardingService';
import './SetupChecklistCard.css';

/**
 * Dismissible Restaurant Setup Checklist Card for the Restaurant Overview page.
 * Shows the derived setup checklist to approved owners until all applicable items
 * are complete or the owner dismisses the card.
 */
export function SetupChecklistCard({
  userId,
  restaurantId,
  isApprovedOwner = false,
  checklist,
}) {
  const [dismissed, setDismissed] = useState(() =>
    isSetupChecklistDismissed(userId, restaurantId),
  );

  useEffect(() => {
    setDismissed(isSetupChecklistDismissed(userId, restaurantId));
  }, [userId, restaurantId]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const sync = () => {
      setDismissed(isSetupChecklistDismissed(userId, restaurantId));
    };
    window.addEventListener(ONBOARDING_CHANGED_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(ONBOARDING_CHANGED_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, [userId, restaurantId]);

  if (!isApprovedOwner || !checklist || !Array.isArray(checklist.items)) {
    return null;
  }

  if (checklist.totalCount === 0 || checklist.allComplete || dismissed) {
    return null;
  }

  const cardCopy = BUSINESS_ONBOARDING_CONTENT.checklistCard;
  const progressText = interpolateCopy(cardCopy.progressTemplate, {
    completed: checklist.completedCount,
    total: checklist.totalCount,
  });
  const percent = Math.round((checklist.completedCount / checklist.totalCount) * 100);

  const handleDismiss = () => {
    dismissSetupChecklist(userId, restaurantId);
    setDismissed(true);
  };

  return (
    <section
      className="salo-owner-setup-card"
      aria-labelledby="salo-owner-setup-checklist-title"
    >
      <div className="salo-owner-setup-card__header">
        <div>
          <p className="salo-owner-setup-card__eyebrow">{cardCopy.eyebrow}</p>
          <div className="salo-owner-setup-card__title-row">
            <h2 id="salo-owner-setup-checklist-title" className="salo-owner-setup-card__title">
              {cardCopy.title}
            </h2>
            <span className="salo-owner-setup-card__progress-pill">
              {progressText}
            </span>
          </div>
          <p className="salo-owner-setup-card__subtitle">{cardCopy.subtitle}</p>
        </div>

        <button
          type="button"
          className="salo-owner-setup-card__dismiss"
          onClick={handleDismiss}
          aria-label={cardCopy.dismissAriaLabel}
        >
          <span>{cardCopy.dismissLabel}</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div
        className="salo-owner-setup-card__bar"
        role="progressbar"
        aria-label={cardCopy.title}
        aria-valuemin={0}
        aria-valuemax={checklist.totalCount}
        aria-valuenow={checklist.completedCount}
      >
        <div
          className="salo-owner-setup-card__bar-fill"
          style={{ width: `${percent}%` }}
        />
      </div>

      <ul className="salo-owner-setup-card__list">
        {checklist.items.map((item) => (
          <li
            key={item.id}
            className={`salo-owner-setup-card__item ${item.done ? 'is-done' : ''}`.trim()}
          >
            <div className="salo-owner-setup-card__item-left">
              <span
                className={`salo-owner-setup-card__check ${item.done ? 'is-done' : ''}`.trim()}
                aria-hidden="true"
              >
                {item.done ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <circle cx="12" cy="12" r="5" />
                  </svg>
                )}
              </span>
              <div className="salo-owner-setup-card__item-copy">
                <strong>{item.label}</strong>
                <span>{item.description}</span>
              </div>
            </div>

            <Link to={item.href} className="salo-owner-setup-card__link">
              <span>{item.done ? cardCopy.doneLabel : (item.ctaLabel || cardCopy.actionLabel)}</span>
              <span aria-hidden="true">→</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default SetupChecklistCard;
