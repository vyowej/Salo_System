import { useState } from 'react';
import './StarRating.css';

const RATING_LABELS = {
  1: 'Poor',
  2: 'Fair',
  3: 'Good',
  4: 'Very Good',
  5: 'Excellent',
};

export default function StarRating({
  value = 0,
  onChange,
  readOnly = false,
  size = 'md',
  showLabel = false,
  ariaLabel = 'Rating',
}) {
  const [hovered, setHovered] = useState(0);
  const displayValue = !readOnly && hovered > 0 ? hovered : Number(value) || 0;

  if (readOnly) {
    return (
      <span
        className={`salo-stars salo-stars--readonly salo-stars--${size}`}
        aria-label={`${displayValue} out of 5 stars`}
      >
        {[1, 2, 3, 4, 5].map((star) => (
          <span
            key={star}
            className={`salo-stars__icon${star <= Math.round(displayValue) ? ' is-filled' : ''}`}
            aria-hidden="true"
          >
            ★
          </span>
        ))}
        {showLabel && displayValue > 0 && (
          <span className="salo-stars__label">{displayValue.toFixed(1)}</span>
        )}
      </span>
    );
  }

  return (
    <div className={`salo-stars salo-stars--interactive salo-stars--${size}`} role="radiogroup" aria-label={ariaLabel}>
      <div className="salo-stars__buttons" onMouseLeave={() => setHovered(0)}>
        {[1, 2, 3, 4, 5].map((star) => {
          const active = star <= displayValue;
          return (
            <button
              key={star}
              type="button"
              role="radio"
              aria-checked={Number(value) === star}
              aria-label={`${star} ${star === 1 ? 'star' : 'stars'} — ${RATING_LABELS[star]}`}
              className={`salo-stars__btn${active ? ' is-filled' : ''}`}
              onMouseEnter={() => setHovered(star)}
              onClick={() => onChange?.(star)}
            >
              ★
            </button>
          );
        })}
      </div>
      {showLabel && (
        <span className="salo-stars__label">
          {displayValue > 0 ? `${displayValue}/5 · ${RATING_LABELS[displayValue]}` : 'Select a rating'}
        </span>
      )}
    </div>
  );
}
