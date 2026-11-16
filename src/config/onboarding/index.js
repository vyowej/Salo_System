import SHARED_ONBOARDING_CONTENT, { interpolateCopy } from './sharedOnboardingContent.js';
import CUSTOMER_ONBOARDING_CONTENT from './customerOnboardingContent.js';
import RIDER_ONBOARDING_CONTENT from './riderOnboardingContent.js';
import BUSINESS_ONBOARDING_CONTENT from './businessOnboardingContent.js';

export const ONBOARDING_CONTENT_BY_ROLE = {
  customer: CUSTOMER_ONBOARDING_CONTENT,
  rider: RIDER_ONBOARDING_CONTENT,
  business: BUSINESS_ONBOARDING_CONTENT,
};

export {
  SHARED_ONBOARDING_CONTENT,
  CUSTOMER_ONBOARDING_CONTENT,
  RIDER_ONBOARDING_CONTENT,
  BUSINESS_ONBOARDING_CONTENT,
  interpolateCopy,
};
