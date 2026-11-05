import { useState } from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import ThemeToggle from '../../components/navigation/ThemeToggle';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import { Card, CardHeader, CardTitle, CardBody, CardFooter, StatCard } from '../../components/common/Card';
import { Input, Textarea, Select, FormGroup, Label, HelperText, ErrorMessage } from '../../components/forms/FormElements';
import Modal from '../../components/common/Modal';
import {
  Skeleton,
  SkeletonText,
  SkeletonCard,
  EmptyState,
  ErrorState,
  LoadingSpinner,
} from '../../components/feedback/Feedback';
import './DesignShowcase.css';

/* ── Icons (inline SVG) ──────────────────────────────── */
const Icon = ({ path, size = 20, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.75" aria-hidden="true" {...props}>
    {typeof path === 'string' ? <path d={path} /> : path}
  </svg>
);

const ICONS = {
  home:         'M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z',
  orders:       'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2',
  menu:         'M12 2a10 10 0 110 20A10 10 0 0112 2zm0 6v4m0 4h.01',
  reservation:  'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
  settings:     'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37a1.724 1.724 0 002.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z',
  analytics:    'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
  users:        'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2m22 0v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75',
  restaurant:   'M3 11l19-9-9 19-2-8-8-2z',
  rider:        'M5 17H3a2 2 0 01-2-2V5a2 2 0 012-2h11a2 2 0 012 2v3m-1 11a2 2 0 100-4 2 2 0 000 4zm6 0a2 2 0 100-4 2 2 0 000 4zm-9-5h8',
  search:       'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z',
  bell:         'M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0',
  package:      'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z',
  map:          'M1 6v16l7-4 8 4 7-4V2l-7 4-8-4-7 4zm7-4v16m8-12v16',
};

/* ── Tab config ──────────────────────────────────────── */
const TABS = [
  { id: 'foundation', label: 'Foundation' },
  { id: 'components', label: 'Components' },
  { id: 'forms',      label: 'Forms' },
  { id: 'navigation', label: 'Navigation' },
  { id: 'states',     label: 'States' },
  { id: 'layouts',    label: 'Layouts' },
];

export default function DesignShowcase() {
  const { theme } = useTheme();
  const [activeTab, setActiveTab] = useState('foundation');
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const logoSrc = theme === 'dark'
    ? '/brand/salo-logo-dark.png'
    : '/brand/salo-logo-light.png';

  return (
    <div className="showcase">
      <div className="fiesta-banderitas-strip" aria-hidden="true" />
      {/* ── TopBar ──────────────────────────────────── */}
      <header className="showcase-topbar">
        <div className="showcase-topbar-logo">
          <img src={logoSrc} alt="SALO" />
          <span className="showcase-topbar-badge">Design System</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>
            Phase 1 Showcase · Dev Only
          </span>
          <ThemeToggle />
        </div>
      </header>

      {/* ── Tab nav ─────────────────────────────────── */}
      <div className="showcase-tabs">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`showcase-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Body ────────────────────────────────────── */}
      <div className="showcase-body">

        {/* ════════════════════════════════════════════
            FOUNDATION TAB
            ════════════════════════════════════════════ */}
        {activeTab === 'foundation' && (
          <div>

            {/* Theme toggle demo */}
            <section className="showcase-section">
              <div className="showcase-section-header">
                <h2 className="showcase-section-title">Theme System</h2>
                <p className="showcase-section-desc">
                  Light and dark modes. Toggle with the button in the top right.
                  Preference is persisted to localStorage and respects system preference.
                </p>
              </div>

              {/* Theme split panels */}
              <div className="showcase-split">
                <div className="showcase-split-panel" style={{ background: '#FFFFFF', color: '#171717' }}>
                  <div className="showcase-split-panel-label" style={{ background: '#F7F7F7', color: '#999', borderColor: '#EAEAEA' }}>
                    ☀️ Light Mode
                  </div>
                  <div className="showcase-split-panel-body">
                    <p style={{ fontWeight: 600, color: '#171717', marginBottom: 8 }}>Background: #FFFFFF</p>
                    <p style={{ fontSize: 13, color: '#737373', marginBottom: 16 }}>Surface: #F7F7F7 — Genuinely white. No beige, no cream.</p>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <span style={{ padding: '6px 14px', background: '#F36B2B', color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 600 }}>Primary</span>
                      <span style={{ padding: '6px 14px', background: '#FFF0E8', color: '#F36B2B', borderRadius: 8, fontSize: 13, fontWeight: 600 }}>Subtle</span>
                    </div>
                  </div>
                </div>

                <div className="showcase-split-panel" style={{ background: '#171717', color: '#FFFFFF' }}>
                  <div className="showcase-split-panel-label" style={{ background: '#252525', color: '#858585', borderColor: '#303030' }}>
                    🌙 Dark Mode
                  </div>
                  <div className="showcase-split-panel-body">
                    <p style={{ fontWeight: 600, color: '#FFFFFF', marginBottom: 8 }}>Background: #171717</p>
                    <p style={{ fontSize: 13, color: '#B5B5B5', marginBottom: 16 }}>Surface: #202020 — Genuinely dark. No washed-out grays.</p>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <span style={{ padding: '6px 14px', background: '#FF8045', color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 600 }}>Primary</span>
                      <span style={{ padding: '6px 14px', background: '#3A241A', color: '#FF8045', borderRadius: 8, fontSize: 13, fontWeight: 600 }}>Subtle</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Logo switcher demo */}
              <div className="showcase-subsection">
                <p className="showcase-subsection-label">Logo Switching</p>
                <Card>
                  <CardBody>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-8)', flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', alignItems: 'center' }}>
                        <div style={{ padding: 'var(--space-5)', background: '#fff', borderRadius: 'var(--radius-lg)', border: '1px solid #EAEAEA', minWidth: 200, display: 'flex', justifyContent: 'center' }}>
                          <img src="/brand/salo-logo-light.png" alt="SALO light" style={{ height: 36, objectFit: 'contain' }} />
                        </div>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Light Mode Logo</span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', alignItems: 'center' }}>
                        <div style={{ padding: 'var(--space-5)', background: '#171717', borderRadius: 'var(--radius-lg)', border: '1px solid #383838', minWidth: 200, display: 'flex', justifyContent: 'center' }}>
                          <img src="/brand/salo-logo-dark.png" alt="SALO dark" style={{ height: 36, objectFit: 'contain' }} />
                        </div>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Dark Mode Logo</span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', alignItems: 'center' }}>
                        <div style={{ padding: 'var(--space-5)', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-primary)', minWidth: 100, display: 'flex', justifyContent: 'center' }}>
                          <img src="/brand/salo-icon.png" alt="SALO icon" style={{ height: 36, objectFit: 'contain' }} />
                        </div>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>App Icon</span>
                      </div>
                    </div>
                    <p style={{ marginTop: 'var(--space-4)', fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' }}>
                      Current theme: <strong style={{ color: 'var(--accent)' }}>{theme}</strong> →
                      {' '}Using <code style={{ background: 'var(--bg-tertiary)', padding: '2px 6px', borderRadius: 4, fontSize: 12 }}>
                        {theme === 'dark' ? '/brand/salo-logo-dark.png' : '/brand/salo-logo-light.png'}
                      </code>
                    </p>
                  </CardBody>
                </Card>
              </div>
            </section>

            {/* Filipino Fiesta Brand Color system */}
            <section className="showcase-section">
              <div className="showcase-section-header">
                <h2 className="showcase-section-title">Filipino Fiesta Brand Color System</h2>
                <p className="showcase-section-desc">
                  Official SALO logo colors reflecting modern Filipino food culture: Fiesta Orange, Golden Yellow, Earthy Palayok Brown, and Dahon ng Saging Green.
                  Light mode is pure white (#FFFFFF); Dark mode is near-black (#171717). No beige or cream.
                </p>
              </div>

              {/* Decorative banderitas showcase */}
              <div style={{ marginBottom: 'var(--space-6)' }}>
                <p className="showcase-subsection-label">Subtle Banderitas Accent Strip (.fiesta-banderitas-strip)</p>
                <div className="fiesta-banderitas-strip" style={{ borderRadius: 'var(--radius-full)', height: 6, marginBottom: 'var(--space-3)' }} />
                <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                  <span className="fiesta-pill">🍛 Orange · Primary Action</span>
                  <span className="fiesta-pill fiesta-pill-gold">☀️ Gold · Celebrations & Sun</span>
                  <span className="fiesta-pill fiesta-pill-green">🍃 Green · Dahon ng Saging</span>
                  <span className="fiesta-pill" style={{ background: 'var(--fiesta-brown-subtle)', color: 'var(--fiesta-brown-text)' }}>🍲 Brown · Palayok Comfort</span>
                </div>
              </div>

              <div className="showcase-subsection">
                <p className="showcase-subsection-label">The 4 Official Logo & Brand Colors</p>
                <div className="color-swatches">
                  {[
                    { name: 'Fiesta Orange', hex: '#F36B2B', desc: 'Energy & Actions' },
                    { name: 'Golden Yellow', hex: '#F59E0B', desc: 'Sun & Festivities' },
                    { name: 'Earthy Brown', hex: '#5D4037', desc: 'Palayok & Warmth' },
                    { name: 'Muted Green', hex: '#2E7D32', desc: 'Dahon ng Saging' },
                  ].map(s => (
                    <div key={s.name} className="color-swatch" style={{ minWidth: 110 }}>
                      <div className="color-swatch-block" style={{ background: s.hex, width: 80, height: 64 }} />
                      <span className="color-swatch-label">{s.name}</span>
                      <span className="color-swatch-hex">{s.hex}</span>
                      <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>{s.desc}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="showcase-subsection">
                <p className="showcase-subsection-label">Status Colors</p>
                <div className="color-swatches">
                  {[
                    { name: 'Success', hex: '#2E7D32' },
                    { name: 'Warning', hex: '#E6A23C' },
                    { name: 'Error', hex: '#DC4545' },
                  ].map(s => (
                    <div key={s.name} className="color-swatch">
                      <div className="color-swatch-block" style={{ background: s.hex }} />
                      <span className="color-swatch-label">{s.name}</span>
                      <span className="color-swatch-hex">{s.hex}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="showcase-subsection">
                <p className="showcase-subsection-label">Surface Colors (Current Theme)</p>
                <div className="color-swatches">
                  {[
                    { name: 'BG Primary (Pure)', var: 'var(--bg-primary)', label: '--bg-primary' },
                    { name: 'BG Secondary', var: 'var(--bg-secondary)', label: '--bg-secondary' },
                    { name: 'BG Tertiary', var: 'var(--bg-tertiary)', label: '--bg-tertiary' },
                    { name: 'Surface', var: 'var(--surface-primary)', label: '--surface-primary' },
                    { name: 'Border', var: 'var(--border-primary)', label: '--border-primary' },
                  ].map(s => (
                    <div key={s.name} className="color-swatch">
                      <div className="color-swatch-block" style={{ background: s.var, border: '1px solid var(--border-primary)' }} />
                      <span className="color-swatch-label">{s.name}</span>
                      <span className="color-swatch-hex">{s.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* Natural Filipino / Taglish Microcopy Guidelines */}
            <section className="showcase-section">
              <div className="showcase-section-header">
                <h2 className="showcase-section-title">Natural Filipino / Taglish Microcopy Standards</h2>
                <p className="showcase-section-desc">
                  Voice & tone: Warm, welcoming, festive, comforting, and homey. Avoid stiff corporate English or overly theatrical Tagalog.
                </p>
              </div>

              <Card>
                <CardBody>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 'var(--space-4)' }}>
                    <div style={{ padding: 'var(--space-3)', background: 'var(--surface-secondary)', borderRadius: 'var(--radius-md)' }}>
                      <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', marginBottom: 4 }}>Time-Aware Greetings</p>
                      <p style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }}>&ldquo;Magandang umaga, {`{name}`}! Kain tayo!&rdquo;</p>
                      <p style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }}>&ldquo;Magandang hapon! Gutom ka na ba?&rdquo;</p>
                      <p style={{ fontWeight: 600, fontSize: 13 }}>&ldquo;Magandang gabi! Tara, kain tayo!&rdquo;</p>
                    </div>

                    <div style={{ padding: 'var(--space-3)', background: 'var(--surface-secondary)', borderRadius: 'var(--radius-md)' }}>
                      <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--fiesta-gold-text)', textTransform: 'uppercase', marginBottom: 4 }}>Search & Discovery</p>
                      <p style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }}>&ldquo;Ano&apos;ng cravings mo today?&rdquo;</p>
                      <p style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }}>&ldquo;Hanapin ang paborito mong kainan...&rdquo;</p>
                      <p style={{ fontWeight: 600, fontSize: 13 }}>&ldquo;Paborito sa Handaan & Salo-salo&rdquo;</p>
                    </div>

                    <div style={{ padding: 'var(--space-3)', background: 'var(--surface-secondary)', borderRadius: 'var(--radius-md)' }}>
                      <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--fiesta-green-text)', textTransform: 'uppercase', marginBottom: 4 }}>Action CTAs</p>
                      <p style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }}>&ldquo;Order na!&rdquo; / &ldquo;Tara, Order Na!&rdquo;</p>
                      <p style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }}>&ldquo;Magpareserba ng Mesa&rdquo;</p>
                      <p style={{ fontWeight: 600, fontSize: 13 }}>&ldquo;Tingnan ang Multi-Cart&rdquo;</p>
                    </div>
                  </div>
                </CardBody>
              </Card>
            </section>

            {/* Typography */}
            <section className="showcase-section">
              <div className="showcase-section-header">
                <h2 className="showcase-section-title">Typography</h2>
                <p className="showcase-section-desc">Inter as primary font. Clear hierarchy, comfortable reading size.</p>
              </div>

              <div className="showcase-subsection">
                <p className="showcase-subsection-label">Type Scale</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
                  {[
                    { label: '36px / Bold', style: { fontSize: 36, fontWeight: 700, letterSpacing: '-0.03em' }, text: 'Display Heading' },
                    { label: '30px / Semibold', style: { fontSize: 30, fontWeight: 600, letterSpacing: '-0.025em' }, text: 'Page Title' },
                    { label: '24px / Semibold', style: { fontSize: 24, fontWeight: 600, letterSpacing: '-0.02em' }, text: 'Section Heading' },
                    { label: '20px / Semibold', style: { fontSize: 20, fontWeight: 600, letterSpacing: '-0.015em' }, text: 'Subsection Title' },
                    { label: '18px / Medium', style: { fontSize: 18, fontWeight: 500 }, text: 'Large body text' },
                    { label: '16px / Regular', style: { fontSize: 16, fontWeight: 400 }, text: 'Body text — comfortable for reading' },
                    { label: '15px / Regular', style: { fontSize: 15, fontWeight: 400, color: 'var(--text-secondary)' }, text: 'Secondary body text' },
                    { label: '13px / Medium', style: { fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }, text: 'Small body / labels' },
                    { label: '11px / Semibold', style: { fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }, text: 'CAPTION / LABEL' },
                  ].map((t) => (
                    <div key={t.label} style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-6)' }}>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace', width: 160, flexShrink: 0 }}>{t.label}</span>
                      <span style={t.style}>{t.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            </section>

          </div>
        )}

        {/* ════════════════════════════════════════════
            COMPONENTS TAB
            ════════════════════════════════════════════ */}
        {activeTab === 'components' && (
          <div>

            {/* Buttons */}
            <section className="showcase-section">
              <div className="showcase-section-header">
                <h2 className="showcase-section-title">Buttons</h2>
                <p className="showcase-section-desc">Five variants, four sizes, all states. Primary orange for key actions only.</p>
              </div>

              <div className="showcase-subsection">
                <p className="showcase-subsection-label">Variants</p>
                <div className="showcase-row">
                  <Button variant="primary">Primary</Button>
                  <Button variant="secondary">Secondary</Button>
                  <Button variant="outline">Outline</Button>
                  <Button variant="ghost">Ghost</Button>
                  <Button variant="danger">Danger</Button>
                  <Button variant="danger-outline">Danger Outline</Button>
                </div>
              </div>

              <div className="showcase-subsection">
                <p className="showcase-subsection-label">Sizes</p>
                <div className="showcase-row" style={{ alignItems: 'flex-end' }}>
                  <Button variant="primary" size="sm">Small</Button>
                  <Button variant="primary" size="md">Medium</Button>
                  <Button variant="primary" size="lg">Large</Button>
                  <Button variant="primary" size="xl">Extra Large</Button>
                </div>
              </div>

              <div className="showcase-subsection">
                <p className="showcase-subsection-label">States</p>
                <div className="showcase-row">
                  <Button variant="primary">Default</Button>
                  <Button variant="primary" loading>Loading</Button>
                  <Button variant="primary" disabled>Disabled</Button>
                  <Button
                    variant="primary"
                    leftIcon={<Icon path={ICONS.search} size={16} />}
                  >
                    With Icon
                  </Button>
                  <Button
                    variant="secondary"
                    rightIcon={<Icon path={ICONS.orders} size={16} />}
                  >
                    Right Icon
                  </Button>
                </div>
              </div>

              <div className="showcase-subsection">
                <p className="showcase-subsection-label">Full Width</p>
                <div style={{ maxWidth: 400 }}>
                  <Button variant="primary" fullWidth>Full Width Primary</Button>
                </div>
              </div>
            </section>

            {/* Badges */}
            <section className="showcase-section">
              <div className="showcase-section-header">
                <h2 className="showcase-section-title">Badges</h2>
                <p className="showcase-section-desc">Semantic status indicators. Never rely on color alone.</p>
              </div>

              <div className="showcase-subsection">
                <p className="showcase-subsection-label">Semantic Variants</p>
                <div className="showcase-row">
                  <Badge status="pending" dot />
                  <Badge status="approved" dot />
                  <Badge status="active" dot />
                  <Badge status="completed" dot />
                  <Badge status="rejected" dot />
                  <Badge status="cancelled" dot />
                  <Badge variant="primary" dot>Preparing</Badge>
                  <Badge variant="info" dot>On the Way</Badge>
                </div>
              </div>

              <div className="showcase-subsection">
                <p className="showcase-subsection-label">Sizes</p>
                <div className="showcase-row">
                  <Badge status="active" size="sm" dot>Small</Badge>
                  <Badge status="active" dot>Medium</Badge>
                  <Badge status="active" size="lg" dot>Large</Badge>
                </div>
              </div>

              <div className="showcase-subsection">
                <p className="showcase-subsection-label">Outlined</p>
                <div className="showcase-row">
                  <Badge variant="primary" outlined dot>Primary</Badge>
                  <Badge variant="success" outlined dot>Success</Badge>
                  <Badge variant="warning" outlined dot>Warning</Badge>
                  <Badge variant="error" outlined dot>Error</Badge>
                </div>
              </div>
            </section>

            {/* Cards */}
            <section className="showcase-section">
              <div className="showcase-section-header">
                <h2 className="showcase-section-title">Cards</h2>
                <p className="showcase-section-desc">Cards for containment of related content. Not every section needs a card.</p>
              </div>

              <div className="showcase-subsection">
                <p className="showcase-subsection-label">Default Card with header + footer</p>
                <div style={{ maxWidth: 480 }}>
                  <Card>
                    <CardHeader>
                      <CardTitle description="Some context about this section">Card Title</CardTitle>
                      <Button variant="outline" size="sm">Action</Button>
                    </CardHeader>
                    <CardBody>
                      <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)', lineHeight: 1.65 }}>
                        Card body content. Use cards when you need clear visual containment for
                        related, dense, or interactive content. Not for decoration.
                      </p>
                    </CardBody>
                    <CardFooter>
                      <Button variant="primary" size="sm">Save</Button>
                      <Button variant="ghost" size="sm">Cancel</Button>
                    </CardFooter>
                  </Card>
                </div>
              </div>

              <div className="showcase-subsection">
                <p className="showcase-subsection-label">Stat Cards (Dashboard Metrics)</p>
                <div className="stat-grid">
                  <StatCard label="Total Orders" value="1,284" change="12% vs last month" changeType="positive" />
                  <StatCard label="Revenue" value="₱48,320" change="8% vs last month" changeType="positive" />
                  <StatCard label="Cancellations" value="23" change="3 more than usual" changeType="negative" />
                  <StatCard label="Active Riders" value="7" />
                </div>
              </div>

              <div className="showcase-subsection">
                <p className="showcase-subsection-label">Elevated + Interactive Cards</p>
                <div className="grid-cols-3">
                  <Card variant="elevated">
                    <CardBody>
                      <p style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, marginBottom: 'var(--space-2)' }}>Elevated Card</p>
                      <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' }}>Shadow only, no border.</p>
                    </CardBody>
                  </Card>
                  <Card variant="flat">
                    <CardBody>
                      <p style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, marginBottom: 'var(--space-2)' }}>Flat Card</p>
                      <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' }}>Secondary surface, no border or shadow.</p>
                    </CardBody>
                  </Card>
                  <Card interactive>
                    <CardBody>
                      <p style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, marginBottom: 'var(--space-2)' }}>Interactive Card ↗</p>
                      <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' }}>Hover to see elevation. Click-target card.</p>
                    </CardBody>
                  </Card>
                </div>
              </div>
            </section>

            {/* Table */}
            <section className="showcase-section">
              <div className="showcase-section-header">
                <h2 className="showcase-section-title">Table</h2>
                <p className="showcase-section-desc">Clear headers, consistent spacing, status indicators.</p>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Recent Orders</CardTitle>
                  <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                    <Button variant="ghost" size="sm">Export</Button>
                    <Button variant="primary" size="sm">New Order</Button>
                  </div>
                </CardHeader>
                <div style={{ overflowX: 'auto' }}>
                  <table className="demo-table">
                    <thead>
                      <tr>
                        <th>Order ID</th>
                        <th>Customer</th>
                        <th>Restaurant</th>
                        <th>Amount</th>
                        <th>Status</th>
                        <th>Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { id: '#ORD-0041', cust: 'Maria Santos', rest: 'Jollibee EDSA', amt: '₱320', status: 'completed', time: '2 min ago' },
                        { id: '#ORD-0040', cust: 'Juan dela Cruz', rest: 'McDonald\'s BGC', amt: '₱218', status: 'active', time: '5 min ago' },
                        { id: '#ORD-0039', cust: 'Ana Reyes', rest: 'KFC Makati', amt: '₱495', status: 'preparing', time: '12 min ago' },
                        { id: '#ORD-0038', cust: 'Carlos Mendoza', rest: 'Chowking Mall', amt: '₱167', status: 'pending', time: '18 min ago' },
                        { id: '#ORD-0037', cust: 'Liza Fernandez', rest: 'Pizza Hut Pasig', amt: '₱640', status: 'cancelled', time: '25 min ago' },
                      ].map((row) => (
                        <tr key={row.id}>
                          <td><span style={{ fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: 13 }}>{row.id}</span></td>
                          <td>{row.cust}</td>
                          <td style={{ color: 'var(--text-secondary)' }}>{row.rest}</td>
                          <td><span style={{ fontWeight: 600 }}>{row.amt}</span></td>
                          <td><Badge status={row.status} dot /></td>
                          <td style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-xs)' }}>{row.time}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </section>

            {/* Modal */}
            <section className="showcase-section">
              <div className="showcase-section-header">
                <h2 className="showcase-section-title">Modals</h2>
                <p className="showcase-section-desc">Accessible overlays with keyboard support, focus trap, and scroll lock.</p>
              </div>

              <div className="showcase-row">
                <Button variant="primary" onClick={() => setModalOpen(true)}>
                  Open Modal
                </Button>
                <Button variant="danger-outline" onClick={() => setConfirmOpen(true)}>
                  Confirm Dialog
                </Button>
              </div>

              {/* Info modal */}
              <Modal
                open={modalOpen}
                onClose={() => setModalOpen(false)}
                title="Reservation Details"
                size="md"
                footer={
                  <>
                    <Button variant="ghost" size="sm" onClick={() => setModalOpen(false)}>Cancel</Button>
                    <Button variant="primary" size="sm" onClick={() => setModalOpen(false)}>Confirm Booking</Button>
                  </>
                }
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
                  <div>
                    <p style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>Restaurant</p>
                    <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' }}>Jollibee EDSA Guadalupe</p>
                  </div>
                  <div>
                    <p style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>Date & Time</p>
                    <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' }}>November 15, 2026 at 7:00 PM</p>
                  </div>
                  <div>
                    <p style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>Party Size</p>
                    <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' }}>4 guests</p>
                  </div>
                  <div style={{ padding: 'var(--space-4)', background: 'var(--accent-subtle)', borderRadius: 'var(--radius-md)', fontSize: 'var(--font-size-sm)', color: 'var(--accent)' }}>
                    ✓ Table available. Confirmation will be sent to your email.
                  </div>
                </div>
              </Modal>

              {/* Confirm modal */}
              <Modal
                open={confirmOpen}
                onClose={() => setConfirmOpen(false)}
                title="Cancel Order?"
                size="sm"
                footer={
                  <>
                    <Button variant="ghost" size="sm" onClick={() => setConfirmOpen(false)}>Keep Order</Button>
                    <Button variant="danger" size="sm" onClick={() => setConfirmOpen(false)}>Cancel Order</Button>
                  </>
                }
              >
                <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)', lineHeight: 1.65 }}>
                  Are you sure you want to cancel this order? The restaurant has already started preparing your food.
                  Cancellation fees may apply.
                </p>
              </Modal>
            </section>

          </div>
        )}

        {/* ════════════════════════════════════════════
            FORMS TAB
            ════════════════════════════════════════════ */}
        {activeTab === 'forms' && (
          <div>
            <section className="showcase-section">
              <div className="showcase-section-header">
                <h2 className="showcase-section-title">Form Elements</h2>
                <p className="showcase-section-desc">Accessible inputs with clear labels, descriptions, and validation states.</p>
              </div>

              <div className="grid-cols-2">
                {/* Text inputs */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
                  <Input
                    id="name"
                    label="Full Name"
                    placeholder="e.g. Maria Santos"
                    required
                  />
                  <Input
                    id="email"
                    label="Email Address"
                    type="email"
                    placeholder="you@example.com"
                    helper="We'll send your receipt here."
                    leftIcon={
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                        <polyline points="22,6 12,13 2,6"/>
                      </svg>
                    }
                  />
                  <Input
                    id="phone"
                    label="Phone Number"
                    type="tel"
                    placeholder="09XX XXX XXXX"
                    error="Please enter a valid Philippine phone number."
                  />
                  <Input
                    id="disabled"
                    label="Disabled Field"
                    placeholder="Cannot edit"
                    disabled
                    defaultValue="Readonly value"
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
                  <Select
                    id="role"
                    label="Account Type"
                    helper="Choose the role that describes you best."
                  >
                    <option value="">Select a role…</option>
                    <option value="customer">Customer</option>
                    <option value="owner">Restaurant Owner</option>
                    <option value="rider">Delivery Rider</option>
                  </Select>

                  <Textarea
                    id="notes"
                    label="Special Instructions"
                    placeholder="Any dietary restrictions, delivery notes, etc."
                    helper="Optional. Up to 300 characters."
                    rows={4}
                  />

                  <FormGroup>
                    <Label>Preferences</Label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                      {['Email notifications', 'SMS alerts', 'Push notifications'].map((opt) => (
                        <label key={opt} className="checkbox-group">
                          <input type="checkbox" defaultChecked={opt === 'Email notifications'} />
                          <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-primary)' }}>{opt}</span>
                        </label>
                      ))}
                    </div>
                  </FormGroup>
                </div>
              </div>

              {/* Full form demo */}
              <div className="showcase-subsection" style={{ marginTop: 'var(--space-10)' }}>
                <p className="showcase-subsection-label">Complete Form Example</p>
                <div style={{ maxWidth: 480 }}>
                  <Card>
                    <CardHeader>
                      <CardTitle description="Reserve a table at your favorite restaurant">Make a Reservation</CardTitle>
                    </CardHeader>
                    <CardBody>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
                        <div className="grid-cols-2" style={{ gap: 'var(--space-4)' }}>
                          <Input id="r-first" label="First Name" placeholder="Maria" required />
                          <Input id="r-last" label="Last Name" placeholder="Santos" required />
                        </div>
                        <Input id="r-email" label="Email" type="email" placeholder="maria@email.com" required />
                        <div className="grid-cols-2" style={{ gap: 'var(--space-4)' }}>
                          <Input id="r-date" label="Date" type="date" required />
                          <Input id="r-time" label="Time" type="time" required />
                        </div>
                        <Select id="r-guests" label="Guests" required>
                          <option value="1">1 person</option>
                          <option value="2">2 people</option>
                          <option value="4" selected>4 people</option>
                          <option value="6">6 people</option>
                          <option value="8">8+ people</option>
                        </Select>
                        <Textarea id="r-notes" label="Special Requests" placeholder="Dietary requirements, occasion…" rows={3} />
                      </div>
                    </CardBody>
                    <CardFooter>
                      <Button variant="primary" fullWidth>Book Table</Button>
                    </CardFooter>
                  </Card>
                </div>
              </div>
            </section>
          </div>
        )}

        {/* ════════════════════════════════════════════
            NAVIGATION TAB
            ════════════════════════════════════════════ */}
        {activeTab === 'navigation' && (
          <div>
            <section className="showcase-section">
              <div className="showcase-section-header">
                <h2 className="showcase-section-title">Navigation Foundation</h2>
                <p className="showcase-section-desc">Top navigation + sidebar. Each role gets its own nav config. Collapsible sidebar. Mobile-ready.</p>
              </div>

              {/* Nav shell demo */}
              <div className="showcase-subsection">
                <p className="showcase-subsection-label">Dashboard Shell (Customer Role)</p>
                <NavShellDemo role="customer" />
              </div>

              <div className="showcase-subsection" style={{ marginTop: 'var(--space-8)' }}>
                <p className="showcase-subsection-label">Dashboard Shell (Admin Role)</p>
                <NavShellDemo role="admin" />
              </div>
            </section>

            {/* Role nav configs */}
            <section className="showcase-section">
              <div className="showcase-section-header">
                <h2 className="showcase-section-title">Role Navigation Items</h2>
                <p className="showcase-section-desc">Each role has its own navigation — no shared sidebar with all roles merged.</p>
              </div>

              <div className="grid-cols-2">
                {Object.entries(NAV_CONFIGS).map(([role, items]) => (
                  <Card key={role}>
                    <CardHeader>
                      <CardTitle>{capitalize(role)} Navigation</CardTitle>
                      <Badge variant={ROLE_BADGE[role]}>{role}</Badge>
                    </CardHeader>
                    <CardBody size="sm">
                      {items.map((item) => (
                        <div key={item.id} style={{
                          display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
                          padding: 'var(--space-2) var(--space-3)',
                          borderRadius: 'var(--radius-md)',
                          marginBottom: 2,
                          fontSize: 'var(--font-size-sm)',
                          color: 'var(--text-secondary)',
                        }}>
                          <span style={{ color: 'var(--accent)' }}>{item.icon}</span>
                          <span>{item.label}</span>
                          {item.section && <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)', background: 'var(--bg-tertiary)', padding: '1px 6px', borderRadius: 4 }}>{item.section}</span>}
                        </div>
                      ))}
                    </CardBody>
                  </Card>
                ))}
              </div>
            </section>
          </div>
        )}

        {/* ════════════════════════════════════════════
            STATES TAB
            ════════════════════════════════════════════ */}
        {activeTab === 'states' && (
          <div>
            <section className="showcase-section">
              <div className="showcase-section-header">
                <h2 className="showcase-section-title">Loading States</h2>
                <p className="showcase-section-desc">Skeletons and spinners for async content. Never show blank screens.</p>
              </div>

              <div className="showcase-subsection">
                <p className="showcase-subsection-label">Skeleton Cards</p>
                <div className="grid-cols-3">
                  <SkeletonCard />
                  <SkeletonCard />
                  <SkeletonCard />
                </div>
              </div>

              <div className="showcase-subsection">
                <p className="showcase-subsection-label">Skeleton Text</p>
                <div style={{ maxWidth: 400 }}>
                  <Card>
                    <CardBody>
                      <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-start' }}>
                        <Skeleton width={40} height="40px" style={{ borderRadius: '50%', flexShrink: 0 }} />
                        <div style={{ flex: 1 }}>
                          <SkeletonText lines={3} />
                        </div>
                      </div>
                    </CardBody>
                  </Card>
                </div>
              </div>

              <div className="showcase-subsection">
                <p className="showcase-subsection-label">Spinners</p>
                <div className="showcase-row" style={{ alignItems: 'center' }}>
                  <LoadingSpinner size="sm" />
                  <LoadingSpinner size="md" />
                  <LoadingSpinner size="lg" />
                </div>
              </div>
            </section>

            <section className="showcase-section">
              <div className="showcase-section-header">
                <h2 className="showcase-section-title">Empty States</h2>
                <p className="showcase-section-desc">Clear message when there is no data. Always provide a path forward.</p>
              </div>

              <div className="grid-cols-2">
                <Card>
                  <EmptyState
                    icon={<Icon path={ICONS.orders} size={24} />}
                    title="No orders yet"
                    description="When customers place orders, they'll appear here. Share your restaurant link to get started."
                    action={<Button variant="primary" size="sm">Share Restaurant</Button>}
                  />
                </Card>
                <Card>
                  <EmptyState
                    icon={<Icon path={ICONS.reservation} size={24} />}
                    title="No reservations"
                    description="You don't have any upcoming reservations. Browse restaurants to book a table."
                    action={<Button variant="outline" size="sm">Find Restaurants</Button>}
                  />
                </Card>
              </div>
            </section>

            <section className="showcase-section">
              <div className="showcase-section-header">
                <h2 className="showcase-section-title">Error States</h2>
                <p className="showcase-section-desc">Never silently fail. Always show a recoverable error.</p>
              </div>

              <div style={{ maxWidth: 480 }}>
                <Card>
                  <ErrorState
                    title="Failed to load orders"
                    description="We couldn't connect to the server. Check your connection and try again."
                    onRetry={() => alert('Retrying…')}
                  />
                </Card>
              </div>
            </section>
          </div>
        )}

        {/* ════════════════════════════════════════════
            LAYOUTS TAB
            ════════════════════════════════════════════ */}
        {activeTab === 'layouts' && (
          <div>
            {/* Open (non-card) layout */}
            <section className="showcase-section">
              <div className="showcase-section-header">
                <h2 className="showcase-section-title">Open Layouts (Non-Card)</h2>
                <p className="showcase-section-desc">
                  Strong typography and spacing create hierarchy without cards. Use cards for containment, not decoration.
                </p>
              </div>

              {/* Open layout demo block */}
              <div style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius-xl)', padding: 'var(--space-10)', border: '1px solid var(--border-secondary)' }}>
                <div className="open-layout-demo">
                  <p className="ol-eyebrow">Featured Restaurant</p>
                  <h1 className="ol-title">Jollibee EDSA Guadalupe</h1>
                  <p className="ol-desc">
                    Filipino fast food at its finest. Crispy chicken, spaghetti, and the iconic Jolly Burger.
                    Open daily until midnight. Delivery in 30 minutes.
                  </p>
                  <div className="showcase-row" style={{ marginBottom: 'var(--space-6)' }}>
                    <Button variant="primary" size="lg">Order Now</Button>
                    <Button variant="secondary" size="lg">Reserve a Table</Button>
                  </div>
                  <div className="open-layout-divider" />
                  <div className="ol-meta">
                    <div className="ol-meta-item">
                      <span className="ol-meta-label">Rating</span>
                      <span className="ol-meta-value">★ 4.8 (2,341)</span>
                    </div>
                    <div className="ol-meta-item">
                      <span className="ol-meta-label">Delivery Time</span>
                      <span className="ol-meta-value">25–35 min</span>
                    </div>
                    <div className="ol-meta-item">
                      <span className="ol-meta-label">Min. Order</span>
                      <span className="ol-meta-value">₱150</span>
                    </div>
                    <div className="ol-meta-item">
                      <span className="ol-meta-label">Status</span>
                      <Badge status="active" dot>Open Now</Badge>
                    </div>
                  </div>
                </div>

                <div className="open-layout-divider" />

                {/* Menu items as open list (no cards) */}
                <p className="showcase-subsection-label" style={{ marginBottom: 'var(--space-5)' }}>Menu Items — Open List Layout</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                  {[
                    { name: 'Chickenjoy (1pc)', desc: 'Crispy fried chicken with gravy', price: '₱99' },
                    { name: 'Jolly Spaghetti', desc: 'Sweet-style pasta with banana catsup sauce', price: '₱75' },
                    { name: 'Yum Burger', desc: 'Classic burger with lettuce and mayo', price: '₱62' },
                    { name: 'Peach Mango Pie', desc: 'Hot crispy pie with peach-mango filling', price: '₱39' },
                  ].map((item, i) => (
                    <div key={item.name} style={{
                      display: 'flex', alignItems: 'center', gap: 'var(--space-5)',
                      padding: 'var(--space-5) 0',
                      borderBottom: i < 3 ? '1px solid var(--border-secondary)' : 'none',
                    }}>
                      <div className="img-placeholder" style={{ width: 72, height: 72, flexShrink: 0, borderRadius: 'var(--radius-md)' }}>
                        <span>🍽</span>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 'var(--space-1)' }}>{item.name}</p>
                        <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' }}>{item.desc}</p>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 'var(--space-2)', flexShrink: 0 }}>
                        <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{item.price}</span>
                        <Button variant="outline" size="sm">Add</Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* Auth layout preview */}
            <section className="showcase-section">
              <div className="showcase-section-header">
                <h2 className="showcase-section-title">Auth Layout</h2>
                <p className="showcase-section-desc">Centered auth panel. Minimal and focused.</p>
              </div>

              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <div style={{
                  width: '100%', maxWidth: 440,
                  background: 'var(--surface-primary)', border: '1px solid var(--border-primary)',
                  borderRadius: 'var(--radius-xl)', padding: 'var(--space-10) var(--space-8)',
                  boxShadow: 'var(--shadow-lg)',
                }}>
                  <div style={{ textAlign: 'center', marginBottom: 'var(--space-8)' }}>
                    <img src={theme === 'dark' ? '/brand/salo-logo-dark.png' : '/brand/salo-logo-light.png'}
                      alt="SALO" style={{ height: 36, objectFit: 'contain', margin: '0 auto' }} />
                  </div>
                  <h2 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 700, marginBottom: 'var(--space-1)', textAlign: 'center' }}>Welcome back</h2>
                  <p style={{ color: 'var(--text-secondary)', textAlign: 'center', marginBottom: 'var(--space-8)', fontSize: 'var(--font-size-sm)' }}>
                    Sign in to your SALO account
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
                    <Input id="auth-email" label="Email" type="email" placeholder="you@example.com" />
                    <Input id="auth-password" label="Password" type="password" placeholder="••••••••" />
                    <Button variant="primary" size="lg" fullWidth>Sign In</Button>
                    <p style={{ textAlign: 'center', fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' }}>
                      Don't have an account?{' '}
                      <a href="#" className="link">Create one</a>
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {/* Responsive demo note */}
            <section className="showcase-section">
              <div className="showcase-section-header">
                <h2 className="showcase-section-title">Responsive Behavior</h2>
                <p className="showcase-section-desc">Resize your browser to see the responsive layout in action.</p>
              </div>
              <Card>
                <CardBody>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                    {[
                      { label: 'Mobile (< 576px)', desc: 'Single column. Compact topbar. Bottom drawer nav.' },
                      { label: 'Tablet (768px – 1023px)', desc: 'Two-column grid. Sidebar hidden, accessible via hamburger.' },
                      { label: 'Desktop (1024px+)', desc: 'Full sidebar + topbar. Multi-column layouts.' },
                      { label: 'Large desktop (1440px+)', desc: 'More breathing room, larger content max-width.' },
                    ].map((bp) => (
                      <div key={bp.label} style={{ display: 'flex', gap: 'var(--space-5)', alignItems: 'flex-start', padding: 'var(--space-4) 0', borderBottom: '1px solid var(--border-secondary)' }}>
                        <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--accent)', fontWeight: 600, minWidth: 200, flexShrink: 0 }}>{bp.label}</span>
                        <span style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' }}>{bp.desc}</span>
                      </div>
                    ))}
                  </div>
                </CardBody>
              </Card>
            </section>
          </div>
        )}

      </div>
    </div>
  );
}

/* ── Nav shell demo component ─────────────────────────── */
function NavShellDemo({ role }) {
  const [activeId, setActiveId] = useState(NAV_CONFIGS[role]?.[0]?.id);
  const [collapsed, setCollapsed] = useState(false);
  const { theme } = useTheme();

  const logoSrc = theme === 'dark' ? '/brand/salo-logo-dark.png' : '/brand/salo-logo-light.png';
  const iconSrc = '/brand/salo-icon.png';
  const items = NAV_CONFIGS[role] || [];
  const activeItem = items.find(i => i.id === activeId);

  return (
    <div className="nav-demo-shell">
      {/* Sidebar */}
      <div className="nav-demo-sidebar" style={{ width: collapsed ? 76 : 220 }}>
        {/* header */}
        <div style={{
          height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: collapsed ? '0 16px' : '0 16px', borderBottom: '1px solid var(--nav-border)', flexShrink: 0,
        }}>
          <img src={collapsed ? iconSrc : logoSrc} alt="SALO" style={{ height: 24, objectFit: 'contain' }} />
          <button onClick={() => setCollapsed(v => !v)} style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points={collapsed ? '9 18 15 12 9 6' : '15 18 9 12 15 6'} />
            </svg>
          </button>
        </div>
        {/* items */}
        <div style={{ padding: '8px 8px', flex: 1, overflowY: 'auto' }}>
          {items.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveId(item.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: collapsed ? '0' : '8px 12px',
                width: collapsed ? 44 : '100%', height: 40,
                margin: collapsed ? '2px auto' : '2px 0',
                borderRadius: 8, border: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: item.id === activeId ? 600 : 500,
                background: item.id === activeId ? 'var(--nav-item-active-bg)' : 'transparent',
                color: item.id === activeId ? 'var(--nav-item-active-text)' : 'var(--text-secondary)',
                justifyContent: collapsed ? 'center' : 'flex-start',
                whiteSpace: 'nowrap', overflow: 'hidden',
              }}
              title={collapsed ? item.label : undefined}
            >
              {item.icon}
              {!collapsed && <span>{item.label}</span>}
              {!collapsed && item.badge !== undefined && (
                <span style={{ marginLeft: 'auto', background: 'var(--accent)', color: '#fff', borderRadius: 99, padding: '1px 7px', fontSize: 11, fontWeight: 700 }}>{item.badge}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Main */}
      <div className="nav-demo-main">
        <div className="nav-demo-topbar">
          <span style={{ color: 'var(--text-secondary)', fontSize: 13, fontWeight: 500 }}>{activeItem?.label || 'Dashboard'}</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
            <ThemeToggle />
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--accent-subtle)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>
              {role === 'customer' ? 'MS' : role === 'admin' ? 'AD' : role === 'owner' ? 'RO' : 'RD'}
            </div>
          </div>
        </div>
        <div className="nav-demo-content">
          <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>
            {capitalize(role)} Dashboard
          </p>
          <p style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4, letterSpacing: '-0.02em' }}>
            {activeItem?.label || 'Overview'}
          </p>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            This is where the {capitalize(role)} {activeItem?.label?.toLowerCase() || 'content'} content will appear.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 20 }}>
            {[0,1,2].map(i => <div key={i} className="skeleton" style={{ height: 64, borderRadius: 10 }} />)}
          </div>
          <div className="skeleton" style={{ height: 120, marginTop: 16, borderRadius: 10 }} />
        </div>
      </div>
    </div>
  );
}

/* ── Helper data ───────────────────────────────────────── */
const mkIcon = (path) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
    <path d={path} />
  </svg>
);

const NAV_CONFIGS = {
  customer: [
    { id: 'home',    label: 'Home',         icon: mkIcon(ICONS.home),        section: '' },
    { id: 'orders',  label: 'My Orders',    icon: mkIcon(ICONS.orders),      badge: 2 },
    { id: 'reserve', label: 'Reservations', icon: mkIcon(ICONS.reservation) },
    { id: 'profile', label: 'Profile',      icon: mkIcon(ICONS.users),       section: 'Account' },
    { id: 'settings',label: 'Settings',     icon: mkIcon(ICONS.settings) },
  ],
  owner: [
    { id: 'dash',   label: 'Dashboard',    icon: mkIcon(ICONS.analytics),   section: '' },
    { id: 'orders', label: 'Orders',       icon: mkIcon(ICONS.orders),      badge: 5 },
    { id: 'menu',   label: 'Menu Manager', icon: mkIcon(ICONS.menu) },
    { id: 'reserv', label: 'Reservations', icon: mkIcon(ICONS.reservation) },
    { id: 'profile',label: 'Restaurant Profile', icon: mkIcon(ICONS.restaurant), section: 'Setup' },
    { id: 'set',    label: 'Settings',     icon: mkIcon(ICONS.settings) },
  ],
  rider: [
    { id: 'active', label: 'Active Delivery', icon: mkIcon(ICONS.rider),    section: '' },
    { id: 'history',label: 'Delivery History', icon: mkIcon(ICONS.orders) },
    { id: 'map',    label: 'Live Map',       icon: mkIcon(ICONS.map) },
    { id: 'earn',   label: 'Earnings',       icon: mkIcon(ICONS.analytics),  section: 'Account' },
    { id: 'profile',label: 'Profile',        icon: mkIcon(ICONS.users) },
  ],
  admin: [
    { id: 'dash',   label: 'Overview',    icon: mkIcon(ICONS.analytics),    section: '' },
    { id: 'users',  label: 'Users',       icon: mkIcon(ICONS.users),        badge: 12 },
    { id: 'rests',  label: 'Restaurants', icon: mkIcon(ICONS.restaurant) },
    { id: 'orders', label: 'All Orders',  icon: mkIcon(ICONS.orders) },
    { id: 'riders', label: 'Riders',      icon: mkIcon(ICONS.rider) },
    { id: 'set',    label: 'System',      icon: mkIcon(ICONS.settings),     section: 'Admin' },
  ],
};

const ROLE_BADGE = {
  customer: 'primary',
  owner: 'success',
  rider: 'info',
  admin: 'warning',
};

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
