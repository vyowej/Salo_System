/**
 * Lucide-react line icons (ShoppingBasket, CalendarCheck, Leaf)
 * Rendered inline with exact Lucide 24x24 geometry so no extra bundle dependency is needed.
 */
function ShoppingBasketIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m15 11-1 9" />
      <path d="m19 11-4-7" />
      <path d="M2 11h20" />
      <path d="m3.5 11 1.6 7.4a2 2 0 0 0 2 1.6h9.8a2 2 0 0 0 2-1.6l1.7-7.4" />
      <path d="M4.5 15.5h15" />
      <path d="m5 11 4-7" />
      <path d="m9 11 1 9" />
    </svg>
  );
}

function CalendarCheckIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M8 2v4" />
      <path d="M16 2v4" />
      <rect width="18" height="18" x="3" y="4" rx="2" />
      <path d="M3 10h18" />
      <path d="m9 16 2 2 4-4" />
    </svg>
  );
}

function LeafIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" />
      <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
    </svg>
  );
}

const FEATURES = [
  {
    id: 'multi-kitchen',
    title: 'Multi-Kitchen Basket',
    subtitle: 'Combine up to 3 partner kitchens in one order.',
    Icon: ShoppingBasketIcon,
  },
  {
    id: 'table-booking',
    title: 'Instant Table Booking',
    subtitle: 'Lock in seats for family feasts & occasions.',
    Icon: CalendarCheckIcon,
  },
  {
    id: 'local-flavors',
    title: 'Crafted Local Flavors',
    subtitle: 'Authentic heritage recipes across the metro.',
    Icon: LeafIcon,
  },
];

export default function FeatureStrip() {
  return (
    <section
      className="customer-feature-strip-section customer-stagger-item"
      style={{ '--stagger-index': 1 }}
      aria-label="SALO platform highlights"
    >
      <div className="customer-feature-strip">
        {FEATURES.map(({ id, title, subtitle, Icon }) => (
          <div key={id} className="customer-feature-strip__item">
            <span className="customer-feature-strip__icon" aria-hidden="true">
              <Icon />
            </span>
            <div className="customer-feature-strip__copy">
              <h3 className="customer-feature-strip__title">{title}</h3>
              <p className="customer-feature-strip__subtitle">{subtitle}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
