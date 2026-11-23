import { useCallback, useEffect, useState } from 'react';
import OwnerLayout from '../../../layouts/OwnerLayout';
import ownerService from '../../../services/ownerService';
import Button from '../../../components/common/Button';
import Badge from '../../../components/common/Badge';
import { StateView } from '../../../components/feedback';
import { useRestaurantAccess } from '../access/useRestaurantAccess';

const DEFAULT_FORM = {
  promo_code: '',
  promo_name: '',
  description: '',
  discount_type: 'percentage',
  discount_value: '',
  minimum_order_amount: '0',
  maximum_discount: '',
  usage_limit: '',
  starts_at: '',
  ends_at: '',
};

export default function OwnerPromotionsPage() {
  const access = useRestaurantAccess();
  const restaurantId = access.selectedRestaurantId;

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const loadPromos = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await ownerService.getPromos(restaurantId, {
        search: search.trim(),
        status: statusFilter,
      });
      setItems(Array.isArray(data?.items) ? data.items : []);
    } catch (err) {
      setError(err?.message || 'Could not load restaurant promotions.');
    } finally {
      setLoading(false);
    }
  }, [restaurantId, search, statusFilter]);

  useEffect(() => {
    loadPromos();
  }, [loadPromos]);

  const handleCreate = async (e) => {
    e.preventDefault();
    setSaving(true);
    setFormError('');
    try {
      await ownerService.createPromo(restaurantId, {
        promo_code: form.promo_code.trim().toUpperCase(),
        promo_name: form.promo_name.trim(),
        description: form.description.trim() || null,
        discount_type: form.discount_type,
        discount_value: Number(form.discount_value),
        minimum_order_amount: form.minimum_order_amount !== '' ? Number(form.minimum_order_amount) : 0,
        maximum_discount: form.maximum_discount !== '' ? Number(form.maximum_discount) : null,
        usage_limit: form.usage_limit !== '' ? Number(form.usage_limit) : null,
        starts_at: form.starts_at,
        ends_at: form.ends_at,
      });
      setForm(DEFAULT_FORM);
      setShowForm(false);
      await loadPromos();
    } catch (err) {
      setFormError(err?.message || 'Unable to create promo.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (promo) => {
    try {
      await ownerService.updatePromo(restaurantId, promo.promo_id, {
        is_active: !promo.is_active,
      });
      await loadPromos();
    } catch (err) {
      setError(err?.message || 'Unable to update promo status.');
    }
  };

  return (
    <OwnerLayout>
      <div className="owner-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 'var(--space-5)' }}>
        <div>
          <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>
            Marketing & Discounts
          </p>
          <h1 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 700, margin: '4px 0' }}>Promotions</h1>
          <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', margin: 0 }}>
            Create and manage restaurant-funded promo codes for your customers.
          </p>
        </div>
        <Button variant="primary" onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'Close Form' : 'Create Promo'}
        </Button>
      </div>

      {showForm && (
        <form
          onSubmit={handleCreate}
          style={{
            background: 'var(--surface-primary)',
            border: '1px solid var(--border-primary)',
            borderRadius: 'var(--radius-xl)',
            padding: 'var(--space-5)',
            marginBottom: 'var(--space-5)',
            display: 'grid',
            gap: 'var(--space-3)',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          }}
        >
          <div>
            <label className="label">Promo Code *</label>
            <input
              className="input"
              required
              placeholder="e.g. SALO20"
              value={form.promo_code}
              onChange={(e) => setForm((f) => ({ ...f, promo_code: e.target.value.toUpperCase() }))}
            />
          </div>
          <div>
            <label className="label">Promo Name *</label>
            <input
              className="input"
              required
              placeholder="Weekend 20% Off"
              value={form.promo_name}
              onChange={(e) => setForm((f) => ({ ...f, promo_name: e.target.value }))}
            />
          </div>
          <div>
            <label className="label">Discount Type *</label>
            <select
              className="input"
              value={form.discount_type}
              onChange={(e) => setForm((f) => ({ ...f, discount_type: e.target.value }))}
            >
              <option value="percentage">Percentage (%)</option>
              <option value="fixed_amount">Fixed Amount (₱)</option>
            </select>
          </div>
          <div>
            <label className="label">Discount Value *</label>
            <input
              className="input"
              type="number"
              step="0.01"
              min="0.01"
              required
              value={form.discount_value}
              onChange={(e) => setForm((f) => ({ ...f, discount_value: e.target.value }))}
            />
          </div>
          <div>
            <label className="label">Minimum Order (₱)</label>
            <input
              className="input"
              type="number"
              step="0.01"
              min="0"
              value={form.minimum_order_amount}
              onChange={(e) => setForm((f) => ({ ...f, minimum_order_amount: e.target.value }))}
            />
          </div>
          <div>
            <label className="label">Max Discount Cap (₱)</label>
            <input
              className="input"
              type="number"
              step="0.01"
              min="0"
              placeholder="Optional"
              value={form.maximum_discount}
              onChange={(e) => setForm((f) => ({ ...f, maximum_discount: e.target.value }))}
            />
          </div>
          <div>
            <label className="label">Usage Limit</label>
            <input
              className="input"
              type="number"
              min="1"
              placeholder="Unlimited"
              value={form.usage_limit}
              onChange={(e) => setForm((f) => ({ ...f, usage_limit: e.target.value }))}
            />
          </div>
          <div>
            <label className="label">Starts At *</label>
            <input
              className="input"
              type="datetime-local"
              required
              value={form.starts_at}
              onChange={(e) => setForm((f) => ({ ...f, starts_at: e.target.value }))}
            />
          </div>
          <div>
            <label className="label">Ends At *</label>
            <input
              className="input"
              type="datetime-local"
              required
              value={form.ends_at}
              onChange={(e) => setForm((f) => ({ ...f, ends_at: e.target.value }))}
            />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label className="label">Description</label>
            <input
              className="input"
              placeholder="Optional details for customers"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>
          {formError && (
            <div role="alert" style={{ gridColumn: '1 / -1', color: 'var(--status-error-text)', fontSize: 'var(--font-size-xs)' }}>
              {formError}
            </div>
          )}
          <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8 }}>
            <Button type="submit" variant="primary" disabled={saving}>
              {saving ? 'Saving...' : 'Save Promo'}
            </Button>
            <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 'var(--space-4)' }}>
        <input
          className="input"
          placeholder="Search promo code or name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ maxWidth: 280 }}
        />
        <select
          className="input"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{ maxWidth: 160 }}
        >
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      {loading ? (
        <StateView state="loading" title="Loading promotions..." />
      ) : error ? (
        <StateView state="error" title="Could not load promotions" errorDescription={error} onRetry={loadPromos} />
      ) : items.length === 0 ? (
        <StateView
          state="empty"
          title="No promotions yet"
          emptyDescription="Create a restaurant promo code to attract more orders."
        />
      ) : (
        <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
          {items.map((promo) => (
            <div
              key={promo.promo_id}
              style={{
                background: 'var(--surface-primary)',
                border: '1px solid var(--border-primary)',
                borderRadius: 'var(--radius-lg)',
                padding: 'var(--space-4)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 12,
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <strong style={{ fontSize: 'var(--font-size-md)' }}>{promo.promo_code}</strong>
                  <Badge variant={promo.is_active ? 'success' : 'default'}>
                    {promo.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                  <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' }}>
                    {promo.promo_name}
                  </span>
                </div>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>
                  {promo.discount_type === 'percentage'
                    ? `${promo.discount_value}% off`
                    : `₱${Number(promo.discount_value).toFixed(2)} off`}
                  {' · '}Min order ₱{Number(promo.minimum_order_amount || 0).toFixed(2)}
                  {' · '}Used {promo.used_count}{promo.usage_limit ? ` / ${promo.usage_limit}` : ''}
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={() => handleToggleActive(promo)}>
                {promo.is_active ? 'Deactivate' : 'Activate'}
              </Button>
            </div>
          ))}
        </div>
      )}
    </OwnerLayout>
  );
}
