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
  const [baseFeeInput, setBaseFeeInput] = useState('');
  const [baseDistanceInput, setBaseDistanceInput] = useState('');
  const [perExtraKmInput, setPerExtraKmInput] = useState('');
  const [maxFeeInput, setMaxFeeInput] = useState('');
  const [reasonInput, setReasonInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const syncInputs = (data) => {
    setBaseFeeInput(String(data?.base_fee_formatted ?? data?.base_fee ?? data?.flat_delivery_fee_formatted ?? '49.00'));
    setBaseDistanceInput(String(data?.base_distance_km ?? '2'));
    setPerExtraKmInput(String(data?.per_extra_km_formatted ?? data?.per_extra_km ?? '10.00'));
    setMaxFeeInput(String(data?.max_fee_formatted ?? data?.max_fee ?? '150.00'));
  };

  const loadConfig = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await adminApiService.getFeesConfig();
      setConfig(data);
      syncInputs(data);
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

    const baseVal = Number(baseFeeInput.trim());
    const distVal = Number(baseDistanceInput.trim());
    const extraVal = Number(perExtraKmInput.trim());
    const maxVal = Number(maxFeeInput.trim());

    if (!/^\d+(?:\.\d{1,2})?$/.test(baseFeeInput.trim()) || !Number.isFinite(baseVal) || baseVal < 0 || baseVal > 500) {
      setFormError('Base delivery fee must be between 0.00 and 500.00 PHP.');
      return;
    }
    if (!Number.isFinite(distVal) || distVal <= 0 || distVal > 50) {
      setFormError('Base distance must be greater than 0 and at most 50 km.');
      return;
    }
    if (!/^\d+(?:\.\d{1,2})?$/.test(perExtraKmInput.trim()) || !Number.isFinite(extraVal) || extraVal < 0 || extraVal > 200) {
      setFormError('Per extra km fee must be between 0.00 and 200.00 PHP.');
      return;
    }
    if (!/^\d+(?:\.\d{1,2})?$/.test(maxFeeInput.trim()) || !Number.isFinite(maxVal) || maxVal < baseVal || maxVal > 1000) {
      setFormError('Maximum delivery fee must be at least the base fee and at most 1,000.00 PHP.');
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
        base_fee: baseFeeInput.trim(),
        base_distance_km: baseDistanceInput.trim(),
        per_extra_km: perExtraKmInput.trim(),
        max_fee: maxFeeInput.trim(),
        reason: reasonInput.trim(),
      });
      setConfig(updated);
      syncInputs(updated);
      setReasonInput('');
      setConfirmOpen(false);
      setNotice('Distance-based delivery fee settings updated. Applies to new checkouts only; existing orders remain unchanged.');
      window.dispatchEvent(new CustomEvent('salo:deliveryFeeUpdated', {
        detail: { flat_delivery_fee: Number(updated?.base_fee ?? updated?.flat_delivery_fee) },
      }));
    } catch (err) {
      setConfirmOpen(false);
      setFormError(err?.message || 'Unable to update delivery fee configuration.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminLayout>
      <section className="admin-shell-page">
        <PageHeader
          title="Fees and commissions"
          description="Configure distance-based delivery fees applied to new delivery checkouts."
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
              <h2 style={{ margin: '0 0 6px', fontSize: '1.05rem' }}>Distance-Based Delivery Fee</h2>
              <p style={{ margin: 0, color: 'var(--color-text-secondary, #6b7280)', fontSize: '0.9rem' }}>
                Base: <strong>{formatPeso(config?.base_fee ?? config?.flat_delivery_fee ?? 49)}</strong> up to{' '}
                <strong>{config?.base_distance_km ?? 2} km</strong>, then{' '}
                <strong>+{formatPeso(config?.per_extra_km ?? 10)}/km</strong> (rounded up), capped at{' '}
                <strong>{formatPeso(config?.max_fee ?? 150)}</strong>.
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
                <span>Base Fee (PHP, up to base distance)</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="500"
                  value={baseFeeInput}
                  onChange={(e) => setBaseFeeInput(e.target.value)}
                  required
                />
              </label>

              <label style={{ display: 'grid', gap: 6 }}>
                <span>Base Distance (km, &gt; 0)</span>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  max="50"
                  value={baseDistanceInput}
                  onChange={(e) => setBaseDistanceInput(e.target.value)}
                  required
                />
              </label>

              <label style={{ display: 'grid', gap: 6 }}>
                <span>Per Extra Kilometer Fee (PHP, rounded up)</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="200"
                  value={perExtraKmInput}
                  onChange={(e) => setPerExtraKmInput(e.target.value)}
                  required
                />
              </label>

              <label style={{ display: 'grid', gap: 6 }}>
                <span>Maximum Delivery Fee Cap (PHP)</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="1000"
                  value={maxFeeInput}
                  onChange={(e) => setMaxFeeInput(e.target.value)}
                  required
                />
              </label>

              <label style={{ display: 'grid', gap: 6 }}>
                <span>Reason for change (required for audit log)</span>
                <input
                  type="text"
                  minLength={5}
                  maxLength={255}
                  placeholder="e.g. Adjusted distance-based delivery rates"
                  value={reasonInput}
                  onChange={(e) => setReasonInput(e.target.value)}
                  required
                />
              </label>

              <div>
                <Button type="submit" variant="primary" disabled={saving}>
                  Save Delivery Fee Settings
                </Button>
              </div>
            </form>
          </div>
        )}

        <ConfirmDialog
          open={confirmOpen}
          title="Confirm Delivery Fee Change"
          description={`Update delivery fee to ${formatPeso(Number(baseFeeInput || 0))} base (up to ${baseDistanceInput || 2} km), +${formatPeso(Number(perExtraKmInput || 0))}/extra km, max ${formatPeso(Number(maxFeeInput || 0))}? Applies immediately to new delivery checkouts.`}
          confirmLabel={saving ? 'Saving...' : 'Confirm Change'}
          onClose={() => !saving && setConfirmOpen(false)}
          onConfirm={handleConfirmSave}
        />
      </section>
    </AdminLayout>
  );
}
