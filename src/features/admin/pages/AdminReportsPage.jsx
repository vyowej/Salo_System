import { useMemo, useState } from 'react';
import AdminLayout from '../../../layouts/AdminLayout';
import { DataTable, PageHeader, StatCard, Tabs } from '../components';
import useAdminSession from '../contexts/useAdminSession';
import { ADMIN_MOCK_DATA, getAdminReportData, getReportFilterOptions } from '../mocks';
import { appendAdminAuditLog } from '../utils/auditLog';
import { formatPeso } from '../utils/format';

const REPORT_TYPES = ['Platform', 'Financial', 'Restaurant', 'Rider', 'Customer', 'Discount', 'Location'];
const INITIAL_FILTERS = {
  range: 'This Month',
  from: '',
  to: '',
  city: '',
  zone: '',
  restaurantId: '',
  riderId: '',
  status: '',
  paymentMethod: '',
  promotion: '',
  transactionType: '',
};
function labelFor(value) {
  return value.replace(/([A-Z])/g, ' $1').replace(/^./, (letter) => letter.toUpperCase());
}

function escapeCsv(value) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

export default function AdminReportsPage() {
  const { currentAdmin, permissions } = useAdminSession();
  const [reportType, setReportType] = useState('Platform');
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const filterOptions = getReportFilterOptions();
  const report = useMemo(() => getAdminReportData(reportType, filters), [reportType, filters]);
  const rows = report.rows || [];
  const canExport = permissions.reports?.includes('export');
  const columns = rows.length ? Object.keys(rows[0]).map((key) => ({
    key,
    label: labelFor(key),
    render: (row) => {
      const value = row[key];
      const moneyValue = (reportType === 'Financial' && key === 'value' && row.metric !== 'Refund records' && row.metric !== 'Reservations')
        || (reportType === 'Platform' && row.metric === 'Average order value')
        || (reportType === 'Rider' && key === 'earnings')
        || (reportType === 'Discount' && ['discountTotal', 'platformFunded', 'restaurantFunded'].includes(key))
        || (reportType === 'Location' && ['gmv', 'platformRevenue'].includes(key));
      if (moneyValue && typeof value === 'number') return formatPeso(value);
      if (key === 'status') return <span>{value}</span>;
      return value ?? '—';
    },
  })) : [];

  function updateFilter(key, value) {
    setFilters((previous) => ({ ...previous, [key]: value }));
  }

  function recordExport(format) {
    appendAdminAuditLog({
      who: currentAdmin.name,
      role: currentAdmin.role,
      action: `Exported ${reportType.toLowerCase()} report`,
      record: { type: 'Report', id: reportType },
      time: new Date().toISOString(),
      previousValue: null,
      newValue: `${rows.length} rows · ${format}`,
      reason: `Authorized ${format} export`,
      reference: `admin-${reportType.toLowerCase()}-report`,
    });
  }

  function downloadCsv() {
    if (!canExport || !columns.length) return;
    const header = columns.map((column) => escapeCsv(column.label)).join(',');
    const body = rows.map((row) => columns.map((column) => escapeCsv(row[column.key])).join(','));
    const blob = new Blob([[header, ...body].join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `salo-${reportType.toLowerCase()}-report.csv`;
    link.click();
    URL.revokeObjectURL(url);
    recordExport('CSV (Excel-compatible)');
  }

  function printPdf() {
    if (!canExport) return;
    recordExport('print / PDF');
    window.print();
  }

  return (
    <AdminLayout>
      <section className="admin-shell-page admin-report-page">
        <PageHeader
          title="Reports and Analytics"
          description="Explore platform, financial, restaurant, rider, customer, discount, and location performance using shared demo records."
          actions={canExport ? <>
            <button className="admin-action-button" type="button" onClick={downloadCsv} disabled={!rows.length}>Download CSV (Excel-compatible)</button>
            <button className="admin-action-button" type="button" onClick={printPdf}>Print / Save PDF</button>
          </> : null}
        />
        <p className="admin-shell-note">{report.message} Exports use the filtered report and are recorded in the browser-local audit log. Customer report rows are aggregated and omit direct identifiers. Use browser print and “Save as PDF” for PDF output.</p>
        <Tabs items={REPORT_TYPES} value={reportType} onChange={setReportType} label="Report type" />
        <div className="admin-filter-bar">
          <label className="admin-filter-control">Date range<select value={filters.range} onChange={(event) => updateFilter('range', event.target.value)}>{['Today', 'Yesterday', 'This Week', 'This Month', 'This Year', 'Custom Date Range'].map((item) => <option key={item}>{item}</option>)}</select></label>
          {filters.range === 'Custom Date Range' && <>
            <label className="admin-filter-control">From<input aria-label="Report start date" type="date" value={filters.from} onChange={(event) => updateFilter('from', event.target.value)} /></label>
            <label className="admin-filter-control">To<input aria-label="Report end date" type="date" value={filters.to} onChange={(event) => updateFilter('to', event.target.value)} /></label>
          </>}
          <label className="admin-filter-control">City<select value={filters.city} onChange={(event) => updateFilter('city', event.target.value)}><option value="">All cities</option>{filterOptions.cities.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label className="admin-filter-control">Service zone<select value={filters.zone} onChange={(event) => updateFilter('zone', event.target.value)}><option value="">All zones</option><option>Unassigned</option>{ADMIN_MOCK_DATA.serviceAreas.flatMap((area) => area.zones.map((zone) => zone.name)).map((item) => <option key={item}>{item}</option>)}</select></label>
          <label className="admin-filter-control">Restaurant<select value={filters.restaurantId} onChange={(event) => updateFilter('restaurantId', event.target.value)}><option value="">All restaurants</option>{filterOptions.restaurants.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label className="admin-filter-control">Rider<select value={filters.riderId} onChange={(event) => updateFilter('riderId', event.target.value)}><option value="">All riders</option>{filterOptions.riders.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label className="admin-filter-control">Order status<select value={filters.status} onChange={(event) => updateFilter('status', event.target.value)}><option value="">All statuses</option>{filterOptions.statuses.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label className="admin-filter-control">Payment method<select value={filters.paymentMethod} onChange={(event) => updateFilter('paymentMethod', event.target.value)}><option value="">All methods</option>{filterOptions.paymentMethods.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label className="admin-filter-control">Promotion<select value={filters.promotion} onChange={(event) => updateFilter('promotion', event.target.value)}><option value="">All promotions</option>{filterOptions.promotions.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label className="admin-filter-control">Transaction type<select value={filters.transactionType} onChange={(event) => updateFilter('transactionType', event.target.value)}><option value="">All transaction types</option><option>COD</option><option>Online</option><option>Reservation</option></select></label>
        </div>
        {report.totals && <div className="admin-stat-grid">
          <StatCard label="Order GMV" value={formatPeso(report.totals.gmv)} hint="Customer order value from snapshots" />
          <StatCard label="Platform revenue" value={formatPeso(report.totals.platformRevenue)} hint="Commissions and fees net of platform-funded discounts" />
          <StatCard label="Restaurant payable" value={formatPeso(report.totals.restaurantPayable)} hint="Stored order-level payable snapshots" />
          <StatCard label="Refunds / adjustments" value={formatPeso(report.totals.refunds)} hint="Recorded refunds and reservation adjustments" />
        </div>}
        <div className="admin-print-heading"><h2>{reportType} report</h2><p>Generated from SALO demo snapshots</p></div>
        <DataTable columns={columns} rows={rows} emptyTitle="No report rows" emptyDescription="No records match the selected filters. Try a broader date range or remove a filter." />
      </section>
    </AdminLayout>
  );
}
