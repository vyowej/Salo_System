import { useState } from 'react';
import CustomerLayout from '../../../layouts/CustomerLayout';
import customerService from '../../../services/customerService';
import Button from '../../../components/common/Button';
import Badge from '../../../components/common/Badge';
import Modal from '../../../components/common/Modal';
import { Input, Select } from '../../../components/forms';

export default function AddressesPage() {
  const [addresses, setAddresses] = useState(() => customerService.getSavedAddresses());
  const [modalOpen, setModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    label: 'Home',
    recipientName: '',
    phone: '',
    street: '',
    city: 'Metro Manila',
    notes: '',
    isDefault: false,
  });

  const handleOpenAddModal = () => {
    setFormData({
      label: 'Home',
      recipientName: '',
      phone: '',
      street: '',
      city: 'Metro Manila',
      notes: '',
      isDefault: addresses.length === 0,
    });
    setModalOpen(true);
  };

  const handleSaveAddress = (e) => {
    e.preventDefault();
    if (!formData.street.trim()) return;

    let updatedList;
    if (formData.isDefault) {
      updatedList = addresses.map((a) => ({ ...a, isDefault: false }));
    } else {
      updatedList = [...addresses];
    }

    const saved = customerService.saveAddress({
      ...formData,
      isDefault: formData.isDefault || addresses.length === 0,
    });

    setAddresses(saved);
    setModalOpen(false);
  };

  const handleSetDefault = (id) => {
    const updated = addresses.map((a) => ({
      ...a,
      isDefault: a.id === id,
    }));
    localStorage.setItem('salo_addresses', JSON.stringify(updated));
    setAddresses(updated);
  };

  return (
    <CustomerLayout>
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Add Delivery Address"
        size="md"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
            <Button variant="ghost" size="sm" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handleSaveAddress}>
              Save Address
            </Button>
          </div>
        }
      >
        <form onSubmit={handleSaveAddress} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <div className="grid-cols-2" style={{ gap: 'var(--space-3)' }}>
            <Select
              id="addr-label"
              label="Address Label"
              value={formData.label}
              onChange={(e) => setFormData({ ...formData, label: e.target.value })}
            >
              <option value="Home">Home</option>
              <option value="Office">Office</option>
              <option value="School">School</option>
              <option value="Condo">Condo / Apartment</option>
              <option value="Other">Other</option>
            </Select>

            <Input
              id="addr-city"
              label="City / Municipality"
              value={formData.city}
              onChange={(e) => setFormData({ ...formData, city: e.target.value })}
              required
            />
          </div>

          <div className="grid-cols-2" style={{ gap: 'var(--space-3)' }}>
            <Input
              id="addr-recipient"
              label="Recipient Name"
              placeholder="e.g. Cassidy Santos"
              value={formData.recipientName}
              onChange={(e) => setFormData({ ...formData, recipientName: e.target.value })}
            />

            <Input
              id="addr-phone"
              label="Contact Phone"
              placeholder="09XX XXX XXXX"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            />
          </div>

          <Input
            id="addr-street"
            label="Street & Building / Unit"
            placeholder="e.g. Unit 12B, Emerald Court, San Antonio"
            value={formData.street}
            onChange={(e) => setFormData({ ...formData, street: e.target.value })}
            required
          />

          <Input
            id="addr-notes"
            label="Delivery Instructions (Optional)"
            placeholder="e.g. Gate code, landmark, leave with guard..."
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          />

          <label className="checkbox-group" style={{ fontSize: 'var(--font-size-xs)' }}>
            <input
              type="checkbox"
              checked={formData.isDefault}
              onChange={(e) => setFormData({ ...formData, isDefault: e.target.checked })}
            />
            <span>Set as my default delivery destination</span>
          </label>
        </form>
      </Modal>

      <div style={{ marginBottom: 'var(--space-6)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
          <div>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Address Book
            </span>
            <h1 className="page-title" style={{ fontSize: 'var(--font-size-2xl)' }}>
              Saved Delivery Addresses
            </h1>
            <p className="page-subtitle">
              Manage destinations for multi-restaurant single checkout delivery allocations.
            </p>
          </div>

          <Button variant="primary" size="md" onClick={handleOpenAddModal}>
            + Add New Address
          </Button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 'var(--space-4)' }}>
        {addresses.map((addr) => (
          <div
            key={addr.id}
            style={{
              background: 'var(--surface-primary)',
              border: addr.isDefault ? '1.5px solid var(--accent)' : '1px solid var(--border-primary)',
              borderRadius: 'var(--radius-xl)',
              padding: 'var(--space-5)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              boxShadow: 'var(--shadow-xs)',
            }}
          >
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-2)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  <span style={{ fontSize: 18 }}>📍</span>
                  <h3 style={{ fontSize: 'var(--font-size-md)', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {addr.label}
                  </h3>
                </div>
                {addr.isDefault && (
                  <Badge variant="primary" size="sm">Default</Badge>
                )}
              </div>

              <p style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>
                {addr.street}
              </p>
              <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', marginBottom: 'var(--space-2)' }}>
                {addr.city} {addr.phone && `· ${addr.phone}`}
              </p>
              {addr.notes && (
                <p style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                  &ldquo;{addr.notes}&rdquo;
                </p>
              )}
            </div>

            <div style={{ marginTop: 'var(--space-4)', paddingTop: 'var(--space-3)', borderTop: '1px solid var(--border-secondary)', display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
              {!addr.isDefault && (
                <Button variant="ghost" size="sm" onClick={() => handleSetDefault(addr.id)}>
                  Set Default
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </CustomerLayout>
  );
}
