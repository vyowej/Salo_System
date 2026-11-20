import { Link } from 'react-router-dom';
import Button from '../common/Button';
import { SHARED_ONBOARDING_CONTENT } from '../../config/onboarding';

function ChecklistStatusDot({ done }) {
  return (
    <span
      className={`salo-onboarding-status-dot ${done ? 'is-done' : ''}`.trim()}
      aria-hidden="true"
    >
      {done ? (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <circle cx="12" cy="12" r="5" />
        </svg>
      )}
    </span>
  );
}

export function OnboardingRiderChecklist({
  items,
  locationRequirements,
  requestingLocation,
  onRequestLocation,
}) {
  return (
    <ul className="salo-onboarding-checklist">
      {items.map((item) => (
        <li
          key={item.id}
          className={`salo-onboarding-checklist-item ${item.done ? 'is-done' : ''}`.trim()}
        >
          <div className="salo-onboarding-checklist-main">
            <ChecklistStatusDot done={item.done} />
            <div className="salo-onboarding-checklist-text">
              <strong>{item.label}</strong>
              <span>{item.detail}</span>
            </div>
          </div>

          {item.isLocationAction && item.permissionState !== 'unsupported' && (
            <Button
              type="button"
              variant={item.done ? 'secondary' : 'outline'}
              size="sm"
              disabled={item.done || requestingLocation}
              onClick={onRequestLocation}
            >
              {requestingLocation
                ? locationRequirements.requestingLabel
                : item.done
                  ? locationRequirements.grantedButtonLabel
                  : locationRequirements.requestButtonLabel}
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}

export function OnboardingBusinessChecklist({ items, onItemNavigate }) {
  return (
    <ul className="salo-onboarding-checklist">
      {items.map((item) => (
        <li
          key={item.id}
          className={`salo-onboarding-checklist-item ${item.done ? 'is-done' : ''}`.trim()}
        >
          <div className="salo-onboarding-checklist-main">
            <ChecklistStatusDot done={item.done} />
            <div className="salo-onboarding-checklist-text">
              <strong>{item.label}</strong>
              <span>{item.description}</span>
            </div>
          </div>

          <Link
            to={item.href}
            className="salo-onboarding-checklist-link"
            onClick={onItemNavigate}
          >
            <span>
              {item.done
                ? SHARED_ONBOARDING_CONTENT.statusLabels.completed
                : item.ctaLabel}
            </span>
            <span aria-hidden="true">→</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
