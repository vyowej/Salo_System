import { useMemo, useState } from 'react';
import AdminLayout from '../../../layouts/AdminLayout';
import { DataTable, DetailDrawer, FilterBar, PageHeader, StateView, StatusBadge } from '../components';
import useAdminSession from '../contexts/useAdminSession';
import { useAdminPageSearch } from '../contexts/useAdminSearch';
import { getAdminWorkspaceRecords } from '../mocks';
import { appendAdminAuditLog } from '../utils/auditLog';
import { formatDateTime } from '../utils/format';

function recordSummary(record) {
  if (!record) return '—';
  return typeof record === 'string' ? record : `${record.type || 'Record'} · ${record.id || '—'}`;
}

function valueSummary(value) {
  if (value === null || value === undefined || value === '') return '—';
  return typeof value === 'string' ? value : JSON.stringify(value);
}

export default function AdminActivityPage() {
  const { currentAdmin, permissions } = useAdminSession();
  const { query: globalQuery } = useAdminPageSearch({ scopeLabel: 'Activity Logs', placeholder: 'Search logs by actor, action, record, or reference', searchableFields: ['who', 'role', 'action', 'record', 'reference'] });
  const [records, setRecords] = useState(getAdminWorkspaceRecords('activity'));
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [action, setAction] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [selected, setSelected] = useState(null);
  const canExport = permissions.activity?.includes('export');

  const filtered = useMemo(() => {
    const term = (globalQuery || search).trim().toLowerCase();
    return records.filter((item) => {
      const time = item.time || item.createdAt || '';
      return (!term || `${item.who} ${item.role} ${item.action} ${recordSummary(item.record)} ${item.reference || ''}`.toLowerCase().includes(term))
        && (!role || item.role === role)
        && (!action || item.action === action)
        && (!from || time.slice(0, 10) >= from)
        && (!to || time.slice(0, 10) <= to);
    });
  }, [records, globalQuery, search, role, action, from, to]);

  function exportRecords() {
    if (!canExport) return;
    const rows = filtered.map((item) => ({
      actor: item.who || '',
      role: item.role || '',
      action: item.action || '',
      record: recordSummary(item.record),
      time: formatDateTime(item.time || item.createdAt),
      previousValue: valueSummary(item.previousValue),
      newValue: valueSummary(item.newValue),
      reason: item.reason || '',
      reference: item.reference || recordSummary(item.record),
    }));
    const fields = Object.keys(rows[0] || { actor: '', role: '', action: '', record: '', time: '', previousValue: '', newValue: '', reason: '', reference: '' });
    const csv = [fields.join(','), ...rows.map((row) => fields.map((field) => `"${String(row[field]).replaceAll('"', '""')}"`).join(','))].join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'salo-admin-activity.csv';
    link.click();
    URL.revokeObjectURL(url);
    appendAdminAuditLog({
      who: currentAdmin.name,
      role: currentAdmin.role,
      action: 'Exported activity log',
      record: { type: 'Activity Log', id: 'filtered-results' },
      previousValue: null,
      newValue: `${rows.length} records exported`,
      reason: 'Authorized activity-log export',
      reference: 'salo-admin-activity.csv',
    });
    setRecords(getAdminWorkspaceRecords('activity'));
  }

  const columns = [
    { key: 'who', label: 'Actor' },
    { key: 'role', label: 'Role', render: (item) => <StatusBadge status={item.role} /> },
    { key: 'action', label: 'Action' },
    { key: 'record', label: 'Affected record', render: (item) => recordSummary(item.record) },
    { key: 'time', label: 'Timestamp', render: (item) => formatDateTime(item.time || item.createdAt) },
    { key: 'reference', label: 'Reference', render: (item) => item.reference || item.record?.id || '—' },
    { key: 'details', label: 'Details', render: (item) => <button className="admin-action-button" type="button" onClick={() => setSelected(item)}>View details</button> },
  ];

  return (
    <AdminLayout>
      <section className="admin-shell-page">
        <PageHeader
          title="Activity Logs"
          description="Read-only audit history for administrative actions. Historical records cannot be edited or deleted from this workspace."
          actions={canExport ? <button className="admin-action-button" type="button" onClick={exportRecords}>Export filtered CSV</button> : null}
        />

        <FilterBar search={search} onSearchChange={setSearch} searchLabel="Search actor, action, record, or reference">
          <label className="admin-filter-control">Role<select value={role} onChange={(event) => setRole(event.target.value)}><option value="">All roles</option>{[...new Set(records.map((item) => item.role).filter(Boolean))].map((item) => <option key={item}>{item}</option>)}</select></label>
          <label className="admin-filter-control">Action<select value={action} onChange={(event) => setAction(event.target.value)}><option value="">All actions</option>{[...new Set(records.map((item) => item.action).filter(Boolean))].map((item) => <option key={item}>{item}</option>)}</select></label>
          <label className="admin-filter-control">From<input aria-label="Activity from date" type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
          <label className="admin-filter-control">To<input aria-label="Activity to date" type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
        </FilterBar>
        <StateView state={filtered.length ? 'success' : 'empty'} title="activity log" description="No audit events match the current filters.">
          <DataTable columns={columns} rows={filtered} tableSearch={globalQuery} defaultOrder={[[0, 'desc']]} exportFileName="salo-activity-logs" canExport={canExport} emptyTitle="No audit events" emptyDescription="No audit events match the current filters." />
        </StateView>
      </section>
      <DetailDrawer open={Boolean(selected)} title="Audit record details" onClose={() => setSelected(null)}>
        {selected && (
          <dl className="admin-audit-detail">
            <div><dt>Actor</dt><dd>{selected.who || '—'}</dd></div>
            <div><dt>Role</dt><dd>{selected.role || '—'}</dd></div>
            <div><dt>Action</dt><dd>{selected.action || '—'}</dd></div>
            <div><dt>Affected record</dt><dd>{recordSummary(selected.record)}</dd></div>
            <div><dt>Timestamp</dt><dd>{formatDateTime(selected.time || selected.createdAt)}</dd></div>
            <div><dt>Previous value</dt><dd>{valueSummary(selected.previousValue)}</dd></div>
            <div><dt>New value</dt><dd>{valueSummary(selected.newValue)}</dd></div>
            <div><dt>Reason</dt><dd>{selected.reason || 'Not recorded'}</dd></div>
            <div><dt>Reference</dt><dd>{selected.reference || selected.record?.id || '—'}</dd></div>
          </dl>
        )}
      </DetailDrawer>
    </AdminLayout>
  );
}
