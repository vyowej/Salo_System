import { evaluatePasswordPolicy } from '../../utils/passwordPolicy';
import './PasswordStrengthMeter.css';

export default function PasswordStrengthMeter({ password = '', username = '', email = '' }) {
  const { checks, strengthLabel, strengthLevel } = evaluatePasswordPolicy(password, { username, email });

  if (!password) {
    return (
      <div className="pw-meter" aria-live="polite">
        <ul className="pw-meter__checklist">
          {checks.map((item) => (
            <li key={item.key} className="pw-meter__item">
              <span className="pw-meter__dot" aria-hidden="true">○</span>
              <span>{item.label}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="pw-meter" aria-live="polite">
      <div className="pw-meter__bar-row">
        <div className="pw-meter__segments" aria-label={`Password strength: ${strengthLabel}`}>
          {[1, 2, 3, 4].map((seg) => (
            <span
              key={seg}
              className={`pw-meter__seg ${strengthLevel >= seg ? `is-level-${strengthLevel}` : ''}`}
            />
          ))}
        </div>
        <span className={`pw-meter__label is-level-${strengthLevel}`}>{strengthLabel}</span>
      </div>
      <ul className="pw-meter__checklist">
        {checks.map((item) => (
          <li key={item.key} className={`pw-meter__item ${item.passed ? 'is-passed' : 'is-pending'}`}>
            <span className="pw-meter__dot" aria-hidden="true">{item.passed ? '✓' : '○'}</span>
            <span>{item.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
