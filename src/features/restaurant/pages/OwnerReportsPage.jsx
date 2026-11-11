import { useState } from 'react';
import OwnerLayout from '../../../layouts/OwnerLayout';
import Button from '../../../components/common/Button';
import { DesignPreviewBanner, PreviewPageHeader, PreviewStatePanel, StatusBadge } from './team/r7Preview';
import { formatPeso } from './team/r7PreviewUtils';
import { INVENTORY_REPORT, ORDERS_REPORT, REPORT_FILTERS, REPORT_TABS, RESERVATIONS_REPORT, SALES_REPORT } from './team/reportsSamples';
import './team/r7Reports.css';

function TrendChart({ values, labels, title }) {
  const points = values.map((value, index) => `${index * (100 / (values.length - 1))},${100 - value}`).join(' ');
  return <section className="r7-report-card r7-chart-card">
    <div className="r7-card-heading"><div><p className="r7-eyebrow">TREND</p><h2>{title}</h2></div><span className="r7-chart-legend"><i /> Activity</span></div>
    <p className="r7-chart-summary">{title}: {values.map((value, index) => `${labels[index % labels.length]} ${value}`).join(', ')} (sample index).</p>
    <div className="r7-chart-scroll"><svg className="r7-line-chart" viewBox="0 0 100 112" role="img" aria-label={`${title} sample trend: ${values.join(', ')}`} preserveAspectRatio="none">
      {[20, 45, 70, 95].map((y) => <line key={y} x1="0" x2="100" y1={y} y2={y} className="r7-chart-grid" />)}
      <polyline points={points} className="r7-chart-line" />
      {values.map((value, index) => <circle key={index} cx={index * (100 / (values.length - 1))} cy={100 - value} r="1.5" className="r7-chart-point"><title>{labels[index % labels.length]}: {value} sample index</title></circle>)}
    </svg></div>
    <div className="r7-chart-scroll"><div className="r7-chart-labels">{values.map((_, index) => <span key={index}>{labels[index % labels.length]}</span>)}</div></div>
    <div className="r7-chart-data-fallback"><strong>Accessible chart data</strong><div>{values.map((value, index) => <span key={index}>{labels[index % labels.length]}: {value}</span>)}</div></div>
  </section>;
}

function MetricCard({ label, value, note, tone = 'brown', danger = false }) {
  const toneClass = danger ? 'brand-card--danger' : `brand-card--${tone}`;
  return <article className={`r7-metric-card brand-card brand-card--stat ${toneClass}`}><span className="brand-card__label">{label}</span><strong>{value}</strong>{note && <small>{note}</small>}</article>;
}

function RankedList({ title, items, valueLabel = 'Sales' }) {
  const max = Math.max(...items.map((item) => item.value || 0), 1);
  return <section className="r7-report-card"><div className="r7-card-heading"><h2>{title}</h2><span>{valueLabel}</span></div><div className="r7-ranked-list">{items.map((item, index) => <div className="r7-ranked-row" key={item.name}><span className="r7-rank-number">{String(index + 1).padStart(2, '0')}</span><span className="r7-rank-detail"><strong>{item.name}</strong><i><b style={{ width: `${(item.value || 0) / max * 100}%` }} /></i></span><strong>{item.value ? formatPeso(item.value) : item.quantity}</strong></div>)}</div></section>;
}

function SalesTab() {
  return <><div className="r7-metric-grid"><MetricCard label="Today" value={formatPeso(SALES_REPORT.today)} note="Sample sales total" tone="gold" /><MetricCard label="This week" value={formatPeso(SALES_REPORT.weekly)} note="Sample sales total" tone="gold" /><MetricCard label="This month" value={formatPeso(SALES_REPORT.monthly)} note="Sample sales total" tone="gold" /></div><div className="r7-report-grid"><TrendChart values={SALES_REPORT.trend} labels={SALES_REPORT.days} title="Sales trend" /><RankedList title="Sales by menu item" items={SALES_REPORT.items} /><RankedList title="Sales by category" items={SALES_REPORT.categories} /></div></>;
}

function OrdersTab() {
  return <><div className="r7-metric-grid r7-metric-grid-four"><MetricCard label="Total orders" value={ORDERS_REPORT.total.toLocaleString()} tone="orange" /><MetricCard label="Completed" value={ORDERS_REPORT.completed.toLocaleString()} tone="green" /><MetricCard label="Cancelled" value={ORDERS_REPORT.cancelled} danger /><MetricCard label="Rejected" value={ORDERS_REPORT.rejected} danger /></div><div className="r7-report-grid"><TrendChart values={ORDERS_REPORT.trend} labels={['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']} title="Orders trend" /><section className="r7-report-card"><p className="r7-eyebrow">ORDER VALUE</p><h2 className="r7-report-emphasis">{formatPeso(ORDERS_REPORT.average)}</h2><p className="r7-muted">Average order value · sample</p><h3>Popular items</h3><ol className="r7-popular-list">{ORDERS_REPORT.popular.map((item) => <li key={item}>{item}</li>)}</ol></section></div></>;
}

function ReservationsTab() {
  const reservationMetrics = [['Total reservations', RESERVATIONS_REPORT.total, 'green'], ['Confirmed', RESERVATIONS_REPORT.confirmed, 'green'], ['Cancelled', RESERVATIONS_REPORT.cancelled, 'danger'], ['Completed', RESERVATIONS_REPORT.completed, 'green'], ['No-shows', RESERVATIONS_REPORT.noShow, 'danger']];
  return <><div className="r7-metric-grid r7-metric-grid-five">{reservationMetrics.map(([label, value, tone]) => <MetricCard key={label} label={label} value={value} tone={tone === 'danger' ? undefined : tone} danger={tone === 'danger'} />)}</div><div className="r7-report-grid"><TrendChart values={RESERVATIONS_REPORT.trend} labels={['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']} title="Reservation trend" /><section className="r7-report-card"><div className="r7-card-heading"><div><p className="r7-eyebrow">SAMPLE</p><h2>Table utilization</h2></div><span>Bookings</span></div><div className="r7-utilization-list">{RESERVATIONS_REPORT.utilization.map((table) => <div key={table.table}><span>{table.table}</span><i><b style={{ width: `${table.value}%` }} /></i><strong>{table.value}%</strong></div>)}</div><p className="r7-muted">Sample utilization view; actual utilization depends on selected dates and branch.</p></section></div></>;
}

function InventoryTab() {
  return <><div className="r7-metric-grid"><MetricCard label="Tracked items" value={INVENTORY_REPORT.currentItems} note="Across all categories" tone="brown" /><MetricCard label="Low stock" value={INVENTORY_REPORT.low.length} note="Needs attention" tone="brown" /><MetricCard label="Out of stock" value={INVENTORY_REPORT.out.length} note="Unavailable items" tone="brown" /></div><div className="r7-report-grid"><section className="r7-report-card"><div className="r7-card-heading"><h2>Low & out of stock</h2><StatusBadge status="Pending" /></div><h3>Low stock</h3><ul className="r7-stock-list">{INVENTORY_REPORT.low.map((name) => <li key={name}><span>{name}</span><StatusBadge status="Pending" /></li>)}</ul><h3>Out of stock</h3><ul className="r7-stock-list">{INVENTORY_REPORT.out.map((name) => <li key={name}><span>{name}</span><StatusBadge status="Inactive" /></li>)}</ul></section><RankedList title="Most-used items" items={INVENTORY_REPORT.mostUsed} valueLabel="Usage" /><section className="r7-report-card"><h2>Recent movements</h2><ul className="r7-movement-list">{INVENTORY_REPORT.movements.map((item) => <li key={`${item.type}-${item.item}`}><span><strong>{item.type}</strong><small>{item.item} · {item.time}</small></span><b>{item.quantity}</b></li>)}</ul></section></div></>;
}

export default function OwnerReportsPage() {
  const [previewState, setPreviewState] = useState('Sample data');
  const [tab, setTab] = useState('Sales');
  const [range, setRange] = useState('7 days');
  const [filters, setFilters] = useState({ branch: 'All branches', status: 'All statuses', category: 'All categories', item: 'All items', fulfillment: 'All methods' });
  const [toast, setToast] = useState('');
  const setFilter = (key, value) => setFilters((current) => ({ ...current, [key]: value }));
  const showToast = (type) => { setToast(`${type} export · Design preview only, no file was generated.`); window.setTimeout(() => setToast(''), 2600); };
  const content = { Sales: <SalesTab />, Orders: <OrdersTab />, Reservations: <ReservationsTab />, Inventory: <InventoryTab /> }[tab];
  return <OwnerLayout>
    <DesignPreviewBanner state={previewState} onStateChange={setPreviewState} />
    <PreviewPageHeader eyebrow="Performance & insights" title="Reports and statistics" detail="Explore sales, orders, reservations and inventory report layouts." />
    <PreviewStatePanel state={previewState} name="reports" onRetry={() => setPreviewState('Sample data')} />
    {previewState === 'Sample data' && <>
      <div className="r7-report-filterbar"><label className="r7-report-filter">Date range<select value={range} onChange={(event) => setRange(event.target.value)}>{REPORT_FILTERS.ranges.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label className="r7-report-filter">Branch<select value={filters.branch} onChange={(event) => setFilter('branch', event.target.value)}>{REPORT_FILTERS.branches.map((item) => <option key={item}>{item}</option>)}</select></label>
        {tab !== 'Inventory' && <label className="r7-report-filter">Order status<select value={filters.status} onChange={(event) => setFilter('status', event.target.value)}>{REPORT_FILTERS.orderStatuses.map((item) => <option key={item}>{item}</option>)}</select></label>}
        <label className="r7-report-filter">Category<select value={filters.category} onChange={(event) => setFilter('category', event.target.value)}>{REPORT_FILTERS.categories.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label className="r7-report-filter">Menu item<select value={filters.item} onChange={(event) => setFilter('item', event.target.value)}>{REPORT_FILTERS.items.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label className="r7-report-filter">Fulfillment<select value={filters.fulfillment} onChange={(event) => setFilter('fulfillment', event.target.value)}>{REPORT_FILTERS.fulfillment.map((item) => <option key={item}>{item}</option>)}</select></label>
        {range === 'Custom' && <div className="r7-custom-range"><label className="r7-report-filter">From<input type="date" aria-label="Custom date range start" /></label><label className="r7-report-filter">To<input type="date" aria-label="Custom date range end" /></label></div>}
        <div className="r7-export-actions"><Button variant="outline" onClick={() => showToast('CSV')}>Export CSV</Button><Button variant="outline" onClick={() => showToast('PDF')}>Export PDF</Button></div>
      </div>
      <div className="r7-tabs r7-report-tabs" role="tablist" aria-label="Report category">{REPORT_TABS.map((item) => <button type="button" role="tab" aria-selected={tab === item} className={tab === item ? 'is-selected' : ''} key={item} onClick={() => setTab(item)}>{item}</button>)}</div>
      {content}
      <p className="r7-report-disclaimer">Filters, charts, metrics and export controls are design samples only; no report query or export is connected.</p>
    </>}
    {toast && <div className="r7-toast" role="status">{toast}</div>}
  </OwnerLayout>;
}
