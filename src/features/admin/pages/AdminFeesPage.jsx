import { useCallback, useEffect, useState } from 'react';
import Button from '../../../components/common/Button';
import AdminLayout from '../../../layouts/AdminLayout';
import adminApiService from '../../../services/adminApiService';
import { ConfirmDialog, PageHeader, StateView } from '../components';
import { useAdminPageSearch } from '../contexts/useAdminSearch';
import { formatDateTime, formatPeso } from '../utils/format';
import './AdminPages.css';

export default function AdminFeesPage() {
  useAdminPageSearch({ disabled: true });
  const [config, setConfig] = useState(null);
  const [feeInput, setFeeInput] = useState('');
  const [reasonInput, setReasonInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await adminApiService.getFeesConfig();
      setConfig(data);
      setFeeInput(String(data?.flat_delivery_fee_formatted ?? data?.flat_delivery_fee ?? ''));
    } catch (err) {
      setError(err?.message || 'Unable to load delivery fee configuration.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const handleRequestConfirm = (event) => {
    event.preventDefault();
    setFormError('');
    setNotice('');

    const raw = feeInput.trim();
    if (!/^\d+(?:\.\d{1,2})?$/.test(raw)) {
      setFormError('Enter a valid non-negative amount with up to 2 decimal places.');
      return;
    }
    const numeric = Number(raw);
    if (!Number.isFinite(numeric) || numeric < 0 || numeric > 500) {
      setFormError('Flat delivery fee must be between 0.00 and 500.00 PHP.');
      return;
    }
    if (reasonInput.trim().length < 5) {
      setFormError('Please provide a reason of at least 5 characters.');
      return;
    }
    setConfirmOpen(true);
  };

  const handleConfirmSave = async () => {
    setSaving(true);
    setFormError('');
    try {
      const updated = await adminApiService.updateFeesConfig({
        flat_delivery_fee: feeInput.trim(),
        reason: reasonInput.trim(),
      });
      setConfig(updated);
      setFeeInput(String(updated?.flat_delivery_fee_formatted ?? feeInput.trim()));
      setReasonInput('');
      setConfirmOpen(false);
      setNotice('Flat delivery fee updated. Applies to new checkouts only; existing orders remain unchanged.');
      window.dispatchEvent(new CustomEvent('salo:deliveryFeeUpdated', {
        detail: { flat_delivery_fee: Number(updated?.flat_delivery_fee) },
      }));
    } catch (err) {
      setConfirmOpen(false);
      setFormError(err?.message || 'Unable to update flat delivery fee.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminLayout>
      <section className="admin-shell-page">
        <PageHeader
          title="Fees and commissions"
          description="Configure the platform flat delivery fee applied to new delivery checkouts."
        />

        {loading ? (
          <StateView state="loading" title="Loading fee configuration..." />
        ) : error ? (
          <StateView
            state="error"
            title="Unable to load fee configuration"
            description={error}
            action={<Button variant="primary" size="sm" onClick={loadConfig}>Retry</Button>}
          />
        ) : (
          <div className="admin-card" style={{ maxWidth: 640 }}>
            <div style={{ marginBottom: 16 }}>
              <h2 style={{ margin: '0 0 6px', fontSize: '1.05rem' }}>Platform Flat Delivery Fee</h2>
              <p style={{ margin: 0, color: 'var(--color-text-secondary, #6b7280)', fontSize: '0.9rem' }}>
                Current active fee: <strong>{formatPeso(config?.flat_delivery_fee ?? 0)}</strong>{' '}
                ({config?.source === 'platform_settings' ? 'configured in platform settings' : 'default config fallback'})
                {config?.updated_at ? ` · Updated ${formatDateTime(config.updated_at)}` : ''}
              </p>
              <p style={{ margin: '6px 0 0', color: 'var(--color-text-secondary, #6b7280)', fontSize: '0.85rem' }}>
                Changes apply only to new checkouts. Existing orders and past snapshots are never modified.
              </p>
            </div>

            {notice && (
              <div className="admin-inline-notice" role="status" style={{ marginBottom: 12 }}>
                {notice}
              </div>
            )}
            {formError && (
              <div className="admin-inline-error" role="alert" style={{ marginBottom: 12 }}>
                {formError}
              </div>
            )}

            <form onSubmit={handleRequestConfirm} style={{ display: 'grid', gap: 12 }}>
              <label style={{ display: 'grid', gap: 6 }}>
                <span>Flat Delivery Fee (PHP, 0.00 – 500.00)</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="500"
                  value={feeInput}
                  onChange={(e) => setFeeInput(e.target.value)}
                  required
                />
              </label>

              <label style={{ display: 'grid', gap: 6 }}>
                <span>Reason for change (required for audit log)</span>
                <input
                  type="text"
                  minLength={5}
                  maxLength={255}
                  placeholder="e.g. Updated standard Metro Manila delivery rate"
                  value={reasonInput}
                  onChange={(e) => setReasonInput(e.target.value)}
                  required
                />
              </label>

              <div>
                <Button type="submit" variant="primary" disabled={saving}>
                  Save Flat Delivery Fee
                </Button>
              </div>
            </form>
          </div>
        )}

        <ConfirmDialog
          open={confirmOpen}
          title="Confirm Flat Delivery Fee Change"
          description={`Change flat delivery fee from ${formatPeso(config?.flat_delivery_fee ?? 0)} to ${formatPeso(Number(feeInput || 0))}? This will apply immediately to all new delivery checkouts.`}
          confirmLabel={saving ? 'Saving...' : 'Confirm Change'}
          onClose={() => !saving && setConfirmOpen(false)}
          onConfirm={handleConfirmSave}
        />
      </section>
    </AdminLayout>
  );
}
