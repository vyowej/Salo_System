import { useState } from 'react';
import Button from '../../../components/common/Button';
import { Input, FormGroup, Label, HelperText, ErrorMessage } from '../../../components/forms/FormElements';
import { PhilippineAddressFields } from '../../../components/location';
import LocationPickerModal from './LocationPickerModal';
import {
  APPLICATION_BRANCH_COPY,
  MAX_APPLICATION_BRANCHES,
  createEmptyApplicationBranch,
} from '../constants/applicationDefaults';
import {
  formatBranchAddressSummary,
  hasEnteredBranchData,
} from '../utils/branchHelpers';
import BranchPermitFields from '../../../features/restaurant/components/BranchPermitFields';
import { BRANCH_PERMIT_COPY } from '../../../features/restaurant/content/branchContent';
import '../../../features/restaurant/components/BranchPermitPanel.css';

export default function BusinessAddressStep({
  data,
  onChange,
  errors = {},
  usingSavedAddress = false,
  hasSavedAddresses = true,
  saveAddressToAccount = false,
  onToggleSaveAddressToAccount,
  onUseDifferentAddress,
}) {
  const [pinTarget, setPinTarget] = useState(null); // null | { type: 'main' } | { type: 'branch', index: number }
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);

  const branches = Array.isArray(data.branches) ? data.branches : [];
  const maxAdditional = Math.max(0, MAX_APPLICATION_BRANCHES - 1);
  const canAddBranch = branches.length < maxAdditional;

  const handleAddressChange = (nextVal) => {
    onChange?.({
      ...data,
      province: nextVal.province ?? data.province,
      city: nextVal.city ?? data.city,
      barangay: nextVal.barangay ?? data.barangay,
      street: nextVal.street ?? data.street,
      houseNumber: nextVal.houseNumber ?? data.houseNumber,
      postalCode: nextVal.postalCode ?? data.postalCode,
      additionalDetails: nextVal.notes ?? nextVal.landmark ?? data.additionalDetails,
    });
  };

  const handleBranchToggle = (nextHasBranches) => {
    if (nextHasBranches === Boolean(data.hasBranches)) {
      return;
    }

    if (!nextHasBranches && hasEnteredBranchData(data)) {
      setConfirmClearOpen(true);
      return;
    }

    setConfirmClearOpen(false);
    onChange?.({
      ...data,
      hasBranches: nextHasBranches,
      mainBranchName: nextHasBranches ? (data.mainBranchName || '') : '',
      branches: nextHasBranches ? branches : [],
    });
  };

  const handleConfirmClearBranches = () => {
    setConfirmClearOpen(false);
    onChange?.({
      ...data,
      hasBranches: false,
      mainBranchName: '',
      branches: [],
    });
  };

  const handleAddBranch = () => {
    if (!canAddBranch) return;
    onChange?.({
      ...data,
      hasBranches: true,
      branches: [...branches, createEmptyApplicationBranch()],
    });
  };

  const handleRemoveBranch = (index) => {
    onChange?.({
      ...data,
      branches: branches.filter((_, idx) => idx !== index),
    });
  };

  const handleUpdateBranch = (index, patch) => {
    onChange?.({
      ...data,
      branches: branches.map((b, idx) => (idx === index ? { ...b, ...patch } : b)),
    });
  };

  const handleConfirmCoordinates = (coords) => {
    if (pinTarget?.type === 'branch') {
      handleUpdateBranch(pinTarget.index, {
        coordinates: { lat: coords.lat, lng: coords.lng },
        gpsAccuracy: coords.gpsAccuracy ?? null,
        mapPinned: true,
      });
      return;
    }

    onChange?.({
      ...data,
      coordinates: { lat: coords.lat, lng: coords.lng },
      gpsAccuracy: coords.gpsAccuracy ?? null,
      mapPinned: true,
    });
  };

  const addressSummary = `${formatBranchAddressSummary(data)}, Philippines`;

  const activeBranchForPin = pinTarget?.type === 'branch' ? branches[pinTarget.index] : null;
  const activePinCoords = activeBranchForPin ? activeBranchForPin.coordinates : data.coordinates;
  const activePinSummary = activeBranchForPin
    ? `${formatBranchAddressSummary(activeBranchForPin)}, Philippines`
    : addressSummary;

  return (
    <div className="wizard-step-container">
      <div className="wizard-step-header">
        <h2 className="wizard-step-heading">Business Address &amp; Physical Location</h2>
        <p className="wizard-step-subheading">
          Search your Philippine province, city/municipality, and barangay, enter your street and building number, and pin your exact kitchen location on the map.
        </p>
      </div>

      <div className="wizard-form-grid">
        {usingSavedAddress ? (
          <div
            className="wizard-address-pin-card"
            style={{ justifyContent: 'space-between', alignItems: 'center', gap: 12 }}
          >
            <div>
              <strong style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>
                Using your saved SALO address
              </strong>
              <span style={{ fontSize: 14, color: 'var(--text-primary)' }}>
                {formatBranchAddressSummary(data)}
              </span>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onUseDifferentAddress}
            >
              Use a different address
            </Button>
          </div>
        ) : (
          <>
            <PhilippineAddressFields
              value={{
                province: data.province || '',
                city: data.city || '',
                barangay: data.barangay || '',
                street: data.street || '',
                houseNumber: data.houseNumber || '',
                postalCode: data.postalCode || '',
                notes: data.additionalDetails || '',
              }}
              onChange={handleAddressChange}
              errors={errors}
            />

            {!hasSavedAddresses && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
                <input
                  type="checkbox"
                  checked={Boolean(saveAddressToAccount)}
                  onChange={(e) => onToggleSaveAddressToAccount?.(e.target.checked)}
                />
                <span>Save this address to my SALO account as my default address</span>
              </label>
            )}
          </>
        )}

        {/* Location Pin & Map Representation */}
        <div className="wizard-address-pin-card">
          <div className="pin-card-meta">
            <div className="pin-icon-wrap" aria-hidden="true">📍</div>
            <div className="pin-copy">
              <h4 className="pin-title">Map Pin &amp; Rider Dispatch Coordinates</h4>
              <p className="pin-desc">
                {data.mapPinned && data.coordinates
                  ? `Pin set at ${Number(data.coordinates.lat).toFixed(6)}° N, ${Number(data.coordinates.lng).toFixed(6)}° E`
                  : 'Pin location not yet selected. Drop a pin on the map to assist rider navigation.'}
              </p>
              {addressSummary && (
                <span className="pin-address-crumb">
                  <strong>Registered Address:</strong> {addressSummary}
                </span>
              )}
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            size="md"
            onClick={() => setPinTarget({ type: 'main' })}
          >
            {data.mapPinned ? 'Adjust Pin on Map' : 'Drop Pin on Map'}
          </Button>
        </div>

        {/* Multi-Branch Question & Repeatable Branches */}
        <div className="wizard-branches-section">
          <div className="wizard-branches-question-card">
            <div>
              <h3 className="wizard-branches-title">{APPLICATION_BRANCH_COPY.questionTitle}</h3>
              <p className="wizard-branches-hint">{APPLICATION_BRANCH_COPY.questionHint}</p>
            </div>
            <div className="wizard-branches-toggle-group" role="radiogroup" aria-label={APPLICATION_BRANCH_COPY.questionTitle}>
              <button
                type="button"
                role="radio"
                aria-checked={!data.hasBranches}
                className={`wizard-branch-choice ${!data.hasBranches ? 'is-active' : ''}`}
                onClick={() => handleBranchToggle(false)}
              >
                {APPLICATION_BRANCH_COPY.singleOptionLabel}
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={Boolean(data.hasBranches)}
                className={`wizard-branch-choice ${data.hasBranches ? 'is-active' : ''}`}
                onClick={() => handleBranchToggle(true)}
              >
                {APPLICATION_BRANCH_COPY.multiOptionLabel}
              </button>
            </div>

            {confirmClearOpen && (
              <div className="wizard-branch-confirm-banner" role="alert">
                <p>{APPLICATION_BRANCH_COPY.confirmClearMessage}</p>
                <div className="wizard-branch-confirm-actions">
                  <Button type="button" variant="outline" size="sm" onClick={() => setConfirmClearOpen(false)}>
                    Keep Branches
                  </Button>
                  <Button type="button" variant="primary" size="sm" onClick={handleConfirmClearBranches}>
                    Clear &amp; Switch to Single Location
                  </Button>
                </div>
              </div>
            )}
          </div>

          {data.hasBranches && (
            <div className="wizard-branches-body">
              <FormGroup>
                <Label htmlFor="main-branch-name" required>
                  {APPLICATION_BRANCH_COPY.mainBranchLabel}
                </Label>
                <Input
                  id="main-branch-name"
                  value={data.mainBranchName || ''}
                  onChange={(e) => onChange?.({ ...data, mainBranchName: e.target.value })}
                  placeholder={APPLICATION_BRANCH_COPY.mainBranchPlaceholder}
                  error={errors.mainBranchName}
                />
                <HelperText>Label for the primary location entered above.</HelperText>
                {errors.mainBranchName && <ErrorMessage>{errors.mainBranchName}</ErrorMessage>}
              </FormGroup>

              <div className="wizard-branches-list-header">
                <div>
                  <h4 className="wizard-branches-subtitle">
                    {APPLICATION_BRANCH_COPY.additionalHeading} ({branches.length} / {maxAdditional})
                  </h4>
                  <p className="wizard-branches-hint">{APPLICATION_BRANCH_COPY.limitReachedHint}</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddBranch}
                  disabled={!canAddBranch}
                >
                  {APPLICATION_BRANCH_COPY.addBranchLabel}
                </Button>
              </div>

              {errors.branches && <ErrorMessage>{errors.branches}</ErrorMessage>}

              {branches.length === 0 ? (
                <div className="wizard-branches-empty">
                  Click <strong>{APPLICATION_BRANCH_COPY.addBranchLabel}</strong> to add your other branch locations.
                </div>
              ) : (
                <div className="wizard-branches-cards">
                  {branches.map((branch, idx) => {
                    const branchErrors = {
                      branchName: errors[`branches.${idx}.branchName`],
                      province: errors[`branches.${idx}.province`],
                      city: errors[`branches.${idx}.city`],
                      barangay: errors[`branches.${idx}.barangay`],
                      street: errors[`branches.${idx}.street`],
                      postalCode: errors[`branches.${idx}.postalCode`],
                    };
                    const branchSummary = formatBranchAddressSummary(branch);

                    return (
                      <div key={idx} className="wizard-branch-card">
                        <div className="wizard-branch-card-header">
                          <span className="wizard-branch-card-badge">Branch #{idx + 1}</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveBranch(idx)}
                          >
                            {APPLICATION_BRANCH_COPY.removeBranchLabel}
                          </Button>
                        </div>

                        <div className="wizard-branch-card-meta-grid">
                          <FormGroup>
                            <Label htmlFor={`branch-name-${idx}`} required>
                              Branch Name
                            </Label>
                            <Input
                              id={`branch-name-${idx}`}
                              value={branch.branchName || ''}
                              onChange={(e) => handleUpdateBranch(idx, { branchName: e.target.value })}
                              placeholder="e.g. BGC High Street Branch"
                              error={branchErrors.branchName}
                            />
                            {branchErrors.branchName && <ErrorMessage>{branchErrors.branchName}</ErrorMessage>}
                          </FormGroup>

                          <FormGroup>
                            <Label htmlFor={`branch-phone-${idx}`}>
                              Branch Phone (Optional)
                            </Label>
                            <Input
                              id={`branch-phone-${idx}`}
                              value={branch.contactPhone || ''}
                              onChange={(e) => handleUpdateBranch(idx, { contactPhone: e.target.value })}
                              placeholder="Defaults to main business phone"
                            />
                          </FormGroup>
                        </div>

                        <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--border-secondary, #e5e7eb)' }}>
                          <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                            {BRANCH_PERMIT_COPY.sectionTitle}
                          </div>
                          {branch.hadPendingPermitFile && !branch.permitFile && branch.permitRequiredLocally !== false && (
                            <p style={{ fontSize: '12px', color: 'var(--salo-warning-text, #b45309)', margin: '0 0 8px' }} role="status">
                              Draft restored — please re-attach your Mayor&apos;s / Business Permit file for this branch.
                            </p>
                          )}
                          <BranchPermitFields
                            idPrefix={`wizard-branch-permit-${idx}`}
                            file={branch.permitFile || null}
                            isRequiredLocally={branch.permitRequiredLocally !== false}
                            exemptionReason={branch.permitExemptionReason || ''}
                            errors={{
                              mayors_permit: errors[`branches.${idx}.permitFile`],
                              exemption_reason: errors[`branches.${idx}.permitExemptionReason`],
                            }}
                            onFileChange={(nextFile) => handleUpdateBranch(idx, {
                              permitFile: nextFile,
                              hadPendingPermitFile: false,
                            })}
                            onToggleNotRequired={(nextRequired) => handleUpdateBranch(idx, {
                              permitRequiredLocally: nextRequired,
                              permitFile: nextRequired ? branch.permitFile : null,
                              hadPendingPermitFile: false,
                            })}
                            onExemptionChange={(nextText) => handleUpdateBranch(idx, {
                              permitExemptionReason: nextText,
                            })}
                          />
                        </div>

                        <PhilippineAddressFields
                          value={{
                            province: branch.province || '',
                            city: branch.city || '',
                            barangay: branch.barangay || '',
                            street: branch.street || '',
                            houseNumber: branch.houseNumber || '',
                            postalCode: branch.postalCode || '',
                            notes: branch.additionalDetails || '',
                          }}
                          onChange={(nextVal) => handleUpdateBranch(idx, {
                            province: nextVal.province ?? branch.province,
                            city: nextVal.city ?? branch.city,
                            barangay: nextVal.barangay ?? branch.barangay,
                            street: nextVal.street ?? branch.street,
                            houseNumber: nextVal.houseNumber ?? branch.houseNumber,
                            postalCode: nextVal.postalCode ?? branch.postalCode,
                            additionalDetails: nextVal.notes ?? nextVal.landmark ?? branch.additionalDetails,
                          })}
                          errors={branchErrors}
                        />

                        <div className="wizard-address-pin-card">
                          <div className="pin-card-meta">
                            <div className="pin-icon-wrap" aria-hidden="true">📍</div>
                            <div className="pin-copy">
                              <h4 className="pin-title">Branch Map Pin</h4>
                              <p className="pin-desc">
                                {branch.mapPinned && branch.coordinates
                                  ? `Pin set at ${Number(branch.coordinates.lat).toFixed(6)}° N, ${Number(branch.coordinates.lng).toFixed(6)}° E`
                                  : 'Optional: drop a pin for accurate rider dispatch.'}
                              </p>
                              {branchSummary !== '—' && (
                                <span className="pin-address-crumb">{branchSummary}</span>
                              )}
                            </div>
                          </div>

                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setPinTarget({ type: 'branch', index: idx })}
                          >
                            {branch.mapPinned ? 'Adjust Pin' : 'Drop Pin'}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <LocationPickerModal
        open={Boolean(pinTarget)}
        onClose={() => setPinTarget(null)}
        initialCoordinates={activePinCoords}
        addressSummary={activePinSummary}
        onConfirmCoordinates={handleConfirmCoordinates}
      />
    </div>
  );
}
