import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import OwnerLayout from '../../../layouts/OwnerLayout';
import ownerService from '../../../services/ownerService';
import restaurantService from '../../../services/restaurantService';
import Button from '../../../components/common/Button';
import Badge from '../../../components/common/Badge';
import ImageUploader, { ImageGalleryUploader } from '../../../components/common/ImageUploader';
import { Input, Select, Textarea } from '../../../components/forms';
import { ErrorState, LoadingSpinner } from '../../../components/feedback';
import RestaurantImage from '../../customer/components/RestaurantImage';
import { useRestaurantAccess } from '../access/useRestaurantAccess';
import OperatingHoursEditor from './OperatingHoursEditor';
import {
  createBusinessProfilePatch,
  formatBusinessAddress,
  getRemovedImageReferences,
  getStagedImageIds,
  toBusinessProfileForm,
  validateBusinessProfile,
} from '../profile/businessProfileData';
import './OwnerProfilePage.css';

function copy(value) {
  return JSON.parse(JSON.stringify(value));
}

function OwnerProfilePreview({ profile }) {
  const address = formatBusinessAddress(profile.location);
  const coverage = profile.deliveryCoverage;
  const coverageDescription = coverage.method === 'cities'
    ? coverage.cities.join(', ')
    : coverage.method === 'barangays'
      ? coverage.barangays.join(', ')
      : coverage.method === 'zones' || coverage.method === 'other'
        ? coverage.zones
        : coverage.method === 'radius' && coverage.radiusKm
          ? `${coverage.radiusKm} km`
          : '';
  const services = [
    profile.fulfillment.delivery && 'Delivery',
    profile.fulfillment.pickup && 'Pickup',
  ].filter(Boolean);

  return (
    <section className="owner-profile-card owner-profile-preview" aria-labelledby="profile-preview-title">
      <div className="owner-profile-preview-cover">
        <RestaurantImage
          image={profile.coverPhoto}
          alt="Restaurant cover photo"
          fallback="Customer storefront preview"
        />
        {profile.logoImage && (
          <div className="owner-profile-preview-logo">
            <RestaurantImage image={profile.logoImage} alt="Restaurant logo" fallback="Logo" />
          </div>
        )}
      </div>
      <div className="owner-profile-preview-body">
        <div className="owner-profile-preview-heading">
          <div>
            <p className="owner-profile-eyebrow">Draft storefront preview</p>
            <h2 id="profile-preview-title">{profile.name || 'Restaurant name'}</h2>
            <p className="owner-profile-preview-cuisine">{profile.cuisine || 'Cuisine type'}</p>
          </div>
          {profile.rating !== null && (
            <Badge variant="default">★ {profile.rating} · {profile.reviewCount} reviews</Badge>
          )}
        </div>

        <p>{profile.description || 'Add a description to introduce your restaurant to customers.'}</p>
        <div className="owner-profile-preview-facts">
          {address && <span>📍 {address}</span>}
          {profile.operatingHours && <span>🕒 {profile.operatingHours}</span>}
          {profile.phone && <span>☎ {profile.phone}</span>}
          {profile.contactEmail && <span>✉ {profile.contactEmail}</span>}
          <span>
            {services.length ? services.join(' · ') : 'Ordering services not selected'}
          </span>
          {coverageDescription && <span>Delivery coverage: {coverageDescription}</span>}
        </div>
        {profile.foodCategories.length > 0 && (
          <div className="owner-profile-preview-tags" aria-label="Food categories">
            {profile.foodCategories.map((category) => <span key={category}>{category}</span>)}
          </div>
        )}
        {profile.profilePhotos.length > 0 && (
          <div className="owner-profile-preview-gallery" aria-label="Restaurant gallery preview">
            {profile.profilePhotos.map((image, index) => (
              <RestaurantImage
                key={image.id || `${image.src}-${index}`}
                image={image}
                alt={image.alt || `Restaurant photo ${index + 1}`}
                fallback="Photo"
              />
            ))}
          </div>
        )}
        {profile.categories.length > 0 && (
          <div className="owner-profile-preview-menu">
            <h3>Menu categories</h3>
            <div className="owner-profile-preview-tags">
              {profile.categories.map((category) => <span key={category}>{category}</span>)}
            </div>
            {profile.menu.slice(0, 3).map((item) => (
              <p key={item.id}>
                <strong>{item.name}</strong>
                {item.price != null && <span> · ₱{item.price}</span>}
              </p>
            ))}
          </div>
        )}
        <p className="owner-profile-preview-note">
          This preview reflects the current form. Save the profile, then open the customer page to review its menu and other public sections.
        </p>
      </div>
    </section>
  );
}

export default function OwnerProfilePage() {
  const access = useRestaurantAccess();
  const { selectedRestaurantId } = access;
  const permissions = useMemo(() => ({
    canEditProfile: access.canAccess(['business.profile.edit']),
    canManageLocation: access.canAccess(['business.location.manage']),
    canManagePhotos: access.canAccess(['business.photos.manage']),
    canManageHours: access.canAccess(['business.hours.manage']),
  }), [access]);
  const [initial, setInitial] = useState(null);
  const [formData, setFormData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [saved, setSaved] = useState(false);
  const stagedImageIds = useRef(new Set());
  const activeRestaurantId = useRef(selectedRestaurantId);

  useLayoutEffect(() => {
    activeRestaurantId.current = selectedRestaurantId;
  }, [selectedRestaurantId]);

  const loadProfile = useCallback(() => {
    setLoading(true);
    setError('');
    setFieldErrors({});
    const pendingImages = [...stagedImageIds.current];
    stagedImageIds.current.clear();
    if (pendingImages.length) {
      Promise.allSettled(pendingImages.map((id) => restaurantService.removeImage({ id }))).then((results) => {
        if (results.some((result) => result.status === 'rejected')) {
          setError('The selected restaurant loaded, but one or more unsaved images could not be removed from demo storage.');
        }
      });
    }
    try {
      const restaurant = ownerService.getRestaurant(selectedRestaurantId);
      if (!restaurant) throw new Error('Restaurant profile is unavailable.');
      const data = toBusinessProfileForm(restaurant);
      setInitial(data);
      setFormData(data);
      setSaved(false);
    } catch (loadError) {
      setInitial(null);
      setFormData(null);
      setError(loadError.message || 'Unable to load restaurant profile.');
    } finally {
      setLoading(false);
    }
  }, [selectedRestaurantId]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  useEffect(() => () => {
    const cleanup = [...stagedImageIds.current].map((id) => restaurantService.removeImage({ id }));
    Promise.allSettled(cleanup).then((results) => {
      results.forEach((result) => {
        if (result.status === 'rejected') console.error('Unable to remove an unsaved demo profile image.', result.reason);
      });
    });
  }, []);

  function updateProfile(update) {
    setFormData((previous) => {
      const next = typeof update === 'function' ? update(previous) : { ...previous, ...update };
      if (initial) {
        getStagedImageIds(next, initial).forEach((id) => stagedImageIds.current.add(id));
      }
      return next;
    });
    setSaved(false);
    setError('');
    setFieldErrors({});
  }

  async function resetForm() {
    if (!initial) return;
    setSaving(true);
    setError('');
    const cleanupResults = await Promise.allSettled(
      [...stagedImageIds.current].map((id) => restaurantService.removeImage({ id })),
    );
    const failedCleanup = cleanupResults.filter((result) => result.status === 'rejected');
    stagedImageIds.current.clear();
    setFormData(copy(initial));
    setFieldErrors({});
    setSaved(false);
    if (failedCleanup.length) {
      setError('The form was reset, but one or more temporary images could not be removed from demo storage.');
    }
    setSaving(false);
  }

  async function handleSave(event) {
    event.preventDefault();
    const nextFieldErrors = validateBusinessProfile(formData, permissions);
    setFieldErrors(nextFieldErrors);
    if (Object.keys(nextFieldErrors).length) {
      setError('Review the highlighted fields before saving.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const patch = createBusinessProfilePatch(formData, permissions);
      ownerService.updateBusinessProfile(patch, selectedRestaurantId);
      const currentImageIds = new Set([
        formData.logoImage?.id,
        formData.coverPhoto?.id,
        ...formData.profilePhotos.map((image) => image.id),
      ].filter(Boolean));
      const stagedImagesToRemove = [...stagedImageIds.current]
        .filter((id) => !currentImageIds.has(id))
        .map((id) => ({ id }));
      const removedImages = permissions.canManagePhotos
        ? [...getRemovedImageReferences(formData, initial), ...stagedImagesToRemove]
        : [];
      const nextInitial = copy(formData);
      setInitial(nextInitial);
      setFormData(nextInitial);
      stagedImageIds.current.clear();
      setSaved(true);

      const cleanupResults = await Promise.allSettled(
        removedImages.map((image) => restaurantService.removeImage(image)),
      );
      if (cleanupResults.some((result) => result.status === 'rejected')) {
        setError('Profile saved, but one or more replaced or removed images could not be cleaned up.');
      }
    } catch (saveError) {
      setError(saveError.message || 'Unable to save the business profile.');
    } finally {
      setSaving(false);
    }
  }

  function updateLocation(field, value) {
    updateProfile((previous) => ({
      ...previous,
      location: { ...previous.location, [field]: value },
    }));
  }

  function updateCoverage(field, value) {
    const nextValue = ['cities', 'barangays'].includes(field)
      ? value.split(/[,\n]/).map((entry) => entry.trim()).filter(Boolean)
      : value;
    updateProfile((previous) => ({
      ...previous,
      deliveryCoverage: { ...previous.deliveryCoverage, [field]: nextValue },
    }));
  }

  function handlePhotoChange(field, value, restaurantId, currentProfile, savedProfile) {
    const nextProfile = { ...currentProfile, [field]: value };
    if (activeRestaurantId.current !== restaurantId) {
      const staleUploads = getStagedImageIds(nextProfile, savedProfile);
      Promise.allSettled(staleUploads.map((id) => restaurantService.removeImage({ id }))).then((results) => {
        if (results.some((result) => result.status === 'rejected')) {
          console.error('Unable to remove a profile image uploaded for a restaurant that is no longer selected.');
        }
      });
      return;
    }
    updateProfile(nextProfile);
  }

  if (loading) {
    return <OwnerLayout><LoadingSpinner size="lg" label="Loading business profile..." /></OwnerLayout>;
  }
  if (!formData || !initial) {
    return <OwnerLayout><ErrorState description={error || 'Restaurant profile data is unavailable.'} onRetry={loadProfile} /></OwnerLayout>;
  }

  const hasEditAccess = permissions.canEditProfile || permissions.canManageLocation || permissions.canManagePhotos || permissions.canManageHours;
  const address = formatBusinessAddress(formData.location);

  return (
    <OwnerLayout>
      <div className="owner-profile-page">
        <header className="owner-profile-header">
          <div>
            <p className="owner-profile-eyebrow">Restaurant workspace</p>
            <h1 className="page-title">Business Profile</h1>
            <p className="page-subtitle">Manage the information customers see about this restaurant.</p>
          </div>
          <div className="owner-profile-header-actions">
            <Link to={`/customer/restaurants/${selectedRestaurantId}`} target="_blank" rel="noreferrer">
              <Button type="button" variant="outline">Open customer page</Button>
            </Link>
          </div>
        </header>

        {saved && <p className="owner-profile-success" role="status">Profile changes saved.</p>}
        {error && <p className="owner-profile-error" role="alert">{error}</p>}

        {!hasEditAccess && (
          <p className="owner-profile-readonly" role="status">
            You have view-only access. An owner or authorized staff member must make profile changes.
          </p>
        )}

        <div className="owner-profile-layout">
          <form className="owner-profile-form" onSubmit={handleSave}>
            {!permissions.canEditProfile && (
              <section className="owner-profile-card">
                <div className="owner-profile-section-heading">
                  <div>
                    <h2>{formData.name}</h2>
                    <p>{formData.cuisine || 'Cuisine type not set'}</p>
                  </div>
                </div>
                <p>{formData.description || 'No public description has been provided.'}</p>
                <p className="owner-profile-preview-facts">
                  {formData.phone && <span>☎ {formData.phone}</span>}
                  {formData.contactEmail && <span>✉ {formData.contactEmail}</span>}
                </p>
                {formData.foodCategories.length > 0 && (
                  <div className="owner-profile-preview-tags">
                    {formData.foodCategories.map((category) => <span key={category}>{category}</span>)}
                  </div>
                )}
              </section>
            )}

            {permissions.canEditProfile && (
              <section className="owner-profile-card">
                <div className="owner-profile-section-heading">
                  <div>
                    <h2>Restaurant information</h2>
                    <p>These details are shown on the public restaurant page.</p>
                  </div>
                </div>
                <div className="owner-profile-fields">
                  <Input
                    id="profile-name"
                    label="Restaurant name"
                    value={formData.name}
                    onChange={(event) => updateProfile({ name: event.target.value })}
                    error={fieldErrors.name}
                    required
                    disabled={saving}
                  />
                  <Input
                    id="profile-cuisine"
                    label="Cuisine type"
                    value={formData.cuisine}
                    onChange={(event) => updateProfile({ cuisine: event.target.value })}
                    disabled={saving}
                  />
                  <Input
                    id="profile-email"
                    label="Public contact email"
                    type="email"
                    value={formData.contactEmail}
                    onChange={(event) => updateProfile({ contactEmail: event.target.value })}
                    error={fieldErrors.contactEmail}
                    disabled={saving}
                  />
                  <Input
                    id="profile-phone"
                    label="Public contact phone"
                    type="tel"
                    value={formData.phone}
                    onChange={(event) => updateProfile({ phone: event.target.value })}
                    disabled={saving}
                  />
                </div>
                <Textarea
                  id="profile-description"
                  label="Description"
                  rows={4}
                  value={formData.description}
                  onChange={(event) => updateProfile({ description: event.target.value })}
                  disabled={saving}
                />
                <Textarea
                  id="profile-food-categories"
                  label="Food categories"
                  rows={2}
                  value={formData.foodCategories.join(', ')}
                  helper="Separate categories with commas or new lines."
                  onChange={(event) => updateProfile({
                    foodCategories: event.target.value.split(/[,\n]/).map((value) => value.trim()).filter(Boolean),
                  })}
                  disabled={saving}
                />
              </section>
            )}

            {permissions.canManagePhotos && (
              <section className="owner-profile-card">
                <div className="owner-profile-section-heading">
                  <div>
                    <h2>Restaurant photos</h2>
                    <p>Images are optimized and stored locally in the demo adapter.</p>
                  </div>
                </div>
                <div className="owner-profile-media-fields">
                  <ImageUploader
                    id="profile-logo"
                    key={`profile-logo-${selectedRestaurantId}`}
                    label="Restaurant logo"
                    value={formData.logoImage}
                    onChange={(logoImage) => handlePhotoChange('logoImage', logoImage, selectedRestaurantId, formData, initial)}
                    deferCleanup
                  />
                  <ImageUploader
                    id="profile-cover"
                    key={`profile-cover-${selectedRestaurantId}`}
                    label="Restaurant cover photo"
                    value={formData.coverPhoto}
                    onChange={(coverPhoto) => handlePhotoChange('coverPhoto', coverPhoto, selectedRestaurantId, formData, initial)}
                    deferCleanup
                  />
                </div>
                <ImageGalleryUploader
                  id="profile-gallery"
                  key={`profile-gallery-${selectedRestaurantId}`}
                  label="Restaurant photo gallery"
                  value={formData.profilePhotos}
                  onChange={(profilePhotos) => handlePhotoChange('profilePhotos', profilePhotos, selectedRestaurantId, formData, initial)}
                  deferCleanup
                />
              </section>
            )}
            {!permissions.canManagePhotos && (formData.logoImage || formData.coverPhoto || formData.profilePhotos.length > 0) && (
              <section className="owner-profile-card">
                <div className="owner-profile-section-heading">
                  <div>
                    <h2>Restaurant photos</h2>
                    <p>Photo editing permission is required to change these images.</p>
                  </div>
                </div>
                <div className="owner-profile-preview-gallery">
                  {[formData.logoImage, formData.coverPhoto, ...formData.profilePhotos]
                    .filter(Boolean)
                    .map((image, index) => (
                      <RestaurantImage key={image.id || index} image={image} alt={image.alt || 'Restaurant photo'} fallback="Photo" />
                    ))}
                </div>
              </section>
            )}

            {permissions.canManageLocation && (
              <section className="owner-profile-card">
                <div className="owner-profile-section-heading">
                  <div>
                    <h2>Location and delivery coverage</h2>
                    <p>Restaurant address and delivery coverage are separate public/business settings.</p>
                  </div>
                </div>
                <div className="owner-profile-fields">
                  <Input id="location-country" label="Country" value={formData.location.country} onChange={(event) => updateLocation('country', event.target.value)} disabled={saving} />
                  <Input id="location-region" label="Region" value={formData.location.region} onChange={(event) => updateLocation('region', event.target.value)} disabled={saving} />
                  <Input id="location-province" label="Province" value={formData.location.province} onChange={(event) => updateLocation('province', event.target.value)} disabled={saving} />
                  <Input id="location-city" label="City or municipality" value={formData.location.city} onChange={(event) => updateLocation('city', event.target.value)} error={fieldErrors.city} required disabled={saving} />
                  <Input id="location-barangay" label="Barangay" value={formData.location.barangay} onChange={(event) => updateLocation('barangay', event.target.value)} disabled={saving} />
                  <Input id="location-building" label="Building or house number" value={formData.location.buildingNumber} onChange={(event) => updateLocation('buildingNumber', event.target.value)} disabled={saving} />
                  <Input id="location-street" label="Street address" value={formData.location.streetAddress} onChange={(event) => updateLocation('streetAddress', event.target.value)} error={fieldErrors.streetAddress} required disabled={saving} />
                  <Input id="location-landmark" label="Landmark" value={formData.location.landmark} onChange={(event) => updateLocation('landmark', event.target.value)} disabled={saving} />
                  <Input id="location-postal" label="Postal code" value={formData.location.postalCode} onChange={(event) => updateLocation('postalCode', event.target.value)} disabled={saving} />
                </div>
                <div className="owner-profile-fields">
                  <Input id="location-latitude" label="Map pin latitude" type="number" step="any" value={formData.location.latitude} onChange={(event) => updateLocation('latitude', event.target.value)} error={fieldErrors.coordinates} helper="No map provider is configured; enter coordinates manually if known." disabled={saving} />
                  <Input id="location-longitude" label="Map pin longitude" type="number" step="any" value={formData.location.longitude} onChange={(event) => updateLocation('longitude', event.target.value)} error={fieldErrors.coordinates} disabled={saving} />
                </div>
                <Select
                  id="coverage-method"
                  label="Delivery coverage method"
                  value={formData.deliveryCoverage.method}
                  onChange={(event) => updateCoverage('method', event.target.value)}
                  helper="Coverage is saved for display only; demo mode does not validate customer addresses against it."
                  disabled={saving}
                >
                  <option value="">Not configured</option>
                  <option value="cities">Selected cities or municipalities</option>
                  <option value="barangays">Selected barangays</option>
                  <option value="zones">Delivery zones</option>
                  <option value="radius">Delivery radius</option>
                  <option value="other">Other supported area</option>
                </Select>
                {formData.deliveryCoverage.method === 'cities' && (
                  <Textarea id="coverage-cities" label="Cities or municipalities served" rows={2} value={formData.deliveryCoverage.cities.join(', ')} onChange={(event) => updateCoverage('cities', event.target.value)} disabled={saving} />
                )}
                {formData.deliveryCoverage.method === 'barangays' && (
                  <Textarea id="coverage-barangays" label="Barangays served" rows={2} value={formData.deliveryCoverage.barangays.join(', ')} onChange={(event) => updateCoverage('barangays', event.target.value)} disabled={saving} />
                )}
                {(formData.deliveryCoverage.method === 'zones' || formData.deliveryCoverage.method === 'other') && (
                  <Textarea id="coverage-zones" label="Coverage area details" rows={2} value={formData.deliveryCoverage.zones} onChange={(event) => updateCoverage('zones', event.target.value)} disabled={saving} />
                )}
                {formData.deliveryCoverage.method === 'radius' && (
                  <Input id="coverage-radius" label="Delivery radius (km)" type="number" min="0" step="any" value={formData.deliveryCoverage.radiusKm} onChange={(event) => updateCoverage('radiusKm', event.target.value)} error={fieldErrors.radiusKm} disabled={saving} />
                )}
                <fieldset className="owner-profile-services" disabled={saving}>
                  <legend>Services offered</legend>
                  <label>
                    <input type="checkbox" checked={formData.fulfillment.delivery} onChange={(event) => updateProfile((previous) => ({ ...previous, fulfillment: { ...previous.fulfillment, delivery: event.target.checked } }))} />
                    Delivery
                  </label>
                  <label>
                    <input type="checkbox" checked={formData.fulfillment.pickup} onChange={(event) => updateProfile((previous) => ({ ...previous, fulfillment: { ...previous.fulfillment, pickup: event.target.checked } }))} />
                    Pickup
                  </label>
                </fieldset>
                <div className="owner-profile-operating-hours">
                  <strong>Operating hours</strong>
                  <span>{formData.operatingHours || 'Not set'}</span>
                  <small>Manage the weekly schedule, closures, and customer acceptance controls in the Operating Hours panel.</small>
                </div>
              </section>
            )}

            {!permissions.canManageLocation && (
              <section className="owner-profile-card">
                <div className="owner-profile-section-heading">
                  <div>
                    <h2>Restaurant location</h2>
                    <p>{address || 'No public address has been provided.'}</p>
                  </div>
                </div>
                <p className="owner-profile-operating-hours">
                  Services: {[
                    formData.fulfillment.delivery && 'Delivery',
                    formData.fulfillment.pickup && 'Pickup',
                  ].filter(Boolean).join(' · ') || 'Not available'}
                </p>
              </section>
            )}

            <div className="owner-profile-form-actions">
              <Button type="button" variant="ghost" onClick={resetForm} disabled={saving}>Reset</Button>
              {hasEditAccess && (
                <Button type="submit" variant="primary" loading={saving}>Save profile</Button>
              )}
            </div>
          </form>

          <div className="owner-profile-aside">
            <OperatingHoursEditor key={selectedRestaurantId} restaurantId={selectedRestaurantId} />
            <OwnerProfilePreview profile={formData} />
            <section className="owner-profile-card owner-profile-note-card">
              <h2>Public page preview</h2>
              <p>Customer storefront data comes from this same shared restaurant record. Save your changes before opening the customer page.</p>
              <Link to={`/customer/restaurants/${selectedRestaurantId}`} target="_blank" rel="noreferrer">
                <Button type="button" variant="outline" fullWidth>Preview saved customer page</Button>
              </Link>
            </section>
          </div>
        </div>
      </div>
    </OwnerLayout>
  );
}
