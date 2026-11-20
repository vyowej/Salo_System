import { useState } from 'react';
import useContactNumbers, { MAX_SAVED_CONTACT_NUMBERS } from '../../../hooks/useContactNumbers';
import Button from '../../../components/common/Button';
import Badge from '../../../components/common/Badge';
import Modal from '../../../components/common/Modal';
import ContactNumberFormModal from './ContactNumberFormModal';
import './ContactNumbersManager.css';

function getLabelIcon(label) {
  switch (String(label || '').toLowerCase()) {
    case 'personal':
      return '👤';
    case 'work':
      return '💼';
    default:
      return '📱';
  }
}

export default function ContactNumbersManager({ hideAddButton = false }) {
  const {
    contactNumbers,
    addContactNumber,
    updateContactNumber,
    deleteContactNumber,
    setDefaultContactNumber,
  } = useContactNumbers();

  const [formModalOpen, setFormModalOpen] = useState(false);
  const [editingContact, setEditingContact] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const isLimitReached = contactNumbers.length >= MAX_SAVED_CONTACT_NUMBERS;

  const handleOpenAdd = () => {
    setEditingContact(null);
    setFormModalOpen(true);
  };

  const handleOpenEdit = (contact) => {
    setEditingContact(contact);
    setFormModalOpen(true);
  };

  const handleSave = (payload) => {
    if (editingContact?.id) {
      updateContactNumber(editingContact.id, payload);
    } else {
      addContactNumber(payload);
    }
  };

  const handleConfirmDelete = () => {
    if (deleteTarget?.id) {
      deleteContactNumber(deleteTarget.id);
    }
    setDeleteTarget(null);
  };

  return (
    <div className="salo-contacts-manager">
      {isLimitReached ? (
        <div className="salo-contacts-limit-banner" role="status">
          <span aria-hidden="true">ℹ️</span>
          <span>
            Contact number limit reached ({MAX_SAVED_CONTACT_NUMBERS} of {MAX_SAVED_CONTACT_NUMBERS} saved numbers). Delete or edit an existing number to add a new one.
          </span>
        </div>
      ) : (
        <div className="salo-contacts-toolbar">
          <span className="salo-contacts-count">
            {contactNumbers.length} of {MAX_SAVED_CONTACT_NUMBERS} saved contact numbers
          </span>
          {!hideAddButton && (
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={handleOpenAdd}
            >
              + Add Contact Number
            </Button>
          )}
        </div>
      )}

      {contactNumbers.length === 0 ? (
        <div className="salo-contacts-empty">
          <div className="salo-contacts-empty__icon" aria-hidden="true">📱</div>
          <h3 className="salo-contacts-empty__title">No Saved Contact Numbers Yet</h3>
          <p className="salo-contacts-empty__text">
            Save your personal, work, or alternate mobile numbers so riders can reach you easily at checkout.
          </p>
          <Button type="button" variant="primary" size="md" onClick={handleOpenAdd}>
            Add Your First Contact Number
          </Button>
        </div>
      ) : (
        <div className="salo-contacts-list">
          {contactNumbers.map((contact) => (
            <article
              key={contact.id}
              className={`salo-contact-card ${contact.isDefault ? 'is-default' : ''}`}
            >
              <div className="salo-contact-card__top">
                <div className="salo-contact-card__title-group">
                  <span className="salo-contact-card__label">
                    <span aria-hidden="true">{getLabelIcon(contact.label)}</span>
                    <span>{contact.label}</span>
                  </span>
                  {contact.isDefault && (
                    <Badge variant="success" size="sm">
                      Default
                    </Badge>
                  )}
                </div>
              </div>

              <p className="salo-contact-card__number">{contact.phoneNumber}</p>

              <div className="salo-contact-card__actions">
                {!contact.isDefault ? (
                  <button
                    type="button"
                    className="salo-contact-action-btn"
                    onClick={() => setDefaultContactNumber(contact.id)}
                    aria-label={`Set ${contact.label} (${contact.phoneNumber}) as default contact number`}
                  >
                    Set as Default
                  </button>
                ) : (
                  <span className="salo-contact-action-btn default-active">
                    ✓ Active Default
                  </span>
                )}

                <button
                  type="button"
                  className="salo-contact-action-btn"
                  onClick={() => handleOpenEdit(contact)}
                  aria-label={`Edit ${contact.label} (${contact.phoneNumber})`}
                >
                  ✏️ Edit
                </button>

                <button
                  type="button"
                  className="salo-contact-action-btn danger"
                  onClick={() => setDeleteTarget(contact)}
                  aria-label={`Delete ${contact.label} (${contact.phoneNumber})`}
                >
                  🗑️ Delete
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      <ContactNumberFormModal
        isOpen={formModalOpen}
        onClose={() => {
          setFormModalOpen(false);
          setEditingContact(null);
        }}
        onSave={handleSave}
        initialData={editingContact}
        existingContacts={contactNumbers}
      />

      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Delete Contact Number?"
        size="sm"
        footer={(
          <div className="salo-contact-delete-footer">
            <Button type="button" variant="ghost" size="md" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button type="button" variant="danger" size="md" onClick={handleConfirmDelete}>
              Delete Number
            </Button>
          </div>
        )}
      >
        <p className="salo-contact-delete-copy">
          Are you sure you want to remove{' '}
          <strong>{deleteTarget?.label}</strong> ({deleteTarget?.phoneNumber}) from your saved contact numbers?
        </p>
      </Modal>
    </div>
  );
}
