/**
 * SALO — Role-Based Onboarding Service
 * Manages per-user, per-role non-sensitive onboarding state, Philippine mobile validation,
 * and real data derivation for Customer, Rider, and Business / Restaurant Owner onboarding.
 */

import BUSINESS_ONBOARDING_CONTENT from '../config/onboarding/businessOnboardingContent.js';
import RIDER_ONBOARDING_CONTENT from '../config/onboarding/riderOnboardingContent.js';

export const ONBOARDING_CHANGED_EVENT = 'salo:onboardingChanged';

const memoryStore = new Map();

function getStorage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

function readItem(key) {
  const storage = getStorage();
  if (storage) {
    try {
      const val = storage.getItem(key);
      if (val !== null) return val;
    } catch {
      // Fall back to in-memory store
    }
  }
  return memoryStore.has(key) ? memoryStore.get(key) : null;
}

function writeItem(key, value) {
  memoryStore.set(key, value);
  const storage = getStorage();
  if (storage) {
    try {
      storage.setItem(key, value);
    } catch {
      // Keep in-memory state if storage quota/permissions block writes
    }
  }
}

function notifyOnboardingChanged(detail = {}) {
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    try {
      window.dispatchEvent(new CustomEvent(ONBOARDING_CHANGED_EVENT, { detail }));
    } catch {
      // Ignore in non-DOM test environments
    }
  }
}

export function normalizeOnboardingRole(role) {
  const key = String(role || '').trim().toLowerCase();
  if (key === 'owner' || key === 'restaurant' || key === 'restaurant_owner' || key === 'business') {
    return 'business';
  }
  if (key === 'rider') return 'rider';
  if (key === 'customer') return 'customer';
  return key;
}

export function getOnboardingStorageKey(userId, role) {
  const cleanId = String(userId ?? '').trim();
  const cleanRole = normalizeOnboardingRole(role);
  if (!cleanId || !cleanRole) return null;
  return `salo_onboarding_${cleanId}_${cleanRole}`;
}

export function getOnboardingState(userId, role) {
  const key = getOnboardingStorageKey(userId, role);
  if (!key) return { status: null, updatedAt: null };

  const raw = readItem(key);
  if (!raw) return { status: null, updatedAt: null };

  try {
    const parsed = JSON.parse(raw);
    if (parsed && (parsed.status === 'completed' || parsed.status === 'skipped')) {
      return {
        status: parsed.status,
        updatedAt: parsed.updatedAt || null,
      };
    }
  } catch {
    if (raw === 'completed' || raw === 'skipped') {
      return { status: raw, updatedAt: null };
    }
  }

  return { status: null, updatedAt: null };
}

export function isOnboardingDone(userId, role) {
  const state = getOnboardingState(userId, role);
  return state.status === 'completed' || state.status === 'skipped';
}

export function setOnboardingState(userId, role, status = 'completed') {
  const key = getOnboardingStorageKey(userId, role);
  if (!key) return null;

  const normalizedStatus = status === 'skipped' ? 'skipped' : 'completed';
  const payload = {
    status: normalizedStatus,
    updatedAt: new Date().toISOString(),
  };

  writeItem(key, JSON.stringify(payload));
  notifyOnboardingChanged({
    userId: String(userId),
    role: normalizeOnboardingRole(role),
    status: normalizedStatus,
  });

  return payload;
}

export function clearOnboardingMemoryForTest() {
  memoryStore.clear();
  const storage = getStorage();
  if (storage) {
    try {
      const keysToDelete = [];
      for (let i = 0; i < storage.length; i += 1) {
        const k = storage.key(i);
        if (k && (k.startsWith('salo_onboarding_') || k.startsWith('salo_setup_checklist_dismissed_'))) {
          keysToDelete.push(k);
        }
      }
      keysToDelete.forEach((k) => storage.removeItem(k));
    } catch {
      // Ignore
    }
  }
}

export function getChecklistDismissKey(userId, restaurantId) {
  const cleanUser = String(userId ?? '').trim();
  const cleanRest = String(restaurantId ?? '').trim();
  if (!cleanUser || !cleanRest) return null;
  return `salo_setup_checklist_dismissed_${cleanUser}_${cleanRest}`;
}

export function isSetupChecklistDismissed(userId, restaurantId) {
  const key = getChecklistDismissKey(userId, restaurantId);
  if (!key) return false;
  return readItem(key) === '1';
}

export function dismissSetupChecklist(userId, restaurantId) {
  const key = getChecklistDismissKey(userId, restaurantId);
  if (!key) return;
  writeItem(key, '1');
  notifyOnboardingChanged({ type: 'checklist-dismissed', userId, restaurantId });
}

/**
 * Philippine Mobile Number Validation & Normalization
 * Accepts 09XXXXXXXXX or +639XXXXXXXXX (ignoring spaces/hyphens/parentheses)
 * and normalizes to 09XXXXXXXXX.
 */
export function normalizePhilippineMobile(raw) {
  if (raw === null || raw === undefined) return '';
  const cleaned = String(raw).trim().replace(/[\s\-()]+/g, '');
  const plusMatch = /^\+63(9\d{9})$/.exec(cleaned);
  if (plusMatch) {
    return `0${plusMatch[1]}`;
  }
  return cleaned;
}

export function isValidPhilippineMobile(raw) {
  const normalized = normalizePhilippineMobile(raw);
  return /^09\d{9}$/.test(normalized);
}

/**
 * Evaluates whether a role's onboarding modal should be displayed.
 * Pure decision function for testability and hook reuse.
 */
export function evaluateShouldShowOnboarding({
  role,
  user,
  hasSavedPhone = false,
  hasSavedAddress = false,
  isApprovedRider = false,
  isApprovedOwner = false,
  isStaffOnly = false,
}) {
  if (!user) return false;

  const userId = user.user_id ?? user.id;
  if (!userId) return false;

  // Rule 2: Admin gets none.
  if (user.user_role === 'admin' || user.capabilities?.is_admin || user.role === 'admin') {
    return false;
  }

  const normalizedRole = normalizeOnboardingRole(role);

  // Rule 3 & 4: Check per-user, per-role completion or skip flag
  if (isOnboardingDone(userId, normalizedRole)) {
    return false;
  }

  if (normalizedRole === 'customer') {
    const phonePresent = Boolean(
      hasSavedPhone ||
      (user.phone_number && String(user.phone_number).trim()) ||
      (user.phone && String(user.phone).trim()),
    );
    if (phonePresent || hasSavedAddress) {
      return false;
    }
    return true;
  }

  if (normalizedRole === 'rider') {
    const riderStatus = String(user.rider_profile?.rider_status || user.riderStatus || '').toLowerCase();
    const roleHasRider = Array.isArray(user.roles) && user.roles.includes('rider');
    const approved = Boolean(
      isApprovedRider ||
      (roleHasRider && (riderStatus === 'approved' || riderStatus === 'active' || !riderStatus)),
    );
    if (!approved || ['pending', 'rejected', 'suspended', 'inactive'].includes(riderStatus)) {
      return false;
    }
    return true;
  }

  if (normalizedRole === 'business') {
    if (isStaffOnly || user.role === 'staff') {
      return false;
    }
    if (!isApprovedOwner) {
      return false;
    }
    return true;
  }

  return false;
}

/**
 * Derives Rider Step 3 ("Before you go online") checklist items strictly from real backend data
 * and browser location permission state. Missing backend fields are omitted rather than faked.
 */
export function deriveRiderGoOnlineChecklist(
  dashboardData,
  locationPermission = 'prompt',
  reqConfig = RIDER_ONBOARDING_CONTENT.steps.find((s) => s.id === 'before-online')?.requirements,
) {
  const items = [];
  if (!reqConfig) return items;

  const rider = dashboardData?.rider || null;
  const stats = dashboardData?.stats || null;

  if (rider && typeof rider.rider_status === 'string') {
    const status = rider.rider_status.toLowerCase();
    const isApproved = status === 'approved' || status === 'active';
    items.push({
      id: 'applicationApproved',
      label: reqConfig.applicationApproved.label,
      detail: reqConfig.applicationApproved.approvedDetail,
      done: isApproved,
    });

    const isActive = status === 'active' || status === 'approved';
    items.push({
      id: 'accountActive',
      label: reqConfig.accountActive.label,
      detail: isActive ? reqConfig.accountActive.activeDetail : reqConfig.accountActive.pendingDetail,
      done: isActive,
    });
  }

  if (rider && typeof rider.base_city === 'string' && rider.base_city.trim() !== '') {
    items.push({
      id: 'eligibleZone',
      label: reqConfig.eligibleZone.label,
      detail: `${reqConfig.eligibleZone.detailPrefix}${rider.base_city.trim()}`,
      done: true,
    });
  }

  const currentShift = dashboardData?.current_shift ?? rider?.current_shift ?? null;
  if (currentShift && typeof currentShift === 'object' && currentShift.label) {
    items.push({
      id: 'assignedShift',
      label: reqConfig.assignedShift.label,
      detail: String(currentShift.label),
      done: Boolean(currentShift.active),
    });
  }

  if (stats && typeof stats.has_active_delivery === 'boolean') {
    const isClear = stats.has_active_delivery === false;
    items.push({
      id: 'noConflictingDelivery',
      label: reqConfig.noConflictingDelivery.label,
      detail: isClear
        ? reqConfig.noConflictingDelivery.clearDetail
        : reqConfig.noConflictingDelivery.busyDetail,
      done: isClear,
    });
  }

  const locGranted = locationPermission === 'granted';
  const locDetail = locGranted
    ? reqConfig.locationPermission.grantedDetail
    : locationPermission === 'denied'
      ? reqConfig.locationPermission.deniedDetail
      : locationPermission === 'unsupported'
        ? reqConfig.locationPermission.unsupportedDetail
        : reqConfig.locationPermission.promptDetail;

  items.push({
    id: 'locationPermission',
    label: reqConfig.locationPermission.label,
    detail: locDetail,
    done: locGranted,
    isLocationAction: true,
    permissionState: locationPermission,
  });

  return items;
}

/**
 * Derives Business / Restaurant Owner setup checklist items from either:
 * 1) Backend `/api/restaurant/setup-status` payload (`backendStatus`), OR
 * 2) Live workspace restaurant data (`workspaceData`: restaurant, operatingHours, menuCategories, menuItems, tables).
 * Never stores checklist state and omits any item whose backing data does not exist or is not applicable.
 */
export function deriveBusinessSetupChecklist({
  backendStatus = null,
  workspaceData = null,
  itemsConfig = BUSINESS_ONBOARDING_CONTENT.steps.find((s) => s.id === 'setup-checklist')?.items,
} = {}) {
  if (!itemsConfig) {
    return { items: [], completedCount: 0, totalCount: 0, allComplete: false, firstIncompleteHref: '/owner' };
  }

  const derived = [];

  if (backendStatus && typeof backendStatus === 'object') {
    if (backendStatus.business_profile && typeof backendStatus.business_profile.complete === 'boolean') {
      derived.push({
        ...itemsConfig.businessProfile,
        done: backendStatus.business_profile.complete,
      });
    }

    if (backendStatus.operating_hours && typeof backendStatus.operating_hours.complete === 'boolean') {
      derived.push({
        ...itemsConfig.operatingHours,
        done: backendStatus.operating_hours.complete,
      });
    }

    if (backendStatus.menu && typeof backendStatus.menu.complete === 'boolean') {
      derived.push({
        ...itemsConfig.menu,
        done: backendStatus.menu.complete,
      });
    }

    if (
      backendStatus.tables &&
      backendStatus.tables.applicable === true &&
      typeof backendStatus.tables.complete === 'boolean'
    ) {
      derived.push({
        ...itemsConfig.tables,
        done: backendStatus.tables.complete,
      });
    }

    if (backendStatus.availability_toggles && typeof backendStatus.availability_toggles.complete === 'boolean') {
      derived.push({
        ...itemsConfig.availabilityToggles,
        done: backendStatus.availability_toggles.complete,
      });
    }

    const publishBlockers = Array.isArray(backendStatus.publish?.blockers) ? backendStatus.publish.blockers : [];
    const hasCoverageBlocker = publishBlockers.some((msg) => /delivery service area/i.test(String(msg)));
    if (
      itemsConfig.deliveryCoverage &&
      (hasCoverageBlocker || (backendStatus.delivery_coverage && typeof backendStatus.delivery_coverage.complete === 'boolean'))
    ) {
      derived.push({
        ...itemsConfig.deliveryCoverage,
        done: !hasCoverageBlocker && Boolean(backendStatus.delivery_coverage?.complete),
      });
    }

    if (backendStatus.publish && typeof backendStatus.publish.complete === 'boolean' && itemsConfig.publish) {
      derived.push({
        ...itemsConfig.publish,
        done: backendStatus.publish.complete,
      });
    }
  } else if (workspaceData && workspaceData.restaurant) {
    const rest = workspaceData.restaurant;
    const loc = rest.location || {};

    const hasLogo = Boolean(rest.logoImage?.id || rest.logoImage?.src || rest.logo_image || (typeof rest.logoImage === 'string' && rest.logoImage.trim()));
    const hasCover = Boolean(rest.coverPhoto?.id || rest.coverPhoto?.src || rest.cover_image || (typeof rest.coverPhoto === 'string' && rest.coverPhoto.trim()));
    const hasInfo = Boolean(
      rest.name?.trim() &&
      (rest.description?.trim() || rest.bio?.trim()) &&
      rest.phone?.trim() &&
      rest.contactEmail?.trim(),
    );
    const hasAddress = Boolean(
      rest.address?.trim() ||
      (loc.streetAddress?.trim() && loc.city?.trim()),
    );

    derived.push({
      ...itemsConfig.businessProfile,
      done: hasLogo && hasCover && hasInfo && hasAddress,
    });

    const schedule = workspaceData.operatingHours || rest.operatingSchedule || null;
    if (schedule && schedule.weeklySchedule) {
      const days = Object.values(schedule.weeklySchedule);
      const hasOpenPeriod = days.some(
        (day) => !day.closed && Array.isArray(day.periods) && day.periods.length > 0,
      );
      derived.push({
        ...itemsConfig.operatingHours,
        done: hasOpenPeriod,
      });
    }

    const categories = Array.isArray(workspaceData.menuCategories)
      ? workspaceData.menuCategories
      : Array.isArray(rest.menuCategories)
        ? rest.menuCategories
        : Array.isArray(rest.categories)
          ? rest.categories
          : null;
    const menuItems = Array.isArray(workspaceData.menuItems)
      ? workspaceData.menuItems
      : Array.isArray(rest.menu)
        ? rest.menu
        : null;

    if (categories !== null && menuItems !== null) {
      const activeCats = categories.filter((c) => (typeof c === 'string' ? Boolean(c.trim()) : c.visible !== false));
      const visibleItems = menuItems.filter((item) => item.availability !== 'hidden');
      derived.push({
        ...itemsConfig.menu,
        done: activeCats.length >= 1 && visibleItems.length >= 1,
      });
    }

    const offersDineIn = rest.offers_dine_in !== undefined
      ? Boolean(rest.offers_dine_in)
      : rest.fulfillment?.dineIn !== undefined
        ? Boolean(rest.fulfillment.dineIn)
        : true;
    const acceptsReservations = rest.accepts_reservations !== undefined
      ? Boolean(rest.accepts_reservations)
      : rest.operatingSchedule?.acceptingReservations !== undefined
        ? Boolean(rest.operatingSchedule.acceptingReservations)
        : Boolean(rest.reservationDeposit);

    const tablesApplicable = offersDineIn || acceptsReservations;
    const tablesList = Array.isArray(workspaceData.tables)
      ? workspaceData.tables
      : Array.isArray(rest.tables)
        ? rest.tables
        : null;

    if (tablesApplicable && tablesList !== null) {
      const activeTables = tablesList.filter(
        (t) => t.availability !== 'unavailable' && t.status !== 'Unavailable',
      );
      derived.push({
        ...itemsConfig.tables,
        done: activeTables.length >= 1,
      });
    }

    if (schedule && typeof schedule.acceptingOrders === 'boolean') {
      const togglesDone = Boolean(schedule.acceptingOrders) &&
        (!acceptsReservations || Boolean(schedule.acceptingReservations));
      derived.push({
        ...itemsConfig.availabilityToggles,
        done: togglesDone,
      });
    }
  }

  const completedCount = derived.filter((item) => item.done).length;
  const totalCount = derived.length;
  const allComplete = totalCount > 0 && completedCount === totalCount;
  const firstIncomplete = derived.find((item) => !item.done);

  return {
    items: derived,
    completedCount,
    totalCount,
    allComplete,
    firstIncompleteHref: firstIncomplete?.href || BUSINESS_ONBOARDING_CONTENT.overviewPath,
  };
}

const inFlightSetupStatus = new Map();

export async function fetchRestaurantSetupStatus(restaurantId = null) {
  const { default: apiClient } = await import('./apiClient.js');
  const numericId = Number(restaurantId);
  const qs = Number.isFinite(numericId) && numericId > 0
    ? `?restaurant_id=${encodeURIComponent(numericId)}`
    : '';
  const endpoint = `/restaurant/setup-status${qs}`;

  if (inFlightSetupStatus.has(endpoint)) {
    return inFlightSetupStatus.get(endpoint);
  }

  const requestPromise = (async () => {
    const response = await apiClient.get(endpoint, {
      skipAuthInvalidEvent: true,
    });
    return response?.data?.setup_status ?? null;
  })();

  inFlightSetupStatus.set(endpoint, requestPromise);

  try {
    return await requestPromise;
  } finally {
    inFlightSetupStatus.delete(endpoint);
  }
}

export const onboardingService = {
  getOnboardingStorageKey,
  getOnboardingState,
  isOnboardingDone,
  setOnboardingState,
  clearOnboardingMemoryForTest,
  isSetupChecklistDismissed,
  dismissSetupChecklist,
  normalizePhilippineMobile,
  isValidPhilippineMobile,
  evaluateShouldShowOnboarding,
  deriveRiderGoOnlineChecklist,
  deriveBusinessSetupChecklist,
  fetchRestaurantSetupStatus,
};

export default onboardingService;
