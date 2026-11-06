import { useState } from 'react';
import CustomerLayout from '../../../layouts/CustomerLayout';
import customerService from '../../../services/customerService';
import Button from '../../../components/common/Button';
import Badge from '../../../components/common/Badge';
import Modal from '../../../components/common/Modal';
import { Input, Select } from '../../../components/forms';

const phonePattern = /^(\+63|0)\d{10,11}$/;

export default function AddressesPage() {
  const [addresses, setAddresses] = useState(() => customerService.getSavedAddresses());
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [editingAddressId, setEditingAddressId] = useState(null);
  const [addressToDelete, setAddressToDelete] = useState(null);
  const [formErrors, setFormErrors] = useState({});
  const [formData, setFormData] = useState({
    label: 'Home',
    recipientName: '',
    phone: '',
    street: '',
    city: 'Metro Manila',
    notes: '',
    isDefault: false,
  });

  const validateAddress = () => {
    const nextErrors = {};

    if (!formData.street.trim()) {
      nextErrors.street = 'Street and unit details are required.';
    }

    if (!formData.recipientName.trim()) {
      nextErrors.recipientName = 'Recipient name is required.';
    }

    if (!formData.phone.trim()) {
      nextErrors.phone = 'Contact number is required.';
    } else if (!phonePattern.test(formData.phone.replace(/\s+/g, ''))) {
      nextErrors.phone = 'Use a valid Philippine mobile number.';
    }

    setFormErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleOpenAddModal = () => {
    setEditingAddressId(null);
    setFormData({
      label: 'Home',
      recipientName: '',
      phone: '',
      street: '',
      city: 'Metro Manila',
      notes: '',
      isDefault: addresses.length === 0,
    });
    setFormErrors({});
    setModalOpen(true);
  };

  const handleOpenEditModal = (address) => {
    setEditingAddressId(address.id);
    setFormData({
      label: address.label || 'Home',
      recipientName: address.recipientName || '',
      phone: address.phone || '',
      street: address.street || '',
      city: address.city || 'Metro Manila',
      notes: address.notes || '',
      isDefault: Boolean(address.isDefault),
    });
    setFormErrors({});
    setModalOpen(true);
  };

  const handleSaveAddress = (e) => {
    e.preventDefault();
    if (!validateAddress()) return;

    const payload = {
      ...formData,
      phone: formData.phone.trim(),
      recipientName: formData.recipientName.trim(),
      street: formData.street.trim(),
      city: formData.city.trim(),
      isDefault: formData.isDefault || (!editingAddressId && addresses.length === 0),
    };

    const saved = editingAddressId
      ? customerService.updateAddress(editingAddressId, payload)
      : customerService.saveAddress(payload);

    setAddresses(saved);
    setModalOpen(false);
    setEditingAddressId(null);
    setFormErrors({});
  };

  const handleSetDefault = (id) => {
    const updated = customerService.setDefaultAddress(id);
    setAddresses(updated);
  };

  const handleDeleteConfirm = () => {
    if (!addressToDelete) return;
    const updated = customerService.deleteAddress(addressToDelete);
    setAddresses(updated);
    setAddressToDelete(null);
    setDeleteModalOpen(false);
  };

  return (
    <CustomerLayout>
      <Modal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditingAddressId(null);
          setFormErrors({});
        }}
        title={editingAddressId ? 'Edit Delivery Address' : 'Add Delivery Address'}
        size="md"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
            <Button variant="ghost" size="sm" onClick={() => {
              setModalOpen(false);
              setEditingAddressId(null);
              setFormErrors({});
            }}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handleSaveAddress}>
              {editingAddressId ? 'Update Address' : 'Save Address'}
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
              error={formErrors.recipientName}
            />

            <Input
              id="addr-phone"
              label="Contact Phone"
              placeholder="09XX XXX XXXX"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              error={formErrors.phone}
            />
          </div>

          <Input
            id="addr-street"
            label="Street & Building / Unit"
            placeholder="e.g. Unit 12B, Emerald Court, San Antonio"
            value={formData.street}
            onChange={(e) => setFormData({ ...formData, street: e.target.value })}
            error={formErrors.street}
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

      <Modal
        open={deleteModalOpen}
        onClose={() => {
          setDeleteModalOpen(false);
          setAddressToDelete(null);
        }}
        title="Delete address"
        size="sm"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
            <Button variant="ghost" size="sm" onClick={() => {
              setDeleteModalOpen(false);
              setAddressToDelete(null);
            }}>
              Keep Address
            </Button>
            <Button variant="danger" size="sm" onClick={handleDeleteConfirm}>
              Delete
            </Button>
          </div>
        }
      >
        <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
          This address will be permanently removed from your saved delivery list. This action cannot be undone.
        </p>
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

      {addresses.length === 0 ? (
        <div style={{
          background: 'var(--surface-primary)',
          border: '1px solid var(--border-primary)',
          borderRadius: 'var(--radius-xl)',
          padding: 'var(--space-8)',
          textAlign: 'center',
          boxShadow: 'var(--shadow-sm)',
        }}>
          <p style={{ margin: 0, fontSize: 'var(--font-size-lg)', fontWeight: 700 }}>No saved addresses yet</p>
          <p style={{ margin: 'var(--space-2) 0 0', color: 'var(--text-secondary)' }}>
            Add your first delivery location to continue ordering from multiple restaurants.
          </p>
        </div>
      ) : (
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
                  {addr.recipientName || 'Customer'}
                </p>
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

              <div style={{ marginTop: 'var(--space-4)', paddingTop: 'var(--space-3)', borderTop: '1px solid var(--border-secondary)', display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                {!addr.isDefault && (
                  <Button variant="ghost" size="sm" onClick={() => handleSetDefault(addr.id)}>
                    Set Default
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={() => handleOpenEditModal(addr)}>
                  Edit
                </Button>
                <Button variant="danger-outline" size="sm" onClick={() => {
                  setAddressToDelete(addr.id);
                  setDeleteModalOpen(true);
                }}>
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </CustomerLayout>
  );
}
