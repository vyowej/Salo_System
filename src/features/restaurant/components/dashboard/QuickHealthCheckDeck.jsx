import { useState } from 'react';
import StatCard from './OwnerDashboardStatCard';
import { formatPeso } from '../../utils/ownerDashboardUtils';

const SLIDES = [
  {
    id: 'sales',
    label: 'Sales',
    eyebrow: 'Revenue Pulse',
    title: 'Sales performance',
    photoSrc: '/assets/owner-health/sale-banner.jpg',
    photoAlt: 'Restaurant sales overview',
  },
  {
    id: 'operations',
    label: 'Operations',
    eyebrow: 'Live Floor & Queue',
    title: 'Orders & table capacity',
    photoSrc: '/assets/owner-health/operations-banner.jpg',
    photoAlt: 'Kitchen orders and dining tables',
  },
  {
    id: 'inventory',
    label: 'Inventory',
    eyebrow: 'Menu & Stock',
    title: 'Stock health',
    photoSrc: '/assets/owner-health/inventory-banner.jpg',
    photoAlt: 'Kitchen inventory and menu stock',
  },
];

function AnimatedSalesGraph({ today, week, month }) {
  const maxVal = Math.max(today, week, month, 1);
  const bars = [
    { key: 'Today', value: today, label: formatPeso(today), height: Math.max(12, Math.round((today / maxVal) * 44)), color: '#F36B2B' },
    { key: 'Week', value: week, label: formatPeso(week), height: Math.max(12, Math.round((week / maxVal) * 44)), color: '#DFA03E' },
    { key: 'Month', value: month, label: formatPeso(month), height: Math.max(12, Math.round((month / maxVal) * 44)), color: '#2E7D32' },
  ];

  return (
    <div className="r7-health-graph" aria-label="Sales comparison chart">
      <svg viewBox="0 0 240 86" className="r7-health-svg" role="img" aria-label="Revenue bar chart">
        <line x1="12" y1="18" x2="228" y2="18" stroke="var(--border-secondary)" strokeDasharray="3 3" strokeWidth="1" />
        <line x1="12" y1="42" x2="228" y2="42" stroke="var(--border-secondary)" strokeDasharray="3 3" strokeWidth="1" />
        <line x1="12" y1="66" x2="228" y2="66" stroke="var(--border-primary)" strokeWidth="1.5" />
        {bars.map((bar, index) => {
          const x = 32 + index * 68;
          const y = 66 - bar.height;
          return (
            <g key={bar.key} className="r7-health-bar-group" style={{ animationDelay: `${index * 90}ms` }}>
              <text x={x + 20} y={y - 5} textAnchor="middle" className="r7-health-value-label">
                {bar.label}
              </text>
              <rect
                x={x}
                y={y}
                width="40"
                height={bar.height}
                rx="6"
                fill={bar.color}
                className="r7-health-bar"
              />
              <text x={x + 20} y="80" textAnchor="middle" className="r7-health-axis-label">
                {bar.key}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function AnimatedOperationsGraph({ pendingOrders, todayReservations, availableTables }) {
  const metrics = [
    { key: 'Pending', value: Number(pendingOrders) || 0, color: '#F36B2B' },
    { key: 'Booked', value: Number(todayReservations) || 0, color: '#DFA03E' },
    { key: 'Tables', value: Number(availableTables) || 0, color: '#2E7D32' },
  ];
  const maxVal = Math.max(...metrics.map((m) => m.value), 1);

  return (
    <div className="r7-health-graph" aria-label="Operations activity chart">
      <div className="r7-health-meter-list">
        {metrics.map((metric, index) => {
          const width = Math.max(10, Math.round((metric.value / maxVal) * 100));
          return (
            <div key={metric.key} className="r7-health-meter-row" style={{ animationDelay: `${index * 80}ms` }}>
              <div className="r7-health-meter-labels">
                <span>{metric.key}</span>
                <strong>{metric.value}</strong>
              </div>
              <div className="r7-health-meter-track">
                <div
                  className="r7-health-meter-fill"
                  style={{ width: `${width}%`, background: metric.color }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AnimatedInventoryGraph({ lowStock, soldOut }) {
  const low = Number(lowStock) || 0;
  const out = Number(soldOut) || 0;
  const totalAlerts = low + out;
  const lowPct = totalAlerts > 0 ? Math.round((low / totalAlerts) * 100) : 0;
  const outPct = totalAlerts > 0 ? 100 - lowPct : 0;

  return (
    <div className="r7-health-graph" aria-label="Stock alert breakdown">
      <div className="r7-health-donut-wrap">
        <svg viewBox="0 0 100 100" className="r7-health-donut" role="img" aria-label="Stock health indicator">
          <circle cx="50" cy="50" r="36" fill="none" stroke="var(--surface-secondary)" strokeWidth="10" />
          <circle
            cx="50"
            cy="50"
            r="36"
            fill="none"
            stroke={totalAlerts === 0 ? '#2E7D32' : '#DFA03E'}
            strokeWidth="10"
            strokeDasharray={`${totalAlerts === 0 ? 226 : Math.max(20, (lowPct / 100) * 226)} 226`}
            strokeLinecap="round"
            transform="rotate(-90 50 50)"
            className="r7-health-donut-ring"
          />
          {out > 0 && (
            <circle
              cx="50"
              cy="50"
              r="36"
              fill="none"
              stroke="#DC2626"
              strokeWidth="10"
              strokeDasharray={`${Math.max(16, (outPct / 100) * 226)} 226`}
              strokeDashoffset={-((lowPct / 100) * 226)}
              strokeLinecap="round"
              transform="rotate(-90 50 50)"
            />
          )}
          <text x="50" y="48" textAnchor="middle" className="r7-health-donut-val">
            {totalAlerts}
          </text>
          <text x="50" y="61" textAnchor="middle" className="r7-health-donut-sub">
            {totalAlerts === 0 ? 'Healthy' : 'Alerts'}
          </text>
        </svg>
      </div>
    </div>
  );
}

function SlideVisualFallback({ slideId }) {
  if (slideId === 'sales') {
    return (
      <div className="r7-health-visual-fallback is-sales" aria-hidden="true">
        <span className="r7-health-orb r7-health-orb--1" />
        <span className="r7-health-orb r7-health-orb--2" />
        <span className="r7-health-visual-badge">₱</span>
      </div>
    );
  }
  if (slideId === 'operations') {
    return (
      <div className="r7-health-visual-fallback is-ops" aria-hidden="true">
        <span className="r7-health-orb r7-health-orb--1" />
        <span className="r7-health-orb r7-health-orb--2" />
        <span className="r7-health-visual-badge">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
            <rect x="9" y="3" width="6" height="4" rx="1" />
          </svg>
        </span>
      </div>
    );
  }
  return (
    <div className="r7-health-visual-fallback is-inv" aria-hidden="true">
      <span className="r7-health-orb r7-health-orb--1" />
      <span className="r7-health-orb r7-health-orb--2" />
      <span className="r7-health-visual-badge">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
        </svg>
      </span>
    </div>
  );
}

export default function QuickHealthCheckDeck({ stats, summary, summaryWarnings = [] }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [failedImages, setFailedImages] = useState({});

  const activeSlide = SLIDES[activeIndex];
  const goPrev = () => setActiveIndex((idx) => (idx - 1 + SLIDES.length) % SLIDES.length);
  const goNext = () => setActiveIndex((idx) => (idx + 1) % SLIDES.length);

  return (
    <section className="r7-dashboard-additions" aria-label="Additional restaurant summaries">
      <div className="r7-dashboard-additions-heading">
        <div>
          <p className="r7-eyebrow">QUICK HEALTH CHECK</p>
          <h2 className="section-title">More at a glance</h2>
        </div>

        <div className="r7-health-controls">
          <div className="r7-health-tabs" role="tablist" aria-label="Health check categories">
            {SLIDES.map((slide, idx) => (
              <button
                key={slide.id}
                type="button"
                role="tab"
                aria-selected={idx === activeIndex}
                className={`r7-health-tab ${idx === activeIndex ? 'is-active' : ''}`.trim()}
                onClick={() => setActiveIndex(idx)}
              >
                {slide.label}
              </button>
            ))}
          </div>

          <div className="r7-health-nav-btns">
            <button type="button" className="r7-health-nav-btn" onClick={goPrev} aria-label="Previous summary">
              ←
            </button>
            <button type="button" className="r7-health-nav-btn is-next" onClick={goNext}>
              Next →
            </button>
          </div>
        </div>
      </div>

      <div key={activeSlide.id} className="r7-health-deck-card" role="tabpanel" aria-label={activeSlide.title}>
        <div className="r7-health-deck-left">
          <div className="r7-health-visual-slot">
            {!failedImages[activeSlide.id] ? (
              <img
                src={activeSlide.photoSrc}
                alt={activeSlide.photoAlt}
                className="r7-health-photo"
                onError={() => setFailedImages((prev) => ({ ...prev, [activeSlide.id]: true }))}
              />
            ) : (
              <SlideVisualFallback slideId={activeSlide.id} />
            )}
            <div className="r7-health-visual-overlay">
              <span className="r7-health-deck-eyebrow">{activeSlide.eyebrow}</span>
              <h3 className="r7-health-deck-title">{activeSlide.title}</h3>
            </div>
          </div>

          {activeSlide.id === 'sales' && (
            <AnimatedSalesGraph
              today={Number(stats.todayRevenue) || 0}
              week={Number(summary?.weeklyRevenue) || 0}
              month={Number(summary?.monthlyRevenue) || 0}
            />
          )}
          {activeSlide.id === 'operations' && (
            <AnimatedOperationsGraph
              pendingOrders={stats.pendingOrders}
              todayReservations={summary?.todayReservations}
              availableTables={summary?.availableTables}
            />
          )}
          {activeSlide.id === 'inventory' && (
            <AnimatedInventoryGraph
              lowStock={summary?.lowStockItems}
              soldOut={summary?.soldOutItems}
            />
          )}
        </div>

        <div className="r7-health-deck-right">
          <div className="r7-health-deck-cards">
            {activeSlide.id === 'sales' && (
              <>
                <StatCard label="Today's Sales" value={formatPeso(stats.todayRevenue)} sub="Open sales reports" tone="gold" icon="₱" to="/owner/reports" />
                <StatCard label="This Week" value={formatPeso(summary?.weeklyRevenue ?? 0)} sub="Sales total · open reports" tone="gold" icon="↗" to="/owner/reports" />
                <StatCard label="This Month" value={formatPeso(summary?.monthlyRevenue ?? 0)} sub="Sales total · open reports" tone="gold" icon="▦" to="/owner/reports" />
              </>
            )}
            {activeSlide.id === 'operations' && (
              <>
                <StatCard label="Pending Orders" value={stats.pendingOrders} sub="Review orders needing a decision" tone="orange" icon="!" to="/owner/orders" />
                <StatCard label="Today's Reservations" value={summary?.todayReservations ?? 0} sub="Reservations scheduled today" tone="green" icon="⌂" to="/owner/reservations" />
                <StatCard label="Available Tables" value={summary?.availableTables ?? '—'} sub="Current table availability" tone="green" icon="▤" to="/owner/tables" />
              </>
            )}
            {activeSlide.id === 'inventory' && (
              <>
                <StatCard label="Low-Stock Items" value={summary?.lowStockItems ?? '—'} sub={summary?.lowStockItems > 0 ? 'Review items needing attention' : 'Inventory summary'} tone="brown" icon="⚠" iconState="warning" to="/owner/inventory" />
                <StatCard label="Sold-Out Items" value={summary?.soldOutItems ?? '—'} sub="Menu items with zero tracked stock" tone="brown" icon="∅" iconState="danger" to="/owner/menu" />
              </>
            )}
          </div>

          <div className="r7-health-deck-footer">
            <div className="r7-health-dots" aria-hidden="true">
              {SLIDES.map((slide, idx) => (
                <span key={slide.id} className={`r7-health-dot ${idx === activeIndex ? 'is-active' : ''}`.trim()} />
              ))}
            </div>
            <span className="r7-health-slide-count">
              {activeIndex + 1} of {SLIDES.length} · Click a card to open details
            </span>
          </div>
        </div>
      </div>

      {summaryWarnings.length > 0 && (
        <p className="r7-dashboard-warning" role="status">
          Some live summary values are unavailable for this account: {summaryWarnings.join(', ')}.
        </p>
      )}
    </section>
  );
}
