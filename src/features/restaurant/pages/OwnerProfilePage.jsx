import { useState } from 'react';
import OwnerLayout from '../../../layouts/OwnerLayout';
import ownerService from '../../../services/ownerService';
import Button from '../../../components/common/Button';
import Badge from '../../../components/common/Badge';
import { Input, Textarea } from '../../../components/forms';

export default function OwnerProfilePage() {
  const initial = ownerService.getRestaurant();
  const [formData, setFormData] = useState({
    name: initial.name || '',
    tagline: initial.tagline || '',
    cuisine: initial.cuisine || '',
    phone: initial.phone || '',
    address: initial.address || '',
    operatingHours: initial.operatingHours || '',
    deliveryTime: initial.deliveryTime || '25–35 min',
    deliveryFee: initial.deliveryFee || 49,
    minOrder: initial.minOrder || 150,
    reservationDeposit: initial.reservationDeposit || 500,
    isOpen: initial.isOpen !== undefined ? initial.isOpen : true,
    bio: initial.bio || '',
  });

  const [saved, setSaved] = useState(false);

  function handleChange(field, value) {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setSaved(false);
  }

  function handleSave(e) {
    e.preventDefault();
    ownerService.updateRestaurant({
      ...formData,
      deliveryFee: parseFloat(formData.deliveryFee),
      minOrder: parseFloat(formData.minOrder),
      reservationDeposit: parseFloat(formData.reservationDeposit),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  return (
    <OwnerLayout>
      {/* ── Page Header ────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-6)', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
        <div>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: 'var(--accent)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            Store Settings
          </span>
          <h1 className="page-title" style={{ fontSize: 'var(--font-size-2xl)', marginTop: 'var(--space-1)' }}>
            Restaurant Profile & Operations
          </h1>
          <p className="page-subtitle">
            Configure your public storefront, live opening status, delivery rates, and dining policies
          </p>
        </div>

        {saved && (
          <Badge variant="success" size="lg">
            ✓ Changes saved successfully!
          </Badge>
        )}
      </div>

      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-8)' }}>
        {/* ── Section 1: Storefront Identity & Status ─────── */}
        <div style={{
          background: 'var(--surface-primary)',
          border: '1px solid var(--border-primary)',
          borderRadius: 'var(--radius-xl)',
          padding: 'var(--space-6)',
          boxShadow: 'var(--shadow-sm)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-5)', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
            <div>
              <h2 className="section-title" style={{ margin: 0 }}>Store Identity & Operating Status</h2>
              <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', margin: '2px 0 0' }}>
                Control how customers see your restaurant across the SALO platform
              </p>
            </div>

            {/* Live Store Toggle */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-3)',
              padding: '6px 14px',
              background: formData.isOpen ? 'var(--status-success-bg, #E8F5E9)' : 'var(--bg-secondary)',
              borderRadius: 'var(--radius-full)',
              border: '1px solid var(--border-primary)',
            }}>
              <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: formData.isOpen ? 'var(--salo-green)' : 'var(--text-muted)' }}>
                {formData.isOpen ? '● Currently Accepting Orders' : '○ Store Closed (Paused)'}
              </span>
              <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                <input
                  type="checkbox"
                  checked={formData.isOpen}
                  onChange={(e) => handleChange('isOpen', e.target.checked)}
                  style={{ display: 'none' }}
                />
                <div style={{
                  width: 36,
                  height: 20,
                  borderRadius: 12,
                  background: formData.isOpen ? 'var(--salo-green)' : 'var(--border-primary)',
                  position: 'relative',
                  transition: 'background var(--transition-fast)',
                }}>
                  <div style={{
                    width: 16,
                    height: 16,
                    borderRadius: '50%',
                    background: '#fff',
                    position: 'absolute',
                    top: 2,
                    left: formData.isOpen ? 18 : 2,
                    transition: 'left var(--transition-fast)',
                  }} />
                </div>
              </label>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'var(--space-4)' }}>
            <Input
              id="rest-name"
              label="Restaurant Public Name"
              value={formData.name}
              onChange={(e) => handleChange('name', e.target.value)}
              required
            />
            <Input
              id="rest-tagline"
              label="Tagline / Short Hook"
              value={formData.tagline}
              onChange={(e) => handleChange('tagline', e.target.value)}
            />
            <Input
              id="rest-cuisine"
              label="Primary Cuisine Tags"
              value={formData.cuisine}
              onChange={(e) => handleChange('cuisine', e.target.value)}
              placeholder="e.g. Filipino · Grill & BBQ"
            />
            <Input
              id="rest-phone"
              label="Contact Landline / Hotline"
              value={formData.phone}
              onChange={(e) => handleChange('phone', e.target.value)}
            />
          </div>

          <div style={{ marginTop: 'var(--space-4)' }}>
            <Input
              id="rest-address"
              label="Physical Kitchen / Dining Address"
              value={formData.address}
              onChange={(e) => handleChange('address', e.target.value)}
              required
            />
          </div>

          <div style={{ marginTop: 'var(--space-4)' }}>
            <Textarea
              id="rest-bio"
              label="Restaurant Story / Bio"
              rows={3}
              value={formData.bio}
              onChange={(e) => handleChange('bio', e.target.value)}
              placeholder="Tell customers about your kitchen's history, culinary roots, and specialty dishes..."
            />
          </div>
        </div>

        {/* ── Section 2: Fulfillment & Reservation Rates ─── */}
        <div style={{
          background: 'var(--surface-primary)',
          border: '1px solid var(--border-primary)',
          borderRadius: 'var(--radius-xl)',
          padding: 'var(--space-6)',
          boxShadow: 'var(--shadow-sm)',
        }}>
          <h2 className="section-title" style={{ margin: '0 0 var(--space-1) 0' }}>
            Ordering, Delivery & Table Policies
          </h2>
          <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', marginBottom: 'var(--space-5)' }}>
            Set accurate fulfillment estimates to maintain high customer satisfaction ratings
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-4)' }}>
            <Input
              id="rest-hours"
              label="Operating Schedule"
              value={formData.operatingHours}
              onChange={(e) => handleChange('operatingHours', e.target.value)}
              placeholder="10:00 AM – 10:00 PM"
            />
            <Input
              id="rest-delivery-time"
              label="Estimated Prep & Delivery Time"
              value={formData.deliveryTime}
              onChange={(e) => handleChange('deliveryTime', e.target.value)}
              placeholder="25–35 min"
            />
            <Input
              id="rest-fee"
              label="Base Delivery Fee (₱)"
              type="number"
              value={formData.deliveryFee}
              onChange={(e) => handleChange('deliveryFee', e.target.value)}
            />
            <Input
              id="rest-min-order"
              label="Minimum Order Amount (₱)"
              type="number"
              value={formData.minOrder}
              onChange={(e) => handleChange('minOrder', e.target.value)}
            />
            <Input
              id="rest-deposit"
              label="Table Booking Deposit (₱)"
              type="number"
              value={formData.reservationDeposit}
              onChange={(e) => handleChange('reservationDeposit', e.target.value)}
              helper="Deducted from the customer's dining bill upon arrival"
            />
          </div>
        </div>

        {/* ── Submit Strip ───────────────────────────────── */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)' }}>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setFormData(initial)}
          >
            Reset Form
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="lg"
          >
            Save Profile Changes
          </Button>
        </div>
      </form>
    </OwnerLayout>
  );
}
