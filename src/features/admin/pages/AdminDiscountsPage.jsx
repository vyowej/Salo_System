import { useCallback, useEffect, useState } from 'react';
import AdminLayout from '../../../layouts/AdminLayout';
import adminApiService from '../../../services/adminApiService';
import {
  DataTable,
  Modal,
  PageHeader,
  StatusBadge,
  showAdminToast,
} from '../components';
import { useAdminPageSearch } from '../contexts/useAdminSearch';
import { formatDateTime, formatPeso } from '../utils/format';
import './AdminPages.css';

function defaultWindow() {
  const now = new Date();
  const later = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  return {
    starts_at: now.toISOString().slice(0, 16),
    ends_at: later.toISOString().slice(0, 16),
  };
}

export default function AdminDiscountsPage() {
  const { query: globalQuery } = useAdminPageSearch({
    scopeLabel: 'Promos',
    placeholder: 'Search promos by code or name',
    searchableFields: ['promo_code', 'promo_name'],
  });

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(() => ({
    promo_code: '',
    promo_name: '',
    description: '',
    discount_type: 'percentage',
    discount_value: '10',
    minimum_order_amount: '0',
    maximum_discount: '',
    usage_limit: '',
    ...defaultWindow(),
  }));

  const loadPromos = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApiService.getPromos({
        search: search.trim() || undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        per_page: 50,
      });
      setItems(res.items || []);
    } catch (err) {
      showAdminToast(err?.message || 'Unable to load promos.', 'danger');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => {
    loadPromos();
  }, [loadPromos]);

  async function handleCreate(e) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      await adminApiService.createPromo({
        promo_code: form.promo_code.trim().toUpperCase(),
        promo_name: form.promo_name.trim(),
        description: form.description.trim() || null,
        discount_type: form.discount_type,
        funding_source: 'platform',
        discount_value: Number(form.discount_value),
        minimum_order_amount: Number(form.minimum_order_amount || 0),
        maximum_discount: form.maximum_discount !== '' ? Number(form.maximum_discount) : null,
        usage_limit: form.usage_limit !== '' ? Number(form.usage_limit) : null,
        starts_at: form.starts_at,
        ends_at: form.ends_at,
        is_active: true,
      });
      showAdminToast('Promo code created.', 'success');
      setCreateOpen(false);
      setForm({
        promo_code: '',
        promo_name: '',
        description: '',
        discount_type: 'percentage',
        discount_value: '10',
        minimum_order_amount: '0',
        maximum_discount: '',
        usage_limit: '',
        ...defaultWindow(),
      });
      await loadPromos();
    } catch (err) {
      showAdminToast(err?.message || 'Unable to create promo.', 'danger');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(promo) {
    try {
      await adminApiService.updatePromo(promo.promo_id, { is_active: !promo.is_active });
      showAdminToast(
        `${promo.promo_code || promo.promo_name} ${promo.is_active ? 'deactivated' : 'activated'}.`,
        'success',
      );
      await loadPromos();
    } catch (err) {
      showAdminToast(err?.message || 'Unable to update promo.', 'danger');
    }
  }

  const columns = [
    { key: 'promo_code', label: 'Code', render: (row) => <strong>{row.promo_code || 'AUTO'}</strong> },
    { key: 'promo_name', label: 'Campaign' },
    {
      key: 'discount',
      label: 'Discount',
      render: (row) => (row.discount_type === 'percentage' ? `${row.discount_value}%` : formatPeso(row.discount_value)),
    },
    { key: 'minimum_order_amount', label: 'Min Order', align: 'right', render: (row) => formatPeso(row.minimum_order_amount) },
    { key: 'usage', label: 'Used / Limit', render: (row) => `${row.used_count} / ${row.usage_limit ?? '∞'}` },
    { key: 'ends_at', label: 'Ends At', render: (row) => (row.ends_at ? formatDateTime(row.ends_at) : '—') },
    { key: 'is_active', label: 'Status', render: (row) => <StatusBadge status={row.is_active ? 'Active' : 'Inactive'} /> },
  ];

  return (
    <AdminLayout>
      <section className="admin-shell-page">
        <PageHeader
          title={`Discounts and promotions (${items.length})`}
          description="Manage platform-wide promo codes and campaigns."
          actions={
            <button type="button" className="admin-action-button" onClick={() => setCreateOpen(true)}>
              + Create Promo
            </button>
          }
        />

        <div className="admin-filter-bar">
          <label className="admin-filter-control">
            Search
            <input
              aria-label="Search promos"
              placeholder="Code or campaign name"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <label className="admin-filter-control">
            Status
            <select aria-label="Filter promos by status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </label>
        </div>

        <DataTable
          columns={columns}
          rows={items}
          loading={loading}
          tableSearch={globalQuery}
          rowActions={(row) => [
            { label: row.is_active ? 'Deactivate' : 'Activate', onClick: () => toggleActive(row) },
          ]}
          emptyTitle="No promo codes yet"
          emptyDescription="Create a promo code campaign to make it available for customer validation."
        />
      </section>

      <Modal
        open={createOpen}
        onClose={() => !saving && setCreateOpen(false)}
        title="Create Promo Code"
        footer={
          <>
            <button type="button" className="admin-action-button" disabled={saving} onClick={() => setCreateOpen(false)}>
              Cancel
            </button>
            <button type="submit" form="admin-create-promo-form" className="admin-action-button" disabled={saving}>
              {saving ? 'Saving...' : 'Create Promo'}
            </button>
          </>
        }
      >
        <form id="admin-create-promo-form" onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label>
            Promo Code *
            <input
              type="text"
              required
              value={form.promo_code}
              onChange={(e) => setForm((f) => ({ ...f, promo_code: e.target.value.toUpperCase() }))}
              placeholder="e.g. SALO50"
            />
          </label>
          <label>
            Campaign Name *
            <input
              type="text"
              required
              value={form.promo_name}
              onChange={(e) => setForm((f) => ({ ...f, promo_name: e.target.value }))}
              placeholder="e.g. Launch Weekend Discount"
            />
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <label>
              Discount Type
              <select value={form.discount_type} onChange={(e) => setForm((f) => ({ ...f, discount_type: e.target.value }))}>
                <option value="percentage">Percentage (%)</option>
                <option value="fixed_amount">Fixed Amount (PHP)</option>
              </select>
            </label>
            <label>
              Discount Value *
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={form.discount_value}
                onChange={(e) => setForm((f) => ({ ...f, discount_value: e.target.value }))}
              />
            </label>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <label>
              Min Order Amount
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.minimum_order_amount}
                onChange={(e) => setForm((f) => ({ ...f, minimum_order_amount: e.target.value }))}
              />
            </label>
            <label>
              Usage Limit (optional)
              <input
                type="number"
                min="1"
                value={form.usage_limit}
                onChange={(e) => setForm((f) => ({ ...f, usage_limit: e.target.value }))}
              />
            </label>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <label>
              Starts At *
              <input
                type="datetime-local"
                required
                value={form.starts_at}
                onChange={(e) => setForm((f) => ({ ...f, starts_at: e.target.value }))}
              />
            </label>
            <label>
              Ends At *
              <input
                type="datetime-local"
                required
                value={form.ends_at}
                onChange={(e) => setForm((f) => ({ ...f, ends_at: e.target.value }))}
              />
            </label>
          </div>
        </form>
      </Modal>
    </AdminLayout>
  );
}
