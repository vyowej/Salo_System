function listFromValue(value) {
  if (Array.isArray(value)) return value.map((entry) => String(entry).trim()).filter(Boolean);
  return String(value || '').split(/[\n,]/).map((entry) => entry.trim()).filter(Boolean);
}

function imageReference(image) {
  if (!image?.id) return null;
  return {
    id: image.id,
    name: image.name || '',
    type: image.type || '',
    size: image.size || 0,
    width: image.width || 0,
    height: image.height || 0,
    alt: image.alt || '',
  };
}

export function formatBusinessAddress(location = {}) {
  return [
    location.buildingNumber,
    location.streetAddress,
    location.barangay,
    location.city,
    location.province,
    location.region,
    location.postalCode,
    location.country,
  ].map((part) => String(part || '').trim()).filter(Boolean).join(', ');
}

export function toBusinessProfileForm(restaurant = {}) {
  const location = restaurant.location || {};
  const coverage = restaurant.deliveryCoverage || {};
  const fulfillment = restaurant.fulfillment || {};

  return {
    name: restaurant.name || '',
    description: restaurant.description ?? restaurant.bio ?? '',
    cuisine: restaurant.cuisine || '',
    foodCategories: listFromValue(restaurant.foodCategories || restaurant.categories),
    contactEmail: restaurant.contactEmail || '',
    phone: restaurant.phone || '',
    location: {
      country: location.country || '',
      region: location.region || '',
      province: location.province || '',
      city: location.city || '',
      barangay: location.barangay || '',
      streetAddress: location.streetAddress || restaurant.address || '',
      buildingNumber: location.buildingNumber || '',
      landmark: location.landmark || '',
      postalCode: location.postalCode || '',
      latitude: location.latitude ?? '',
      longitude: location.longitude ?? '',
    },
    deliveryCoverage: {
      method: coverage.method || '',
      cities: listFromValue(coverage.cities),
      barangays: listFromValue(coverage.barangays),
      zones: coverage.zones || '',
      radiusKm: coverage.radiusKm ?? '',
    },
    fulfillment: {
      delivery: fulfillment.delivery ?? true,
      pickup: fulfillment.pickup ?? true,
    },
    logoImage: restaurant.logoImage || null,
    coverPhoto: restaurant.coverPhoto || null,
    profilePhotos: Array.isArray(restaurant.profilePhotos) ? restaurant.profilePhotos : [],
    operatingHours: restaurant.operatingHours || '',
    rating: restaurant.rating ?? null,
    reviewCount: restaurant.reviewCount ?? 0,
    categories: listFromValue(restaurant.categories),
    menu: Array.isArray(restaurant.menu) ? restaurant.menu : [],
    promotions: Array.isArray(restaurant.promotions) ? restaurant.promotions : [],
    isOpen: Boolean(restaurant.isOpen),
  };
}

export function validateBusinessProfile(profile, permissions = {
  canEditProfile: true,
  canManageLocation: true,
}) {
  const errors = {};
  const location = profile.location || {};
  const latitude = location.latitude === '' ? null : Number(location.latitude);
  const longitude = location.longitude === '' ? null : Number(location.longitude);
  const radiusKm = profile.deliveryCoverage?.radiusKm === ''
    ? null
    : Number(profile.deliveryCoverage?.radiusKm);

  if (permissions.canEditProfile && !String(profile.name || '').trim()) {
    errors.name = 'Restaurant name is required.';
  }
  if (permissions.canEditProfile && profile.contactEmail
    && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.contactEmail)) {
    errors.contactEmail = 'Enter a valid contact email address.';
  }

  if (permissions.canManageLocation) {
    if (!String(location.streetAddress || '').trim()) errors.streetAddress = 'Street address is required.';
    if (!String(location.city || '').trim()) errors.city = 'City or municipality is required.';

    if ((location.latitude !== '' && !Number.isFinite(latitude))
      || (location.longitude !== '' && !Number.isFinite(longitude))) {
      errors.coordinates = 'Map coordinates must be valid numbers.';
    } else if ((latitude === null) !== (longitude === null)) {
      errors.coordinates = 'Enter both latitude and longitude, or leave both blank.';
    } else if (latitude !== null && (latitude < -90 || latitude > 90)) {
      errors.coordinates = 'Latitude must be between -90 and 90.';
    } else if (longitude !== null && (longitude < -180 || longitude > 180)) {
      errors.coordinates = 'Longitude must be between -180 and 180.';
    }

    if (profile.deliveryCoverage?.method === 'radius'
      && (radiusKm === null || !Number.isFinite(radiusKm) || radiusKm <= 0)) {
      errors.radiusKm = 'Enter a positive delivery radius.';
    }
  }

  return errors;
}

export function createBusinessProfilePatch(profile, permissions) {
  const patch = {};

  if (permissions.canEditProfile) {
    patch.name = String(profile.name || '').trim();
    patch.description = String(profile.description || '').trim();
    patch.bio = patch.description;
    patch.cuisine = String(profile.cuisine || '').trim();
    patch.foodCategories = listFromValue(profile.foodCategories);
    patch.contactEmail = String(profile.contactEmail || '').trim();
    patch.phone = String(profile.phone || '').trim();
  }

  if (permissions.canManageLocation) {
    patch.location = {
      ...profile.location,
      latitude: profile.location.latitude === '' ? null : Number(profile.location.latitude),
      longitude: profile.location.longitude === '' ? null : Number(profile.location.longitude),
    };
    patch.address = formatBusinessAddress(patch.location);
    patch.deliveryCoverage = {
      method: profile.deliveryCoverage.method || '',
      cities: listFromValue(profile.deliveryCoverage.cities),
      barangays: listFromValue(profile.deliveryCoverage.barangays),
      zones: String(profile.deliveryCoverage.zones || '').trim(),
      radiusKm: profile.deliveryCoverage.radiusKm === '' ? null : Number(profile.deliveryCoverage.radiusKm),
    };
    patch.fulfillment = { ...profile.fulfillment };
  }

  if (permissions.canManagePhotos) {
    patch.logoImage = imageReference(profile.logoImage);
    patch.coverPhoto = imageReference(profile.coverPhoto);
    patch.profilePhotos = profile.profilePhotos.map(imageReference).filter(Boolean);
  }

  return patch;
}

export function getStagedImageIds(profile, savedProfile) {
  const savedIds = new Set([
    savedProfile.logoImage?.id,
    savedProfile.coverPhoto?.id,
    ...savedProfile.profilePhotos.map((image) => image.id),
  ].filter(Boolean));
  const currentIds = [
    profile.logoImage?.id,
    profile.coverPhoto?.id,
    ...profile.profilePhotos.map((image) => image.id),
  ].filter(Boolean);
  return [...new Set(currentIds.filter((id) => !savedIds.has(id)))];
}

export function getRemovedImageReferences(profile, savedProfile) {
  const currentIds = new Set([
    profile.logoImage?.id,
    profile.coverPhoto?.id,
    ...profile.profilePhotos.map((image) => image.id),
  ].filter(Boolean));
  return [
    savedProfile.logoImage,
    savedProfile.coverPhoto,
    ...savedProfile.profilePhotos,
  ].filter((image) => image?.id && !currentIds.has(image.id));
}
