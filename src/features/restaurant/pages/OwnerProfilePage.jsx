import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import OwnerLayout from '../../../layouts/OwnerLayout';
import ownerService from '../../../services/ownerService';
import restaurantService from '../../../services/restaurantService';
import Button from '../../../components/common/Button';
import Badge from '../../../components/common/Badge';
import ImageUploader, { ImageGalleryUploader } from '../../../components/common/ImageUploader';
import { Input, Textarea } from '../../../components/forms';
import { ErrorState, LoadingSpinner } from '../../../components/feedback';
import { LocationPicker } from '../../../components/location';
import locationApiService from '../../../services/locationApiService';
import RestaurantCoverageSection from '../components/RestaurantCoverageSection';
import RestaurantImage from '../../customer/components/RestaurantImage';
import { useRestaurantAccess } from '../access/useRestaurantAccess';
import OperatingHoursEditor from './OperatingHoursEditor';
import {
  formatBusinessAddress,
  getStagedImageIds,
  toBusinessProfileForm,
} from '../profile/businessProfileData';
import './OwnerProfilePage.css';

function copy(value) {
  return JSON.parse(JSON.stringify(value));
}

function getPreviewFallbackCover(restaurantId) {
  if (restaurantId === 'manila-artisan-pizza') return '/images/landing/food-gathering.png';
  return '/images/landing/restaurant-interior.png';
}

function OwnerProfilePreview({ profile, restaurantId, stagedLogoPreview, stagedCoverPreview }) {
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

  const effectiveCover = stagedCoverPreview || profile.coverPhoto;
  const effectiveLogo = stagedLogoPreview || profile.logoImage;
  const initials = (profile.name || 'S')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

  return (
    <section className="owner-profile-card owner-profile-preview" aria-labelledby="profile-preview-title">
      <div className="owner-profile-preview-cover">
        <RestaurantImage
          image={effectiveCover}
          alt="Restaurant cover photo"
          fallback="Customer storefront preview"
          fallbackSrc={getPreviewFallbackCover(restaurantId)}
        />
        <div className="owner-profile-preview-cover-scrim" aria-hidden="true" />
        <div className="owner-profile-preview-logo">
          {effectiveLogo ? (
            <RestaurantImage image={effectiveLogo} alt="Restaurant logo" fallback={initials || 'Logo'} />
          ) : (
            <span className="owner-profile-preview-logo-fallback" aria-label="Default restaurant emblem">
              {initials || '🍽️'}
            </span>
          )}
        </div>
        {(stagedCoverPreview || stagedLogoPreview) && (
          <span className="owner-profile-preview-staged-pill">Unuploaded Preview</span>
        )}
      </div>
      <div className="owner-profile-preview-body">
        <div className="owner-profile-preview-heading">
          <div>
            <p className="owner-profile-eyebrow">Live storefront preview</p>
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
  const [stagedLogoPreview, setStagedLogoPreview] = useState(null);
  const [stagedCoverPreview, setStagedCoverPreview] = useState(null);
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

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setError('');
    setFieldErrors({});
    setStagedLogoPreview(null);
    setStagedCoverPreview(null);
    stagedImageIds.current.clear();
    try {
      const [profile, loc] = await Promise.all([
        ownerService.getProfile(selectedRestaurantId),
        locationApiService.getRestaurantLocation().catch(() => null),
      ]);
      if (!profile) throw new Error('Restaurant profile is unavailable.');

      const data = toBusinessProfileForm({
        id: profile.restaurant_id,
        name: profile.restaurant_name,
        businessType: profile.business_type,
        description: profile.description || '',
        phone: profile.contact_phone || '',
        contactEmail: profile.business_email || '',
        logoImage: profile.logo_image ? { id: 'logo', src: profile.logo_image } : null,
        coverPhoto: profile.cover_image ? { id: 'cover', src: profile.cover_image } : null,
        fulfillment: {
          delivery: Boolean(profile.offers_delivery),
          pickup: Boolean(profile.offers_pickup),
        },
        location: {
          province: loc?.address?.province || profile.address?.province || '',
          city: loc?.address?.city || profile.address?.city || '',
          barangay: loc?.address?.barangay || profile.address?.barangay || '',
          streetAddress: loc?.address?.street || profile.address?.street || '',
          postalCode: loc?.address?.postal_code || profile.address?.postal_code || '',
          latitude: loc?.address?.latitude ?? '',
          longitude: loc?.address?.longitude ?? '',
        },
        deliveryCoverage: {
          areas: loc?.coverage_areas || [],
        },
      });
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
    setStagedLogoPreview(null);
    setStagedCoverPreview(null);
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
    if (saving) return;

    const nextFieldErrors = {};
    if (!formData.fulfillment?.delivery && !formData.fulfillment?.pickup) {
      nextFieldErrors.offers_delivery = 'At least one ordering service (delivery or pickup) must remain enabled.';
    }
    setFieldErrors(nextFieldErrors);
    if (Object.keys(nextFieldErrors).length) {
      setError('Review the highlighted fields before saving.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      let updatedProfile = await ownerService.updateProfile(selectedRestaurantId, {
        description: formData.description || '',
        contact_phone: formData.phone || '',
        business_email: formData.contactEmail || '',
        offers_delivery: Boolean(formData.fulfillment?.delivery),
        offers_pickup: Boolean(formData.fulfillment?.pickup),
      });

      const logoFile = formData.logoImage?.file || null;
      const coverFile = formData.coverPhoto?.file || null;
      const removeLogo = !formData.logoImage && Boolean(initial?.logoImage);
      const removeCover = !formData.coverPhoto && Boolean(initial?.coverPhoto);

      if (logoFile || coverFile || removeLogo || removeCover) {
        updatedProfile = await ownerService.updateBranding(selectedRestaurantId, {
          logoFile,
          coverFile,
          removeLogo,
          removeCover,
        });
      }

      const nextData = toBusinessProfileForm({
        ...formData,
        description: updatedProfile?.description || '',
        phone: updatedProfile?.contact_phone || '',
        contactEmail: updatedProfile?.business_email || '',
        logoImage: updatedProfile?.logo_image ? { id: 'logo', src: updatedProfile.logo_image } : null,
        coverPhoto: updatedProfile?.cover_image ? { id: 'cover', src: updatedProfile.cover_image } : null,
        fulfillment: {
          delivery: Boolean(updatedProfile?.offers_delivery),
          pickup: Boolean(updatedProfile?.offers_pickup),
        },
      });
      setInitial(nextData);
      setFormData(nextData);
      setStagedLogoPreview(null);
      setStagedCoverPreview(null);
      stagedImageIds.current.clear();
      setSaved(true);
    } catch (saveError) {
      const mapped = {};
      if (saveError?.errors && typeof saveError.errors === 'object') {
        Object.entries(saveError.errors).forEach(([k, msgs]) => {
          const msg = Array.isArray(msgs) ? msgs[0] : String(msgs);
          if (k === 'business_email') mapped.contactEmail = msg;
          else if (k === 'contact_phone') mapped.phone = msg;
          else mapped[k] = msg;
        });
        setFieldErrors(mapped);
      }
      const firstErr = Object.values(mapped)[0];
      setError(firstErr || saveError.message || 'Unable to save the business profile.');
    } finally {
      setSaving(false);
    }
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
          <div className="owner-profile-header-intro">
            <p className="owner-profile-eyebrow">Storefront Identity & Brand Settings</p>
            <h1>{formData.name || 'Business Profile'}</h1>
            <p className="owner-profile-header-subtitle">
              Customize your public storefront details, upload your restaurant logo and cover photo, and configure delivery coverage.
            </p>
          </div>
          <div className="owner-profile-header-actions">
            <Link to={`/customer/restaurants/${selectedRestaurantId}`} target="_blank" rel="noreferrer">
              <Button type="button" variant="outline">Open customer page</Button>
            </Link>
          </div>
        </header>

        {saved && <p className="owner-profile-success" role="status">✓ Profile changes saved and published to your storefront.</p>}
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
                    helper="Restaurant name cannot be changed after approval."
                    disabled
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
                    <h2>Restaurant photos & brand assets</h2>
                    <p>
                      Upload your restaurant logo, wide cover banner, and dining gallery. Images are validated, previewed before upload, and structured for Laravel&apos;s local public disk.
                    </p>
                  </div>
                </div>

                <div className="owner-profile-storage-banner">
                  <div>
                    <strong>Local Storage Path Ready</strong>
                    <span>
                      Relative paths are stored in MySQL while image files reside in{' '}
                      <code>storage/app/public/restaurants/{selectedRestaurantId}/&#123;logo,cover,menu,gallery&#125;</code>
                    </span>
                  </div>
                  <Badge variant="default">Public Disk</Badge>
                </div>

                <div className="owner-profile-media-fields">
                  <ImageUploader
                    id="profile-logo"
                    key={`profile-logo-${selectedRestaurantId}`}
                    label="Restaurant logo"
                    variant="logo"
                    restaurantId={selectedRestaurantId}
                    storageCategory="logo"
                    stageBeforeUpload
                    value={formData.logoImage}
                    onStagedPreviewChange={setStagedLogoPreview}
                    onChange={(logoImage) => handlePhotoChange('logoImage', logoImage, selectedRestaurantId, formData, initial)}
                    helperText="Recommended: Square (1:1) PNG or WebP, minimum 300 × 300 px, up to 5 MB."
                    deferCleanup
                  />
                  <ImageUploader
                    id="profile-cover"
                    key={`profile-cover-${selectedRestaurantId}`}
                    label="Restaurant cover photo"
                    variant="cover"
                    restaurantId={selectedRestaurantId}
                    storageCategory="cover"
                    stageBeforeUpload
                    value={formData.coverPhoto}
                    onStagedPreviewChange={setStagedCoverPreview}
                    onChange={(coverPhoto) => handlePhotoChange('coverPhoto', coverPhoto, selectedRestaurantId, formData, initial)}
                    helperText="Recommended: Wide (16:9) JPG, PNG, or WebP, minimum 300 × 300 px, up to 5 MB."
                    deferCleanup
                  />
                </div>
                <ImageGalleryUploader
                  id="profile-gallery"
                  key={`profile-gallery-${selectedRestaurantId}`}
                  label="Restaurant photo gallery"
                  restaurantId={selectedRestaurantId}
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
                    <p>
                      Pin your restaurant&apos;s physical kitchen location and configure delivery coverage strictly within Admin-approved service areas.
                    </p>
                  </div>
                </div>

                <LocationPicker
                  value={{
                    province: formData.location.province,
                    city: formData.location.city,
                    barangay: formData.location.barangay,
                    street: formData.location.streetAddress,
                    houseNumber: formData.location.buildingNumber,
                    postalCode: formData.location.postalCode,
                    notes: formData.location.landmark,
                    lat: formData.location.latitude === '' ? null : Number(formData.location.latitude),
                    lng: formData.location.longitude === '' ? null : Number(formData.location.longitude),
                  }}
                  onChange={(nextLoc) => {
                    updateProfile((previous) => ({
                      ...previous,
                      location: {
                        ...previous.location,
                        country: 'Philippines',
                        province: nextLoc.province ?? previous.location.province,
                        city: nextLoc.city ?? previous.location.city,
                        barangay: nextLoc.barangay ?? previous.location.barangay,
                        streetAddress: nextLoc.street ?? previous.location.streetAddress,
                        buildingNumber: nextLoc.houseNumber ?? previous.location.buildingNumber,
                        postalCode: nextLoc.postalCode ?? previous.location.postalCode,
                        landmark: nextLoc.notes ?? nextLoc.landmark ?? previous.location.landmark,
                        latitude: nextLoc.lat ?? previous.location.latitude,
                        longitude: nextLoc.lng ?? previous.location.longitude,
                      },
                    }));
                  }}
                  errors={{
                    city: fieldErrors.city,
                    street: fieldErrors.streetAddress,
                    coordinates: fieldErrors.coordinates,
                  }}
                  mapHeight={260}
                  confirmLabel="Restaurant Physical Location"
                />

                <RestaurantCoverageSection
                  restaurantLocation={formData.location}
                  selectedAreas={
                    Array.isArray(formData.deliveryCoverage.areas)
                      ? formData.deliveryCoverage.areas
                      : (formData.deliveryCoverage.cities || []).map((c) => ({
                          province: formData.location.province || 'Metro Manila',
                          city: c,
                          barangay: null,
                        }))
                  }
                  onChangeAreas={(areas) => {
                    updateProfile((previous) => ({
                      ...previous,
                      deliveryCoverage: {
                        ...previous.deliveryCoverage,
                        method: areas.some((a) => a.barangay) ? 'barangays' : 'cities',
                        areas,
                        cities: [...new Set(areas.map((a) => a.city).filter(Boolean))],
                        barangays: areas.map((a) => a.barangay).filter(Boolean),
                      },
                    }));
                  }}
                  onSaveCoverage={async (areas) => {
                    const numericId = Number(selectedRestaurantId);
                    if (Number.isFinite(numericId) && numericId > 0) {
                      await locationApiService.updateRestaurantCoverage({
                        restaurant_id: numericId,
                        areas,
                      });
                    }
                  }}
                  saving={saving}
                />

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
            <OwnerProfilePreview
              profile={formData}
              restaurantId={selectedRestaurantId}
              stagedLogoPreview={stagedLogoPreview}
              stagedCoverPreview={stagedCoverPreview}
            />
            <OperatingHoursEditor key={selectedRestaurantId} restaurantId={selectedRestaurantId} />
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
