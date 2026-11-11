import { useState, useRef } from 'react';
import CustomerLayout from '../../../layouts/CustomerLayout';
import useAddresses from '../../../hooks/useAddresses';
import Button from '../../../components/common/Button';
import Badge from '../../../components/common/Badge';
import Modal from '../../../components/common/Modal';
import AddressFormModal from '../components/AddressFormModal';
import './AddressesPage.css';

export default function AddressesPage() {
  const {
    addresses,
    addAddress,
    updateAddress,
    deleteAddress,
    setDefaultAddress,
  } = useAddresses();

  const [formModalOpen, setFormModalOpen] = useState(false);
  const [editingAddress, setEditingAddress] = useState(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [addressToDelete, setAddressToDelete] = useState(null);

  const addBtnRef = useRef(null);

  const isLimitReached = addresses.length >= 10;

  const handleOpenAddModal = () => {
    setEditingAddress(null);
    setFormModalOpen(true);
  };

  const handleOpenEditModal = (address) => {
    setEditingAddress(address);
    setFormModalOpen(true);
  };

  const handleSaveAddress = (payload) => {
    if (editingAddress?.id) {
      updateAddress(editingAddress.id, payload);
    } else {
      addAddress(payload);
    }
  };

  const handlePromptDelete = (address) => {
    setAddressToDelete(address);
    setDeleteModalOpen(true);
  };

  const handleConfirmDelete = () => {
    if (addressToDelete?.id) {
      deleteAddress(addressToDelete.id);
    }
    setDeleteModalOpen(false);
    setAddressToDelete(null);
  };

  return (
    <CustomerLayout>
      <div className="salo-addresses-container">
        <div className="salo-addresses-header">
          <div className="salo-addresses-header-actions">
            <Button
              ref={addBtnRef}
              type="button"
              variant="primary"
              size="md"
              className="salo-add-address-btn"
              onClick={handleOpenAddModal}
              disabled={isLimitReached}
              aria-label="Add a new delivery address"
            >
              <span>+</span>
              <span>Add New Address</span>
            </Button>
          </div>
        </div>

        {/* Address Counter & Limit Warning */}
        {isLimitReached ? (
          <div className="salo-addresses-limit-banner" role="status">
            <span>ℹ️</span>
            <span>
              Address limit reached (10 of 10 saved addresses). To add a new location, please delete or edit an existing address.
            </span>
          </div>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)', fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>
            <span>{addresses.length} of 10 saved addresses</span>
            <span>Free delivery routing across all supported kitchens</span>
          </div>
        )}

        {/* Address Cards List */}
        {addresses.length === 0 ? (
          <div className="salo-address-empty-state">
            <div className="salo-address-empty-icon" aria-hidden="true">📍</div>
            <h2 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 700, marginBottom: 'var(--space-2)' }}>
              No Saved Addresses Yet
            </h2>
            <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 'var(--space-6)' }}>
              Add your home, office, or school location to make ordering fast and seamless.
            </p>
            <Button
              type="button"
              variant="primary"
              size="md"
              onClick={handleOpenAddModal}
              style={{ minHeight: 44 }}
            >
              Add Your First Address
            </Button>
          </div>
        ) : (
          <div className="salo-address-list">
            {addresses.map((address) => {
              const fullAddressText = [
                address.street,
                address.barangay && `Brgy. ${address.barangay}`,
                address.city,
                address.province,
                address.postalCode,
              ].filter(Boolean).join(', ');

              return (
                <div
                  key={address.id}
                  className={`salo-address-card ${address.isDefault ? 'is-default' : ''}`}
                >
                  <div className="salo-address-card-top">
                    <div className="salo-address-card-title-group">
                      <span className="salo-address-badge-label">
                        {address.label === 'Home' && '🏠 '}
                        {address.label === 'Work' && '💼 '}
                        {address.label === 'School' && '🎓 '}
                        {!['Home', 'Work', 'School'].includes(address.label) && '📍 '}
                        {address.label}
                      </span>
                      {address.isDefault && (
                        <Badge variant="success" size="sm">
                          Default Address
                        </Badge>
                      )}
                    </div>

                    <div className="salo-address-contact">
                      <span>{address.recipientName}</span> · <span>{address.mobileNumber || address.phone}</span>
                    </div>
                  </div>

                  <p className="salo-address-full-text">
                    {fullAddressText}
                  </p>

                  {address.notes && (
                    <p className="salo-address-notes">
                      <strong>Rider Note:</strong> {address.notes}
                    </p>
                  )}

                  {address.lat != null && address.lng != null && (
                    <div className="salo-address-coordinates">
                      📍 GPS Coordinates: {Number(address.lat).toFixed(4)}, {Number(address.lng).toFixed(4)}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="salo-address-actions">
                    {!address.isDefault ? (
                      <button
                        type="button"
                        className="salo-address-action-btn"
                        onClick={() => setDefaultAddress(address.id)}
                        aria-label={`Set ${address.label} as default address`}
                      >
                        Set as Default
                      </button>
                    ) : (
                      <span className="salo-address-action-btn default-active">
                        ✓ Active Default
                      </span>
                    )}

                    <button
                      type="button"
                      className="salo-address-action-btn"
                      onClick={() => handleOpenEditModal(address)}
                      aria-label={`Edit ${address.label} address`}
                    >
                      ✏️ Edit
                    </button>

                    <button
                      type="button"
                      className="salo-address-action-btn danger"
                      onClick={() => handlePromptDelete(address)}
                      aria-label={`Delete ${address.label} address`}
                    >
                      🗑️ Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add / Edit Address Form Modal */}
      <AddressFormModal
        isOpen={formModalOpen}
        onClose={() => setFormModalOpen(false)}
        onSave={handleSaveAddress}
        initialData={editingAddress}
        existingAddresses={addresses}
        triggerRef={addBtnRef}
      />

      {/* Delete Confirmation Modal */}
      <Modal
        open={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title="Delete Delivery Address?"
        size="sm"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
            <Button
              type="button"
              variant="ghost"
              size="md"
              style={{ minHeight: 44 }}
              onClick={() => setDeleteModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              size="md"
              style={{ minHeight: 44 }}
              onClick={handleConfirmDelete}
            >
              Delete Address
            </Button>
          </div>
        }
      >
        <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
          Are you sure you want to delete <strong>{addressToDelete?.label}</strong> ({addressToDelete?.city})?
          {addressToDelete?.isDefault && addresses.length > 1 && (
            <span style={{ display: 'block', marginTop: 8, color: 'var(--accent)' }}>
              Note: This is currently your default address. Deleting it will automatically make your next saved address the default.
            </span>
          )}
        </p>
      </Modal>
    </CustomerLayout>
  );
}
