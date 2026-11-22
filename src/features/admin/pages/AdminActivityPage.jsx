import { useEffect, useMemo, useState } from 'react';
import AdminLayout from '../../../layouts/AdminLayout';
import adminApiService from '../../../services/adminApiService';
import { DataTable, DetailDrawer, FilterBar, PageHeader, StateView, StatusBadge } from '../components';
import useAdminSession from '../contexts/useAdminSession';
import { useAdminPageSearch } from '../contexts/useAdminSearch';
import { classifyAuditDisplay } from '../utils/auditDisplay';
import { formatDateTime } from '../utils/format';

function recordSummary(record) {
  if (!record) return '—';
  return typeof record === 'string' ? record : `${record.type || 'Record'} · ${record.id || '—'}`;
}

function valueSummary(value) {
  if (value === null || value === undefined || value === '') return '—';
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function humanizeAction(action) {
  if (!action) return 'Unknown action';
  return String(action)
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (ch) => ch.toUpperCase())
    .replace(/\bOtp\b/g, 'OTP')
    .replace(/\bId\b/g, 'ID');
}

function getActionTone(action = '') {
  const lower = String(action).toLowerCase();
  if (/(delete|remove|reject|suspend|fail|revoke|cancel)/.test(lower)) return 'danger';
  if (/(verify|verified|approve|approved|create|created|complete|completed|activate)/.test(lower)) return 'success';
  if (/(update|edit|change|sent|submit|submitted)/.test(lower)) return 'info';
  return 'neutral';
}

function getInitials(name) {
  const parts = String(name || 'S').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'S';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export default function AdminActivityPage() {
  const { permissions } = useAdminSession();
  const { query: globalQuery } = useAdminPageSearch({ scopeLabel: 'Activity Logs', placeholder: 'Search logs by actor, action, record, or reference', searchableFields: ['who', 'role', 'action', 'record', 'reference'] });
  const [records, setRecords] = useState([]);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [action, setAction] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [selected, setSelected] = useState(null);
  const canExport = permissions.activity?.includes('export');

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await adminApiService.getAuditLogs({ per_page: 50 });
        if (!active) return;
        const mapped = (res.items || []).map((log) => ({
          id: log.log_id,
          who: [log.first_name, log.last_name].filter(Boolean).join(' ') || log.actor_email || 'System',
          role: log.actor_email ? 'User' : 'System',
          action: log.action,
          record: { type: log.entity_type, id: log.entity_id },
          time: log.created_at,
          createdAt: log.created_at,
          previousValue: log.old_values,
          newValue: log.new_values,
          reason: log.reason,
          reference: `${log.entity_type}#${log.entity_id}`,
        }));
        setRecords(mapped);
      } catch {
        // leave empty on error
      }
    })();
    return () => {
      active = false;
    };
  }, []);

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
  }

  const columns = [
    { key: 'who', label: 'Actor', render: (item) => <strong className="admin-table-actor">{item.who || '—'}</strong> },
    { key: 'role', label: 'Role', render: (item) => <StatusBadge status={item.role} /> },
    {
      key: 'action',
      label: 'Action',
      render: (item) => (
        <span className={`admin-audit-action-badge is-${getActionTone(item.action)}`}>
          {humanizeAction(item.action)}
        </span>
      ),
    },
    {
      key: 'record',
      label: 'Affected record',
      render: (item) => (
        <span className="admin-audit-record-chip">
          <span className="admin-audit-entity-type">{item.record?.type || 'Record'}</span>
          <code className="admin-audit-entity-id">#{item.record?.id || '—'}</code>
        </span>
      ),
    },
    { key: 'time', label: 'Timestamp', render: (item) => formatDateTime(item.time || item.createdAt) },
    {
      key: 'reference',
      label: 'Reference',
      render: (item) => <code className="admin-audit-code-inline">{item.reference || item.record?.id || '—'}</code>,
    },
    { key: 'details', label: 'Details', render: (item) => <button className="admin-action-button admin-action-button--accent" type="button" onClick={() => setSelected(item)}>View details</button> },
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
        {selected && (() => {
          const { mode, prevFormatted, nextFormatted, hasEventContext } = classifyAuditDisplay(selected);
          const actionTone = getActionTone(selected.action);
          const recordType = selected.record?.type || 'Record';
          const recordId = selected.record?.id || '—';

          return (
            <div className="admin-audit-modal">
              <div className="admin-audit-hero">
                <div className="admin-audit-actor">
                  <span className="admin-audit-avatar" aria-hidden="true">
                    {getInitials(selected.who)}
                  </span>
                  <div className="admin-audit-actor-copy">
                    <div className="admin-audit-actor-row">
                      <span className="admin-audit-value-strong">{selected.who || '—'}</span>
                      <StatusBadge status={selected.role || 'User'} />
                    </div>
                    <span className="admin-audit-submeta">
                      Ref <code className="admin-audit-code-plain">{selected.reference || selected.record?.id || '—'}</code>
                    </span>
                  </div>
                </div>

                <div className="admin-audit-time">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                  <span>{formatDateTime(selected.time || selected.createdAt)}</span>
                </div>
              </div>

              <div className="admin-audit-meta-grid">
                <div className="admin-audit-field">
                  <span className="admin-audit-label">Action</span>
                  <div className="admin-audit-action-group">
                    <span className={`admin-audit-action-badge is-${actionTone}`}>
                      {humanizeAction(selected.action)}
                    </span>
                    {selected.action && (
                      <code className="admin-audit-code-inline">{selected.action}</code>
                    )}
                  </div>
                </div>

                <div className="admin-audit-field">
                  <span className="admin-audit-label">Affected record</span>
                  <div className="admin-audit-record-chip">
                    <span className="admin-audit-entity-type">{recordType}</span>
                    <code className="admin-audit-entity-id">#{recordId}</code>
                  </div>
                </div>

                <div className="admin-audit-field admin-audit-field--full">
                  <span className="admin-audit-label">Reason</span>
                  <p className={`admin-audit-reason ${!selected.reason ? 'is-muted' : ''}`}>
                    {selected.reason || 'Not recorded'}
                  </p>
                </div>
              </div>

              <div className="admin-audit-diff-section">
                {mode === 'diff' ? (
                  <>
                    <h3 className="admin-audit-section-title">Value changes</h3>
                    <div className="admin-audit-diff-grid">
                      <div className="admin-audit-diff-card is-previous">
                        <div className="admin-audit-diff-head">
                          <span>Previous value</span>
                        </div>
                        <div className="admin-audit-diff-body">
                          {prevFormatted.isEmpty ? (
                            <span className="admin-audit-empty-val">No previous value</span>
                          ) : prevFormatted.isJson ? (
                            <pre className="admin-audit-pre">{prevFormatted.text}</pre>
                          ) : (
                            <p className="admin-audit-plain">{prevFormatted.text}</p>
                          )}
                        </div>
                      </div>

                      <div className="admin-audit-diff-card is-new">
                        <div className="admin-audit-diff-head">
                          <span>New value</span>
                        </div>
                        <div className="admin-audit-diff-body">
                          {nextFormatted.isEmpty ? (
                            <span className="admin-audit-empty-val">No new value</span>
                          ) : nextFormatted.isJson ? (
                            <pre className="admin-audit-pre">{nextFormatted.text}</pre>
                          ) : (
                            <p className="admin-audit-plain">{nextFormatted.text}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <h3 className="admin-audit-section-title">Event details</h3>
                    <div className="admin-audit-event-note">
                      <p className="admin-audit-plain">
                        {selected.reason || 'Event logged without record field modifications.'}
                      </p>
                    </div>
                    {hasEventContext && (
                      <div className="admin-audit-diff-card">
                        <div className="admin-audit-diff-head">
                          <span>Event context</span>
                        </div>
                        <div className="admin-audit-diff-body">
                          {nextFormatted.isJson ? (
                            <pre className="admin-audit-pre">{nextFormatted.text}</pre>
                          ) : (
                            <p className="admin-audit-plain">{nextFormatted.text}</p>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })()}
      </DetailDrawer>
    </AdminLayout>
  );
}
