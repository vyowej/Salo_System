import { useState } from 'react';
import Modal from '../../../components/common/Modal';
import Button from '../../../components/common/Button';
import { FormGroup, Input, Label, HelperText, ErrorMessage } from '../../../components/forms/FormElements';
import { PhilippineAddressFields } from '../../../components/location';
import LocationPickerModal from '../../../pages/BusinessApplication/components/LocationPickerModal';
import ownerService from '../../../services/ownerService';
import { useAuth } from '../../../hooks/useAuth';
import { useRestaurantAccess } from '../access/useRestaurantAccess';
import { BRANCH_PERMIT_COPY, BRANCH_WORKSPACE_COPY } from '../content/branchContent';
import BranchPermitFields from './BranchPermitFields';
import './BranchPermitPanel.css';
import {
  buildCreateBranchPayload,
  createInitialAddBranchForm,
  mapAddBranchBackendErrors,
  validateAddBranchForm,
} from '../utils/branchWorkspaceUtils';
import './AddBranchModal.css';

export default function AddBranchModal({ open, onClose, onCreated }) {
  const { refreshUser } = useAuth();
  const access = useRestaurantAccess();
  const [form, setForm] = useState(createInitialAddBranchForm);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [pinModalOpen, setPinModalOpen] = useState(false);

  const rootRestaurant = access.restaurants.find((r) => r.isMainBranch) || access.restaurants[0] || null;
  const rootHasNoBranchName = Boolean(rootRestaurant && !rootRestaurant.branchName);

  const handleClose = () => {
    if (submitting) return;
    setErrors({});
    setFormError('');
    setForm(createInitialAddBranchForm());
    onClose?.();
  };

  const handleSubmit = async (e) => {
    e?.preventDefault();
    const clientErrors = validateAddBranchForm(form, { rootHasNoBranchName });
    if (Object.keys(clientErrors).length > 0) {
      setErrors(clientErrors);
      setFormError(Object.values(clientErrors)[0]);
      return;
    }

    setSubmitting(true);
    setErrors({});
    setFormError('');
    try {
      const payload = buildCreateBranchPayload(form, { rootHasNoBranchName });
      const created = await ownerService.createBranch(payload);
      if (typeof refreshUser === 'function') {
        await refreshUser();
      }
      if (created?.restaurant_id) {
        try {
          access.selectRestaurant(String(created.restaurant_id));
        } catch {
          // Will sync via refreshed user context
        }
      }
      setForm(createInitialAddBranchForm());
      onCreated?.(created);
      onClose?.();
    } catch (err) {
      const parsed = mapAddBranchBackendErrors(err);
      setErrors(parsed.fieldErrors);
      setFormError(parsed.formError);
    } finally {
      setSubmitting(false);
    }
  };

  const serviceError = errors.offers_delivery || errors.offers_pickup || errors.offers_dine_in;
  const pinError = errors.latitude || errors.longitude;
  const addressSummary = [form.house_number, form.street, form.barangay ? `Brgy. ${form.barangay}` : null, form.city, form.province, form.postal_code]
    .filter(Boolean)
    .join(', ');

  return (
    <>
      <Modal
        open={open}
        onClose={handleClose}
        title={BRANCH_WORKSPACE_COPY.addBranchModalTitle}
        description={BRANCH_WORKSPACE_COPY.addBranchModalSubtitle}
        size="lg"
        footer={(
          <>
            <Button type="button" variant="secondary" onClick={handleClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" form="salo-add-branch-form" variant="primary" loading={submitting}>
              Create Branch
            </Button>
          </>
        )}
      >
        <form id="salo-add-branch-form" className="salo-add-branch-form" onSubmit={handleSubmit}>
          {formError && (
            <div className="salo-add-branch-alert" role="alert">
              {formError}
            </div>
          )}

          {rootHasNoBranchName && (
            <FormGroup>
              <Label htmlFor="add-branch-main-name" required>
                {BRANCH_WORKSPACE_COPY.addBranchMainNameLabel}
              </Label>
              <Input
                id="add-branch-main-name"
                value={form.main_branch_name}
                onChange={(e) => setForm((prev) => ({ ...prev, main_branch_name: e.target.value }))}
                placeholder="e.g. Main Branch"
                error={errors.main_branch_name}
              />
              <HelperText>{BRANCH_WORKSPACE_COPY.addBranchMainNameHint}</HelperText>
              {errors.main_branch_name && <ErrorMessage>{errors.main_branch_name}</ErrorMessage>}
            </FormGroup>
          )}

          <div className="salo-add-branch-grid">
            <FormGroup>
              <Label htmlFor="add-branch-name" required>
                {BRANCH_WORKSPACE_COPY.addBranchNameLabel}
              </Label>
              <Input
                id="add-branch-name"
                value={form.branch_name}
                onChange={(e) => setForm((prev) => ({ ...prev, branch_name: e.target.value }))}
                placeholder={BRANCH_WORKSPACE_COPY.addBranchNamePlaceholder}
                error={errors.branch_name}
              />
              {errors.branch_name && <ErrorMessage>{errors.branch_name}</ErrorMessage>}
            </FormGroup>

            <FormGroup>
              <Label htmlFor="add-branch-phone">
                {BRANCH_WORKSPACE_COPY.addBranchPhoneLabel}
              </Label>
              <Input
                id="add-branch-phone"
                value={form.contact_phone}
                onChange={(e) => setForm((prev) => ({ ...prev, contact_phone: e.target.value }))}
                placeholder={BRANCH_WORKSPACE_COPY.addBranchPhonePlaceholder}
                error={errors.contact_phone}
              />
              {errors.contact_phone && <ErrorMessage>{errors.contact_phone}</ErrorMessage>}
            </FormGroup>
          </div>

          <PhilippineAddressFields
            value={{
              province: form.province,
              city: form.city,
              barangay: form.barangay,
              street: form.street,
              houseNumber: form.house_number,
              postalCode: form.postal_code,
              notes: form.landmark,
            }}
            onChange={(nextVal) => setForm((prev) => ({
              ...prev,
              province: nextVal.province ?? prev.province,
              city: nextVal.city ?? prev.city,
              barangay: nextVal.barangay ?? prev.barangay,
              street: nextVal.street ?? prev.street,
              house_number: nextVal.houseNumber ?? prev.house_number,
              postal_code: nextVal.postalCode ?? prev.postal_code,
              landmark: nextVal.notes ?? prev.landmark,
            }))}
            errors={{
              province: errors.province,
              city: errors.city,
              barangay: errors.barangay,
              street: errors.street,
              postalCode: errors.postal_code,
            }}
          />

          <div className="salo-add-branch-pin-box">
            <div>
              <strong>Map Pin Coordinates</strong>
              <p className="salo-add-branch-pin-meta">
                {form.mapPinned && form.latitude != null && form.longitude != null
                  ? `Pin set at ${Number(form.latitude).toFixed(6)}° N, ${Number(form.longitude).toFixed(6)}° E`
                  : 'Optional: drop a map pin for rider dispatch.'}
              </p>
              {pinError && <ErrorMessage>{pinError}</ErrorMessage>}
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => setPinModalOpen(true)}>
              {form.mapPinned ? 'Adjust Pin' : 'Drop Pin'}
            </Button>
          </div>

          <fieldset className="salo-add-branch-fieldset">
            <legend>{BRANCH_WORKSPACE_COPY.addBranchServicesLabel}</legend>
            <div className="salo-add-branch-checks">
              <label>
                <input
                  type="checkbox"
                  checked={form.offers_delivery}
                  onChange={(e) => setForm((prev) => ({ ...prev, offers_delivery: e.target.checked }))}
                />
                <span>Delivery</span>
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={form.offers_pickup}
                  onChange={(e) => setForm((prev) => ({ ...prev, offers_pickup: e.target.checked }))}
                />
                <span>Pickup</span>
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={form.offers_dine_in}
                  onChange={(e) => setForm((prev) => ({ ...prev, offers_dine_in: e.target.checked }))}
                />
                <span>Dine-in</span>
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={form.accepts_reservations}
                  onChange={(e) => setForm((prev) => ({ ...prev, accepts_reservations: e.target.checked }))}
                />
                <span>Table Reservations</span>
              </label>
            </div>
            {serviceError && <ErrorMessage>{serviceError}</ErrorMessage>}
          </fieldset>

          <div className="salo-add-branch-copy-options">
            <label>
              <input
                type="checkbox"
                checked={form.copy_operating_hours}
                onChange={(e) => setForm((prev) => ({ ...prev, copy_operating_hours: e.target.checked }))}
              />
              <span>{BRANCH_WORKSPACE_COPY.addBranchCopyHoursLabel}</span>
            </label>
            <label>
              <input
                type="checkbox"
                checked={form.copy_menu}
                onChange={(e) => setForm((prev) => ({ ...prev, copy_menu: e.target.checked }))}
              />
              <span>{BRANCH_WORKSPACE_COPY.addBranchCopyMenuLabel}</span>
            </label>
          </div>

          <fieldset className="salo-add-branch-fieldset salo-add-branch-permit-fieldset">
            <legend>{BRANCH_PERMIT_COPY.sectionTitle}</legend>
            <p className="salo-add-branch-permit-helper">{BRANCH_PERMIT_COPY.sectionSubtitle}</p>
            <BranchPermitFields
              idPrefix="add-branch-permit"
              file={form.mayors_permit}
              isRequiredLocally={form.is_required_locally}
              exemptionReason={form.exemption_reason}
              errors={errors}
              disabled={submitting}
              onFileChange={(nextFile) => {
                setForm((prev) => ({ ...prev, mayors_permit: nextFile }));
                setErrors((prev) => ({ ...prev, mayors_permit: undefined }));
              }}
              onToggleNotRequired={(nextRequired) => {
                setForm((prev) => ({
                  ...prev,
                  is_required_locally: nextRequired,
                  mayors_permit: nextRequired ? prev.mayors_permit : null,
                }));
                setErrors((prev) => ({ ...prev, mayors_permit: undefined, exemption_reason: undefined }));
              }}
              onExemptionChange={(nextText) => {
                setForm((prev) => ({ ...prev, exemption_reason: nextText }));
                setErrors((prev) => ({ ...prev, exemption_reason: undefined }));
              }}
              onClientFileError={(msg) => setErrors((prev) => ({ ...prev, mayors_permit: msg || undefined }))}
            />
          </fieldset>
        </form>
      </Modal>

      <LocationPickerModal
        open={pinModalOpen}
        onClose={() => setPinModalOpen(false)}
        initialCoordinates={
          form.latitude != null && form.longitude != null
            ? { lat: Number(form.latitude), lng: Number(form.longitude) }
            : { lat: 14.6369, lng: 121.0362 }
        }
        addressSummary={addressSummary || 'Philippines'}
        onConfirmCoordinates={(coords) => setForm((prev) => ({
          ...prev,
          latitude: coords.lat,
          longitude: coords.lng,
          mapPinned: true,
        }))}
      />
    </>
  );
}
