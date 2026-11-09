import { useState } from 'react';
import AdminLayout from '../../../layouts/AdminLayout';
import adminService from '../../../services/adminService';
import Button from '../../../components/common/Button';
import Badge from '../../../components/common/Badge';
import { Input, Select } from '../../../components/forms';
import { Link } from 'react-router-dom';
import './AdminPages.css';

export default function AdminSettingsPage() {
  const initial = adminService.getConfig();
  const [formData, setFormData] = useState({ ...initial });
  const [saved, setSaved] = useState(false);

  function handleChange(field, val) {
    setFormData((prev) => ({ ...prev, [field]: val }));
    setSaved(false);
  }

  function handleSave(e) {
    e.preventDefault();
    adminService.updateConfig({
      ...formData,
      platformCommissionPercent: parseFloat(formData.platformCommissionPercent),
      defaultDeliveryFee: parseFloat(formData.defaultDeliveryFee),
      minimumOrderValue: parseFloat(formData.minimumOrderValue),
      cancellationWindowMinutes: parseInt(formData.cancellationWindowMinutes, 10),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  return (
    <AdminLayout>
      {/* ── Page Header ────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-6)', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
        <div>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: 'var(--salo-brown)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            HQ Policy & Core Engine
          </span>
          <h1 className="page-title" style={{ fontSize: 'var(--font-size-2xl)', marginTop: 'var(--space-1)' }}>
            System Configuration & Global Policies
          </h1>
          <p className="page-subtitle">
            Configure default platform fees, delivery algorithms, partner payout cadences, and maintenance gates
          </p>
        </div>

        {saved && (
          <Badge variant="success" size="lg">
            ✓ System Policies Saved!
          </Badge>
        )}
        <Link to="/admin/settings/security" className="admin-settings-security-link">
          Review administrator sessions and security
        </Link>
      </div>

      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-8)' }}>
        {/* ── Section 1: Commercial & Fee Rules ──────────── */}
        <div style={{
          background: 'var(--surface-primary)',
          border: '1px solid var(--border-primary)',
          borderRadius: 'var(--radius-xl)',
          padding: 'var(--space-6)',
          boxShadow: 'var(--shadow-sm)',
        }}>
          <h2 className="section-title" style={{ margin: '0 0 var(--space-1) 0' }}>
            Commercial Economics & Take Rates
          </h2>
          <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', marginBottom: 'var(--space-5)' }}>
            Baseline fee formulas applied to multi-restaurant carts and food delivery transactions
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 'var(--space-4)' }}>
            <Input
              id="cfg-commission"
              label="Default Partner Commission (%)"
              type="number"
              min="5"
              max="25"
              step="0.5"
              value={formData.platformCommissionPercent}
              onChange={(e) => handleChange('platformCommissionPercent', e.target.value)}
              helper="Default rate for new restaurant partner onboardings"
              required
            />

            <Input
              id="cfg-delivery"
              label="Platform Base Delivery Fee (PHP)"
              type="number"
              min="0"
              value={formData.defaultDeliveryFee}
              onChange={(e) => handleChange('defaultDeliveryFee', e.target.value)}
              helper="Base fare paid to courier for trips up to 3.0 km"
              required
            />

            <Input
              id="cfg-min-order"
              label="Minimum Cart Order Threshold (PHP)"
              type="number"
              min="50"
              value={formData.minimumOrderValue}
              onChange={(e) => handleChange('minimumOrderValue', e.target.value)}
              helper="Cart subtotal requirement to initiate checkout"
              required
            />

            <Input
              id="cfg-cancel-window"
              label="Grace Cancellation Window (Minutes)"
              type="number"
              min="1"
              max="15"
              value={formData.cancellationWindowMinutes}
              onChange={(e) => handleChange('cancellationWindowMinutes', e.target.value)}
              helper="Time window before kitchen begins non-refundable food prep"
              required
            />
          </div>
        </div>

        {/* ── Section 2: Support & Operations ────────────── */}
        <div style={{
          background: 'var(--surface-primary)',
          border: '1px solid var(--border-primary)',
          borderRadius: 'var(--radius-xl)',
          padding: 'var(--space-6)',
          boxShadow: 'var(--shadow-sm)',
        }}>
          <h2 className="section-title" style={{ margin: '0 0 var(--space-1) 0' }}>
            Support Routing & Settlement Cadence
          </h2>
          <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', marginBottom: 'var(--space-5)' }}>
            Official customer escalations hotline and merchant remittance schedule
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 'var(--space-4)' }}>
            <Input
              id="cfg-hotline"
              label="Official Customer Hotline"
              value={formData.supportHotline}
              onChange={(e) => handleChange('supportHotline', e.target.value)}
              required
            />

            <Input
              id="cfg-email"
              label="Escalation Email"
              type="email"
              value={formData.supportEmail}
              onChange={(e) => handleChange('supportEmail', e.target.value)}
              required
            />

            <Select
              id="cfg-payout-schedule"
              label="Merchant Automated Payout Cadence"
              value={formData.payoutSchedule}
              onChange={(e) => handleChange('payoutSchedule', e.target.value)}
              options={[
                { value: 'Weekly on Mondays', label: 'Weekly on Mondays' },
                { value: 'Bi-Weekly (15th & 30th)', label: 'Bi-Weekly (15th & 30th)' },
                { value: 'Daily Automated Sweep', label: 'Daily Automated Sweep' },
              ]}
            />
          </div>
        </div>

        {/* ── Section 3: Emergency Maintenance Mode ───────── */}
        <div style={{
          background: 'var(--surface-primary)',
          border: formData.maintenanceMode ? '2px solid var(--salo-error)' : '1px solid var(--border-primary)',
          borderRadius: 'var(--radius-xl)',
          padding: 'var(--space-6)',
          boxShadow: 'var(--shadow-sm)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 'var(--space-4)',
        }}>
          <div>
            <span style={{ fontSize: 11, fontWeight: 700, color: formData.maintenanceMode ? 'var(--salo-error)' : 'var(--text-muted)', textTransform: 'uppercase' }}>
              High-Risk Disaster Gate
            </span>
            <h3 style={{ fontSize: 'var(--font-size-md)', fontWeight: 700, margin: '2px 0 0', color: 'var(--text-primary)' }}>
              Emergency Maintenance Gate
            </h3>
            <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', margin: '4px 0 0', maxWidth: 480 }}>
              Pauses all new customer checkouts and rider dispatch across Metro Manila in case of typhoons, severe weather, or major server upgrades.
            </p>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none' }}>
            <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 700, color: formData.maintenanceMode ? 'var(--salo-error)' : 'var(--text-muted)' }}>
              {formData.maintenanceMode ? '● Maintenance Active' : '○ Platform Operational'}
            </span>
            <input
              type="checkbox"
              checked={formData.maintenanceMode}
              onChange={(e) => handleChange('maintenanceMode', e.target.checked)}
              style={{ display: 'none' }}
            />
            <div style={{
              width: 44,
              height: 24,
              borderRadius: 12,
              background: formData.maintenanceMode ? 'var(--salo-error)' : 'var(--border-primary)',
              position: 'relative',
              transition: 'background var(--transition-fast)',
            }}>
              <div style={{
                width: 20,
                height: 20,
                borderRadius: '50%',
                background: 'var(--surface-primary)',
                position: 'absolute',
                top: 2,
                left: formData.maintenanceMode ? 22 : 2,
                transition: 'left var(--transition-fast)',
              }} />
            </div>
          </label>
        </div>

        {/* ── Submit Strip ───────────────────────────────── */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)' }}>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setFormData(initial)}
          >
            Reset to Defaults
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="lg"
          >
            Save Global System Settings
          </Button>
        </div>
      </form>
    </AdminLayout>
  );
}
