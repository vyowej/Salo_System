/**
 * BrandMark — SALO's unified brand identity component.
 *
 * Shows the SALO icon + live "SALO" text.
 * This is the single source of truth for the brand mark — used in:
 * navbar, mobile drawer, footer, sidebar, auth pages, loading states.
 *
 * Props:
 *   size       "sm" | "md" | "lg"  — controls icon and text size
 *   textClass  string               — extra CSS class on the text span
 *   showText   bool (default true)  — whether to show "SALO" text
 *   tagline    bool (default false) — show "Order. Reserve. Gather." below
 *   className  string               — class on the wrapper
 *   dark       bool (default false) — force light text (for dark backgrounds)
 */
import './BrandMark.css';

const SIZE_MAP = {
  sm: { icon: 28, text: 18 },
  md: { icon: 36, text: 22 },
  lg: { icon: 48, text: 30 },
};

export default function BrandMark({
  size = 'md',
  showText = true,
  tagline = false,
  className = '',
  dark = false,
  textClass = '',
}) {
  const { icon, text } = SIZE_MAP[size] || SIZE_MAP.md;

  return (
    <div className={`brand-mark ${dark ? 'brand-mark--dark' : ''} ${className}`}>
      <img
        src="/brand/salo-icon.png"
        alt="SALO"
        className="brand-mark__icon"
        style={{ width: icon, height: icon }}
        draggable={false}
      />
      {showText && (
        <div className="brand-mark__text-col">
          <span
            className={`brand-mark__name font-display ${textClass}`}
            style={{ fontSize: text }}
          >
            SALO
          </span>
          {tagline && (
            <span className="brand-mark__tagline">
              Order. Reserve. Gather.
            </span>
          )}
        </div>
      )}
    </div>
  );
}
