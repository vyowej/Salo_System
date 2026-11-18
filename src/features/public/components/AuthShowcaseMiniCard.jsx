import { useEffect, useState } from 'react';

function ChipIcon({ type }) {
  switch (type) {
    case 'cart':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="9" cy="21" r="1" />
          <circle cx="20" cy="21" r="1" />
          <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
        </svg>
      );
    case 'table':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      );
    case 'delivery':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="5.5" cy="17.5" r="2.5" />
          <circle cx="18.5" cy="17.5" r="2.5" />
          <path d="M15 6h4l3 5v6.5h-1" />
          <path d="M12 17.5H8v-11h7v11Z" />
        </svg>
      );
    case 'cod':
    default:
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="2" y="6" width="20" height="12" rx="2" />
          <circle cx="12" cy="12" r="2.5" />
          <path d="M6 12h.01M18 12h.01" />
        </svg>
      );
  }
}

function useCartTotalCountUp(targetTotal, reducedMotion) {
  const [displayTotal, setDisplayTotal] = useState(targetTotal);

  useEffect(() => {
    if (reducedMotion || typeof window === 'undefined') {
      setDisplayTotal(targetTotal);
      return undefined;
    }

    setDisplayTotal(0);
    const startDelay = 700;
    const duration = 1250;
    let frameId = null;
    let startTimestamp = null;

    const timerId = window.setTimeout(() => {
      const step = (now) => {
        if (startTimestamp === null) startTimestamp = now;
        const elapsed = now - startTimestamp;
        const progress = Math.min(elapsed / duration, 1);
        // Ease-out cubic
        const eased = 1 - Math.pow(1 - progress, 3);
        setDisplayTotal(Math.round(targetTotal * eased));
        if (progress < 1) {
          frameId = window.requestAnimationFrame(step);
        }
      };
      frameId = window.requestAnimationFrame(step);
    }, startDelay);

    return () => {
      window.clearTimeout(timerId);
      if (frameId !== null && typeof window.cancelAnimationFrame === 'function') {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, [targetTotal, reducedMotion]);

  return reducedMotion ? targetTotal : displayTotal;
}

export default function AuthShowcaseMiniCard({ miniUi, reducedMotion = false, isTransitioning = false }) {
  const animatedTotal = useCartTotalCountUp(
    miniUi?.type === 'multi-cart' ? miniUi.totalAmount : 0,
    reducedMotion,
  );

  if (!miniUi) return null;

  const wrapperClass = [
    'salo-mini-ui',
    `salo-mini-ui--${miniUi.type}`,
    reducedMotion ? 'is-reduced-motion' : '',
    isTransitioning ? 'is-transition-enter' : '',
  ]
    .filter(Boolean)
    .join(' ');

  if (miniUi.type === 'overview-chips') {
    return (
      <div className={wrapperClass} aria-hidden="true">
        <div className="salo-mini-chips-grid">
          {miniUi.chips.map((chip, idx) => (
            <div
              key={chip.id}
              className="salo-mini-chip"
              style={{ '--chip-index': idx }}
            >
              <span className="salo-mini-chip__icon">
                <ChipIcon type={chip.icon} />
              </span>
              <span className="salo-mini-chip__text">{chip.label}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (miniUi.type === 'multi-cart') {
    return (
      <div className={wrapperClass} aria-hidden="true">
        <div className="salo-mini-card">
          <div className="salo-mini-card__header">
            <span className="salo-mini-card__title">{miniUi.cardTitle}</span>
            <span className="salo-mini-card__pill">{miniUi.kitchenCountLabel}</span>
          </div>

          <div className="salo-mini-cart-rows">
            {miniUi.rows.map((row, idx) => (
              <div
                key={row.id}
                className="salo-mini-cart-row"
                style={{ '--row-index': idx }}
              >
                <div className="salo-mini-cart-row__info">
                  <span className="salo-mini-cart-row__store">{row.restaurant}</span>
                  <span className="salo-mini-cart-row__item">{row.item}</span>
                </div>
                <span className="salo-mini-cart-row__price">₱{row.price}</span>
              </div>
            ))}
          </div>

          <div className="salo-mini-cart-footer">
            <div className="salo-mini-cart-total">
              <span>{miniUi.totalLabel}</span>
              <strong>₱{animatedTotal}</strong>
            </div>
            <span className="salo-mini-btn salo-mini-btn--pulse">
              {miniUi.ctaLabel}
            </span>
          </div>
        </div>
      </div>
    );
  }

  if (miniUi.type === 'reservation') {
    const seats = Array.from({ length: miniUi.seatCount || 4 }, (_, i) => i);
    return (
      <div className={wrapperClass} aria-hidden="true">
        <div className="salo-mini-card">
          <div className="salo-mini-card__header">
            <div>
              <span className="salo-mini-card__eyebrow">{miniUi.restaurant}</span>
              <span className="salo-mini-card__title salo-mini-reserve-summary">
                {miniUi.summary}
              </span>
            </div>
            <span className="salo-mini-confirmed-badge">
              <svg
                className="salo-mini-confirmed-check"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 8.5L6.5 12L13 4.5" />
              </svg>
              <span>{miniUi.badgeLabel}</span>
            </span>
          </div>

          <div className="salo-mini-reserve-seats-row">
            <div className="salo-mini-seat-dots">
              {seats.map((seatIdx) => (
                <span
                  key={seatIdx}
                  className="salo-mini-seat-dot"
                  style={{ '--seat-index': seatIdx }}
                >
                  <span className="salo-mini-seat-dot__fill" />
                </span>
              ))}
            </div>
            <span className="salo-mini-reserve-meta">{miniUi.tableMeta}</span>
          </div>
        </div>
      </div>
    );
  }

  if (miniUi.type === 'delivery-timeline') {
    return (
      <div className={wrapperClass} aria-hidden="true">
        <div className="salo-mini-card">
          <div className="salo-mini-card__header">
            <div>
              <span className="salo-mini-card__eyebrow">{miniUi.restaurant}</span>
              <span className="salo-mini-card__title">{miniUi.orderRef}</span>
            </div>
            <span className="salo-mini-card__pill">{miniUi.fulfillmentNote}</span>
          </div>

          <div className="salo-mini-timeline">
            <div className="salo-mini-timeline__track">
              <div className="salo-mini-timeline__progress" />
            </div>
            <div className="salo-mini-timeline__steps">
              {miniUi.steps.map((step, idx) => (
                <div
                  key={step.key}
                  className="salo-mini-timeline__step"
                  style={{ '--step-index': idx }}
                >
                  <span className="salo-mini-timeline__node">
                    <span className="salo-mini-timeline__node-fill" />
                  </span>
                  <span className="salo-mini-timeline__label">{step.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (miniUi.type === 'restaurant-partner') {
    return (
      <div className={wrapperClass} aria-hidden="true">
        <div className="salo-mini-card">
          <div className="salo-mini-card__header">
            <div>
              <span className="salo-mini-card__eyebrow">{miniUi.cardTitle} · {miniUi.orderCode}</span>
              <span className="salo-mini-card__title">{miniUi.restaurant}</span>
            </div>
            <span className="salo-mini-btn salo-mini-btn--press">
              <span className="salo-mini-btn__label-default">{miniUi.actionLabel}</span>
              <span className="salo-mini-btn__label-pressed">{miniUi.acceptedLabel}</span>
            </span>
          </div>

          <p className="salo-mini-partner-order">{miniUi.orderSummary}</p>
          <span className="salo-mini-partner-total">{miniUi.orderTotal}</span>

          <div className="salo-mini-menu-toggle-row">
            <div className="salo-mini-menu-toggle-info">
              <span className="salo-mini-menu-item-name">{miniUi.menuItemLabel}</span>
              <span className="salo-mini-menu-item-status">{miniUi.menuStatusLabel}</span>
            </div>
            <span className="salo-mini-switch">
              <span className="salo-mini-switch__thumb" />
            </span>
          </div>
        </div>
      </div>
    );
  }

  if (miniUi.type === 'rider-partner') {
    return (
      <div className={wrapperClass} aria-hidden="true">
        <div className="salo-mini-card">
          <div className="salo-mini-card__header">
            <div>
              <span className="salo-mini-card__eyebrow">{miniUi.cardTitle}</span>
              <span className="salo-mini-card__title">{miniUi.routeTitle}</span>
            </div>
            <span className="salo-mini-btn salo-mini-btn--press">
              <span className="salo-mini-btn__label-default">{miniUi.actionLabel}</span>
              <span className="salo-mini-btn__label-pressed">{miniUi.acceptedLabel}</span>
            </span>
          </div>

          <div className="salo-mini-rider-meta">
            <span className="salo-mini-card__pill">{miniUi.distanceLabel}</span>
            <span className="salo-mini-card__pill salo-mini-card__pill--gold">{miniUi.codLabel}</span>
            <span className="salo-mini-card__pill salo-mini-card__pill--green">{miniUi.feeLabel}</span>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
