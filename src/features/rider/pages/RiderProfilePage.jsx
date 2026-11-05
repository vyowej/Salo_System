import { useState } from 'react';
import RiderLayout from '../../../layouts/RiderLayout';
import riderService from '../../../services/riderService';
import Button from '../../../components/common/Button';
import Badge from '../../../components/common/Badge';
import { Input } from '../../../components/forms';

export default function RiderProfilePage() {
  const initial = riderService.getRiderProfile();
  const [formData, setFormData] = useState({
    name: initial.name || '',
    phone: initial.phone || '',
    email: initial.email || '',
    vehicle: initial.vehicle || '',
    plateNumber: initial.plateNumber || '',
    licenseNumber: initial.licenseNumber || '',
    zone: initial.zone || '',
    emergencyContact: initial.emergencyContact || '',
  });

  const [saved, setSaved] = useState(false);

  function handleChange(field, val) {
    setFormData((prev) => ({ ...prev, [field]: val }));
    setSaved(false);
  }

  function handleSubmit(e) {
    e.preventDefault();
    riderService.updateRiderProfile(formData);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  return (
    <RiderLayout>
      {/* ── Page Header ────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-6)', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
        <div>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: 'var(--salo-green)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            Courier Credentials
          </span>
          <h1 className="page-title" style={{ fontSize: 'var(--font-size-2xl)', marginTop: 'var(--space-1)' }}>
            Rider Profile & Vehicle
          </h1>
          <p className="page-subtitle">
            Keep your contact details, motorcycle registration, and delivery territory up to date
          </p>
        </div>

        {saved && (
          <Badge variant="success" size="lg">
            ✓ Rider Profile Updated!
          </Badge>
        )}
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-8)' }}>
        {/* ── Personal & Safety Info ─────────────────────── */}
        <div style={{
          background: 'var(--surface-primary)',
          border: '1px solid var(--border-primary)',
          borderRadius: 'var(--radius-xl)',
          padding: 'var(--space-6)',
          boxShadow: 'var(--shadow-sm)',
        }}>
          <h2 className="section-title" style={{ margin: '0 0 var(--space-1) 0' }}>
            Rider Identification
          </h2>
          <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', marginBottom: 'var(--space-5)' }}>
            Information shown to restaurants and customers upon order dispatch
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 'var(--space-4)' }}>
            <Input
              id="rider-name"
              label="Full Name"
              value={formData.name}
              onChange={(e) => handleChange('name', e.target.value)}
              required
            />
            <Input
              id="rider-phone"
              label="Contact Mobile (Active for Dispatch)"
              value={formData.phone}
              onChange={(e) => handleChange('phone', e.target.value)}
              required
            />
            <Input
              id="rider-email"
              label="Account Email"
              type="email"
              value={formData.email}
              disabled
              helper="Linked to your official SALO Courier ID"
            />
            <Input
              id="rider-emergency"
              label="Emergency Contact (Name & Phone)"
              value={formData.emergencyContact}
              onChange={(e) => handleChange('emergencyContact', e.target.value)}
              required
            />
          </div>
        </div>

        {/* ── Vehicle & LTO Credentials ──────────────────── */}
        <div style={{
          background: 'var(--surface-primary)',
          border: '1px solid var(--border-primary)',
          borderRadius: 'var(--radius-xl)',
          padding: 'var(--space-6)',
          boxShadow: 'var(--shadow-sm)',
        }}>
          <h2 className="section-title" style={{ margin: '0 0 var(--space-1) 0' }}>
            Motorcycle & License Registration
          </h2>
          <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', marginBottom: 'var(--space-5)' }}>
            Verified vehicle details for security gates, building guards, and traffic compliance
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 'var(--space-4)' }}>
            <Input
              id="rider-vehicle"
              label="Motorcycle Model / Color"
              value={formData.vehicle}
              onChange={(e) => handleChange('vehicle', e.target.value)}
              required
            />
            <Input
              id="rider-plate"
              label="Plate / MV File Number"
              value={formData.plateNumber}
              onChange={(e) => handleChange('plateNumber', e.target.value)}
              required
            />
            <Input
              id="rider-license"
              label="LTO Driver's License Number"
              value={formData.licenseNumber}
              onChange={(e) => handleChange('licenseNumber', e.target.value)}
              required
            />
            <Input
              id="rider-zone"
              label="Designated Delivery Territory"
              value={formData.zone}
              onChange={(e) => handleChange('zone', e.target.value)}
              required
            />
          </div>
        </div>

        {/* ── Performance Rating Summary ─────────────────── */}
        <div style={{
          background: 'var(--surface-primary)',
          border: '1px solid var(--border-primary)',
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
            <h3 style={{ fontSize: 'var(--font-size-md)', fontWeight: 700, margin: 0 }}>
              Courier Performance Status
            </h3>
            <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', margin: '4px 0 0' }}>
              Maintained 99.4% on-time delivery rate over the last 90 days
            </p>
          </div>

          <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
            <Badge variant="success" size="lg">★ {initial.rating} Rating</Badge>
            <Badge variant="primary" size="lg">{initial.totalTrips} Trips</Badge>
          </div>
        </div>

        {/* ── Submit Button ──────────────────────────────── */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)' }}>
          <Button
            type="submit"
            variant="primary"
            size="lg"
          >
            Save Profile Changes
          </Button>
        </div>
      </form>
    </RiderLayout>
  );
}
