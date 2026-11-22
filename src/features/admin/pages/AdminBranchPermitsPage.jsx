import { useCallback, useEffect, useState } from 'react';
import AdminLayout from '../../../layouts/AdminLayout';
import Badge from '../../../components/common/Badge';
import Button from '../../../components/common/Button';
import { ErrorState, LoadingSpinner } from '../../../components/feedback';
import adminApiService from '../../../services/adminApiService';
import AdminBranchPermitDrawer from '../components/AdminBranchPermitDrawer';
import { formatDateTime } from '../utils/format';
import {
  ADMIN_BRANCH_PERMIT_FILTER_OPTIONS,
  buildAdminBranchPermitQueryParams,
  getAdminBranchPermitBadge,
} from '../utils/branchPermitAdminUtils';

export default function AdminBranchPermitsPage() {
  const [items, setItems] = useState([]);
  const [meta, setMeta] = useState({ current_page: 1, last_page: 1, total: 0 });
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [submittedDate, setSubmittedDate] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedPermitId, setSelectedPermitId] = useState(null);

  const loadQueue = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = buildAdminBranchPermitQueryParams({
        status: statusFilter,
        search,
        submittedDate,
        page,
        perPage: 15,
      });
      const res = await adminApiService.getBranchPermits(params);
      setItems(Array.isArray(res?.items) ? res.items : []);
      setMeta(res?.meta || { current_page: 1, last_page: 1, total: 0 });
    } catch (err) {
      setError(err?.message || 'Unable to load branch permits queue.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search, submittedDate, page]);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  return (
    <AdminLayout>
      <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 'var(--font-size-xl)' }}>Branch Permits</h1>
            <p style={{ margin: '4px 0 0', fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' }}>
              Review Mayor&apos;s / Business Permits and local exemption declarations for additional branches.
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={loadQueue} disabled={loading}>
            Refresh
          </Button>
        </header>

        <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'flex-end', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-primary)', background: 'var(--surface-primary)' }}>
          <div style={{ display: 'grid', gap: 4 }}>
            <label htmlFor="permit-filter-status" style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600 }}>Status</label>
            <select
              id="permit-filter-status"
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              style={{ padding: '8px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-primary)' }}
            >
              {ADMIN_BRANCH_PERMIT_FILTER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'grid', gap: 4, flex: '1 1 220px' }}>
            <label htmlFor="permit-filter-search" style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600 }}>Search</label>
            <input
              id="permit-filter-search"
              type="search"
              value={search}
              placeholder="Brand, branch, owner, or applicant..."
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              style={{ padding: '8px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-primary)' }}
            />
          </div>

          <div style={{ display: 'grid', gap: 4 }}>
            <label htmlFor="permit-filter-date" style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600 }}>Submitted Date</label>
            <input
              id="permit-filter-date"
              type="date"
              value={submittedDate}
              onChange={(e) => { setSubmittedDate(e.target.value); setPage(1); }}
              style={{ padding: '8px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-primary)' }}
            />
          </div>
        </div>

        {loading ? (
          <LoadingSpinner label="Loading branch permits..." />
        ) : error ? (
          <ErrorState description={error} onRetry={loadQueue} />
        ) : items.length === 0 ? (
          <div style={{ padding: 'var(--space-6)', textAlign: 'center', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-secondary)', background: 'var(--surface-primary)' }}>
            <p style={{ margin: 0, color: 'var(--text-secondary)' }}>No branch permits match your current filters.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-primary)', background: 'var(--surface-primary)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--font-size-sm)' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border-primary)', background: 'var(--bg-secondary)' }}>
                  <th style={{ padding: '10px 12px' }}>Branch</th>
                  <th style={{ padding: '10px 12px' }}>Owner / Applicant</th>
                  <th style={{ padding: '10px 12px' }}>Requirement</th>
                  <th style={{ padding: '10px 12px' }}>Status</th>
                  <th style={{ padding: '10px 12px' }}>Submitted</th>
                  <th style={{ padding: '10px 12px' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => {
                  const badge = getAdminBranchPermitBadge(row.permit_status);
                  return (
                    <tr key={row.permit_id} style={{ borderBottom: '1px solid var(--border-secondary)' }}>
                      <td style={{ padding: '10px 12px' }}>
                        <strong>{row.display_name}</strong>
                      </td>
                      <td style={{ padding: '10px 12px' }}>{row.owner_name || '—'}</td>
                      <td style={{ padding: '10px 12px' }}>
                        {row.is_required_locally ? 'Permit file' : 'Exempt declared'}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <Badge variant={badge.variant} size="sm">{badge.label}</Badge>
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        {row.uploaded_at ? formatDateTime(row.uploaded_at) : '—'}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedPermitId(row.permit_id)}
                        >
                          Review
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {meta.last_page > 1 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 'var(--font-size-sm)' }}>
            <span>Page {meta.current_page} of {meta.last_page} ({meta.total} total)</span>
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </Button>
              <Button type="button" variant="outline" size="sm" disabled={page >= meta.last_page} onClick={() => setPage((p) => p + 1)}>
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      <AdminBranchPermitDrawer
        open={Boolean(selectedPermitId)}
        permitId={selectedPermitId}
        onClose={() => setSelectedPermitId(null)}
        onUpdated={() => loadQueue()}
      />
    </AdminLayout>
  );
}
