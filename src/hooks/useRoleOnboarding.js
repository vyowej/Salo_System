import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from './useAuth';
import locationApiService from '../services/locationApiService';
import riderService from '../services/riderService';
import ownerService from '../services/ownerService';
import restaurantService from '../services/restaurantService';
import {
  ONBOARDING_CHANGED_EVENT,
  normalizeOnboardingRole,
  isOnboardingDone,
  setOnboardingState,
  evaluateShouldShowOnboarding,
  deriveBusinessSetupChecklist,
  fetchRestaurantSetupStatus,
} from '../services/onboardingService';

/**
 * Shared hook to determine whether a role's onboarding modal should display,
 * load real role-scoped backend/workspace status data, and record completion or skip.
 */
export function useRoleOnboarding(role, options = {}) {
  const { user, isAuthenticated, loading: authLoading, updateUser } = useAuth();
  const normalizedRole = normalizeOnboardingRole(role);
  const userId = user?.user_id ?? user?.id ?? null;

  const {
    access = null,
    selectedRestaurantId = null,
  } = options;

  const [doneTick, setDoneTick] = useState(0);
  const [flowActive, setFlowActive] = useState(false);

  // Customer address check state
  const [customerAddressCheck, setCustomerAddressCheck] = useState({
    checkedUserId: null,
    loading: false,
    hasSavedAddress: false,
    addresses: [],
  });

  // Rider backend status state
  const [riderDashboardData, setRiderDashboardData] = useState(null);
  const [riderLoading, setRiderLoading] = useState(false);

  // Business setup checklist backend status state
  const [businessBackendStatus, setBusinessBackendStatus] = useState(null);
  const [businessLoading, setBusinessLoading] = useState(false);
  const [workspaceVersion, setWorkspaceVersion] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handleSync = () => setDoneTick((t) => t + 1);
    const handleStoreUpdate = () => setWorkspaceVersion((v) => v + 1);

    window.addEventListener(ONBOARDING_CHANGED_EVENT, handleSync);
    window.addEventListener('storage', handleSync);
    window.addEventListener('salo:demoStoreUpdated', handleStoreUpdate);

    return () => {
      window.removeEventListener(ONBOARDING_CHANGED_EVENT, handleSync);
      window.removeEventListener('storage', handleSync);
      window.removeEventListener('salo:demoStoreUpdated', handleStoreUpdate);
    };
  }, []);

  const alreadyDone = useMemo(() => {
    void doneTick;
    if (!userId) return true;
    return isOnboardingDone(userId, normalizedRole);
  }, [userId, normalizedRole, doneTick]);

  // Reset active flow if user changes
  useEffect(() => {
    setFlowActive(false);
  }, [userId, normalizedRole]);

  // 1. Customer: check backend saved addresses when user has no phone and hasn't finished/skipped
  useEffect(() => {
    if (normalizedRole !== 'customer' || !isAuthenticated || !userId || alreadyDone) {
      return undefined;
    }

    const hasPhone = Boolean(
      (user?.phone_number && String(user.phone_number).trim()) ||
      (user?.phone && String(user.phone).trim()),
    );
    if (hasPhone) {
      setCustomerAddressCheck({
        checkedUserId: userId,
        loading: false,
        hasSavedAddress: false,
        addresses: [],
      });
      return undefined;
    }

    let cancelled = false;
    setCustomerAddressCheck((prev) => ({ ...prev, loading: true }));

    locationApiService
      .getCustomerAddresses()
      .then((list) => {
        if (cancelled) return;
        const validList = Array.isArray(list) ? list : [];
        setCustomerAddressCheck({
          checkedUserId: userId,
          loading: false,
          hasSavedAddress: validList.length > 0,
          addresses: validList,
        });
      })
      .catch(() => {
        if (cancelled) return;
        setCustomerAddressCheck({
          checkedUserId: userId,
          loading: false,
          hasSavedAddress: false,
          addresses: [],
        });
      });

    return () => {
      cancelled = true;
    };
  }, [normalizedRole, isAuthenticated, userId, alreadyDone, user?.phone_number, user?.phone]);

  // 2. Rider: fetch real backend rider dashboard status
  useEffect(() => {
    if (normalizedRole !== 'rider' || !isAuthenticated || !userId || alreadyDone) {
      return undefined;
    }

    let cancelled = false;
    setRiderLoading(true);

    riderService
      .getDashboard()
      .then((data) => {
        if (!cancelled) {
          setRiderDashboardData(data || null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRiderDashboardData(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setRiderLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [normalizedRole, isAuthenticated, userId, alreadyDone]);

  // Determine whether the current user is an approved restaurant owner (and not staff/pending)
  const isApprovedOwner = useMemo(() => {
    if (!user || normalizedRole !== 'business') return false;
    if (user.role === 'staff' || access?.actorType === 'staff') return false;

    const backendOwnerships = Array.isArray(user.restaurant_ownerships)
      ? user.restaurant_ownerships
      : null;

    if (backendOwnerships) {
      const hasApprovedBackendRest = backendOwnerships.some((o) =>
        ['approved', 'active'].includes(String(o.restaurant_status || '').toLowerCase()),
      );
      if (!hasApprovedBackendRest) return false;
      if (access && access.isOwner === false) return false;
      return true;
    }

    return Boolean(access?.isOwner && access?.membership?.status === 'approved');
  }, [user, normalizedRole, access]);

  // Resolve backend numeric restaurant ID if user has one in restaurant_ownerships
  const backendRestaurantId = useMemo(() => {
    const numericSelected = Number(selectedRestaurantId);
    if (Number.isFinite(numericSelected) && numericSelected > 0) {
      return numericSelected;
    }
    if (Array.isArray(user?.restaurant_ownerships)) {
      const approved = user.restaurant_ownerships.find((o) =>
        ['approved', 'active'].includes(String(o.restaurant_status || '').toLowerCase()),
      );
      if (approved?.restaurant_id) return Number(approved.restaurant_id);
    }
    return null;
  }, [selectedRestaurantId, user]);

  // 3. Business: fetch backend setup status if numeric backend restaurant_id exists
  useEffect(() => {
    if (normalizedRole !== 'business' || !isAuthenticated || !userId || !isApprovedOwner) {
      return undefined;
    }
    if (!backendRestaurantId) {
      setBusinessBackendStatus(null);
      return undefined;
    }

    let cancelled = false;
    setBusinessLoading(true);

    fetchRestaurantSetupStatus(backendRestaurantId)
      .then((status) => {
        if (!cancelled) {
          setBusinessBackendStatus(status || null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setBusinessBackendStatus(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setBusinessLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [normalizedRole, isAuthenticated, userId, isApprovedOwner, backendRestaurantId, workspaceVersion]);

  // Compute Business Setup Checklist from backend status or live workspace restaurant data
  const businessChecklist = useMemo(() => {
    void workspaceVersion;
    if (normalizedRole !== 'business' || !isApprovedOwner) {
      return { items: [], completedCount: 0, totalCount: 0, allComplete: false, firstIncompleteHref: '/owner' };
    }

    if (businessBackendStatus) {
      return deriveBusinessSetupChecklist({ backendStatus: businessBackendStatus });
    }

    const targetRestId = selectedRestaurantId || access?.selectedRestaurantId || null;
    if (!targetRestId) {
      return { items: [], completedCount: 0, totalCount: 0, allComplete: false, firstIncompleteHref: '/owner' };
    }

    try {
      const rest = ownerService.getRestaurant(targetRestId);
      if (!rest) {
        return { items: [], completedCount: 0, totalCount: 0, allComplete: false, firstIncompleteHref: '/owner' };
      }
      let operatingHours = null;
      let menuCategories = null;
      let menuItems = null;
      let tables = null;

      try {
        operatingHours = restaurantService.getOperatingHours(targetRestId);
      } catch {
        operatingHours = rest.operatingSchedule || null;
      }
      try {
        menuCategories = ownerService.getMenuCategories(targetRestId);
      } catch {
        menuCategories = rest.menuCategories || rest.categories || null;
      }
      try {
        menuItems = ownerService.getMenuItems(targetRestId);
      } catch {
        menuItems = rest.menu || null;
      }
      try {
        tables = ownerService.getTables(targetRestId);
      } catch {
        tables = rest.tables || null;
      }

      return deriveBusinessSetupChecklist({
        workspaceData: {
          restaurant: rest,
          operatingHours,
          menuCategories,
          menuItems,
          tables,
        },
      });
    } catch {
      return { items: [], completedCount: 0, totalCount: 0, allComplete: false, firstIncompleteHref: '/owner' };
    }
  }, [
    normalizedRole,
    isApprovedOwner,
    businessBackendStatus,
    selectedRestaurantId,
    access?.selectedRestaurantId,
    workspaceVersion,
  ]);

  // Evaluate whether the onboarding modal should trigger
  const triggerEligible = useMemo(() => {
    if (authLoading || !isAuthenticated || !user || !userId) return false;
    if (alreadyDone) return false;

    if (normalizedRole === 'customer') {
      const hasPhone = Boolean(
        (user.phone_number && String(user.phone_number).trim()) ||
        (user.phone && String(user.phone).trim()),
      );
      if (hasPhone) return false;
      if (customerAddressCheck.loading || customerAddressCheck.checkedUserId !== userId) {
        return false;
      }
      return evaluateShouldShowOnboarding({
        role: 'customer',
        user,
        hasSavedPhone: hasPhone,
        hasSavedAddress: customerAddressCheck.hasSavedAddress,
      });
    }

    if (normalizedRole === 'rider') {
      const riderStatus = String(
        riderDashboardData?.rider?.rider_status ||
        user.rider_profile?.rider_status ||
        '',
      ).toLowerCase();
      const isApprovedRider =
        (Array.isArray(user.roles) && user.roles.includes('rider')) &&
        (!riderStatus || riderStatus === 'approved' || riderStatus === 'active');

      return evaluateShouldShowOnboarding({
        role: 'rider',
        user,
        isApprovedRider,
      });
    }

    if (normalizedRole === 'business') {
      return evaluateShouldShowOnboarding({
        role: 'business',
        user,
        isApprovedOwner,
        isStaffOnly: Boolean(access && !access.isOwner),
      });
    }

    return false;
  }, [
    authLoading,
    isAuthenticated,
    user,
    userId,
    alreadyDone,
    normalizedRole,
    customerAddressCheck,
    riderDashboardData,
    isApprovedOwner,
    access,
  ]);

  // Latch flowActive once eligible so intermediate saves in Customer Step 2/3 don't close the modal mid-wizard
  useEffect(() => {
    if (triggerEligible && !alreadyDone) {
      setFlowActive(true);
    }
  }, [triggerEligible, alreadyDone]);

  const shouldShow = Boolean((triggerEligible || flowActive) && !alreadyDone);

  const completeOnboarding = useCallback(() => {
    if (!userId) return;
    setOnboardingState(userId, normalizedRole, 'completed');
    setFlowActive(false);
  }, [userId, normalizedRole]);

  const skipOnboarding = useCallback(() => {
    if (!userId) return;
    setOnboardingState(userId, normalizedRole, 'skipped');
    setFlowActive(false);
  }, [userId, normalizedRole]);

  return {
    shouldShow,
    role: normalizedRole,
    user,
    userId,
    updateUser,
    completeOnboarding,
    skipOnboarding,
    customerAddresses: customerAddressCheck.addresses,
    riderDashboardData: riderDashboardData || (user?.rider_profile ? { rider: user.rider_profile } : null),
    riderLoading,
    businessChecklist,
    businessLoading,
    isApprovedOwner,
  };
}

export default useRoleOnboarding;
