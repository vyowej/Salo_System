import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createBusinessProfilePatch,
  formatBusinessAddress,
  getRemovedImageReferences,
  getStagedImageIds,
  toBusinessProfileForm,
  validateBusinessProfile,
} from './businessProfileData.js';
import { demoAdapter } from '../../../services/demo/demoAdapter.js';

const profile = {
  name: 'SALO Kitchen',
  description: 'A neighborhood kitchen.',
  cuisine: 'Filipino',
  foodCategories: 'Grill, Rice bowls\nDesserts',
  contactEmail: 'hello@example.com',
  phone: '09170000000',
  location: {
    buildingNumber: '12',
    streetAddress: 'Main Road',
    barangay: 'Central',
    city: 'Quezon City',
    province: '',
    region: 'NCR',
    postalCode: '',
    country: 'Philippines',
    latitude: '',
    longitude: '',
    landmark: '',
  },
  deliveryCoverage: {
    method: 'cities',
    cities: 'Quezon City, Manila',
    barangays: '',
    zones: '',
    radiusKm: '',
  },
  fulfillment: { delivery: true, pickup: false },
  logoImage: { id: 'logo-1', src: 'blob:temporary', alt: 'SALO logo' },
  coverPhoto: null,
  profilePhotos: [{ id: 'gallery-1', src: 'blob:temporary', alt: 'Dining room' }],
};

test('form values migrate legacy profile fields and keep public data normalized', () => {
  const data = toBusinessProfileForm({
    name: 'Legacy Kitchen',
    bio: 'Legacy description',
    address: 'Old address',
    categories: ['Mains', 'Drinks'],
    coverImage: 'LK',
  });

  assert.equal(data.description, 'Legacy description');
  assert.equal(data.location.streetAddress, 'Old address');
  assert.deepEqual(data.foodCategories, ['Mains', 'Drinks']);
  assert.equal(data.fulfillment.delivery, true);
});

test('profile validation requires location and validates coordinates and radius', () => {
  assert.deepEqual(validateBusinessProfile(profile), {});
  assert.deepEqual(validateBusinessProfile({
    ...profile,
    location: { ...profile.location, city: '', latitude: '91', longitude: '0' },
    deliveryCoverage: { ...profile.deliveryCoverage, method: 'radius', radiusKm: '0' },
  }), {
    city: 'City or municipality is required.',
    coordinates: 'Latitude must be between -90 and 90.',
    radiusKm: 'Enter a positive delivery radius.',
  });
});

test('profile patch is permission scoped and excludes temporary image URLs', () => {
  const patch = createBusinessProfilePatch(profile, {
    canEditProfile: false,
    canManageLocation: false,
    canManagePhotos: true,
  });

  assert.deepEqual(Object.keys(patch), ['logoImage', 'coverPhoto', 'profilePhotos']);
  assert.equal(patch.logoImage.src, undefined);
  assert.equal(patch.logoImage.alt, 'SALO logo');

  const locationPatch = createBusinessProfilePatch(profile, {
    canEditProfile: true,
    canManageLocation: true,
    canManagePhotos: false,
  });
  assert.equal(locationPatch.address, '12, Main Road, Central, Quezon City, NCR, Philippines');
  assert.deepEqual(locationPatch.foodCategories, ['Grill', 'Rice bowls', 'Desserts']);
});

test('staged and removed image references are calculated without deleting saved data', () => {
  const saved = {
    logoImage: { id: 'saved-logo' },
    coverPhoto: null,
    profilePhotos: [{ id: 'saved-gallery' }],
  };
  const current = {
    logoImage: { id: 'new-logo' },
    coverPhoto: null,
    profilePhotos: [{ id: 'saved-gallery' }, { id: 'new-gallery' }],
  };

  assert.deepEqual(getStagedImageIds(current, saved), ['new-logo', 'new-gallery']);
  assert.deepEqual(getRemovedImageReferences(current, saved), [{ id: 'saved-logo' }]);
  assert.equal(formatBusinessAddress({ city: 'Quezon City', country: 'Philippines' }), 'Quezon City, Philippines');
});

test('demo profile updates are shared with public reads and log only profile fields', () => {
  const restaurantId = 'dalisay-heritage';
  const before = demoAdapter.getRestaurant(restaurantId);
  demoAdapter.updateBusinessProfile({ name: before.name }, restaurantId);
  assert.equal(demoAdapter.getActivityLog(restaurantId).length, 0);

  const nextName = `${before.name} Profile Test`;
  demoAdapter.updateBusinessProfile({ name: nextName, description: before.description }, restaurantId);

  assert.equal(demoAdapter.getRestaurant(restaurantId).name, nextName);
  assert.equal(demoAdapter.getRestaurants().find((restaurant) => restaurant.id === restaurantId).name, nextName);

  const activity = demoAdapter.getActivityLog(restaurantId)[0];
  assert.equal(activity.module, 'business-profile');
  assert.equal(activity.action, 'updated');
  assert.equal(activity.before.name, before.name);
  assert.equal(activity.after.name, nextName);
  assert.equal(activity.before.orders, undefined);
  assert.equal(activity.after.earnings, undefined);
});
