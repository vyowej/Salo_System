/**
 * Customer Onboarding Content Configuration
 * Role 1: Customer (collects phone number + default delivery address)
 */

export const CUSTOMER_ONBOARDING_CONTENT = {
  role: 'customer',
  roleBadge: 'Customer Account',
  steps: [
    {
      id: 'welcome',
      kind: 'welcome',
      titleTemplate: 'Welcome, {username}!',
      fallbackUsername: 'Friend',
      body: 'Ready to order? Let us set up your account first so checking out is faster.',
      highlights: [
        {
          id: 'fast-checkout',
          icon: 'phone',
          title: 'Reachable for updates',
          description: 'Receive quick calls or texts from riders and restaurants when your order is on the way.',
        },
        {
          id: 'nearby-kitchens',
          icon: 'pin',
          title: 'Default delivery address',
          description: 'See participating restaurants that deliver to your area and speed up checkout.',
        },
      ],
      primaryButton: 'Simulan na natin!',
      wholeSkipButton: 'Maybe later',
    },
    {
      id: 'phone',
      kind: 'phone',
      title: 'What is your mobile number?',
      helper: 'So riders or restaurants can reach you if there is an issue with your order.',
      fieldLabel: 'Philippine Mobile Number',
      fieldPlaceholder: '09171234567 or +639171234567',
      fieldHint: 'Accepted formats: 09XXXXXXXXX or +639XXXXXXXXX',
      validationError: 'Enter a valid mobile number, like 09171234567.',
      saveErrorFallback: 'Unable to save your mobile number right now. Please try again.',
      primaryButton: 'Next',
      stepSkipButton: 'Skip this step',
      backButton: 'Back',
    },
    {
      id: 'address',
      kind: 'address',
      title: 'Where should we deliver?',
      helper: 'Add your delivery address so we can show participating restaurants near you.',
      defaultAddressNote: 'Your first saved address will automatically be set as your default delivery address.',
      saveErrorFallback: 'Unable to save your delivery address right now. Please check the fields and try again.',
      primaryButton: 'Save address',
      stepSkipButton: 'Skip this step',
      backButton: 'Back',
    },
    {
      id: 'finish',
      kind: 'finish',
      title: 'All set! You are ready to order.',
      completedBody: 'You can update your contact details and delivery addresses anytime in Settings.',
      skippedBody: 'No problem! You can add these details anytime in Settings.',
      summaryLabels: {
        phoneSaved: 'Mobile number saved',
        phoneSkipped: 'Mobile number skipped for now',
        addressSaved: 'Default delivery address saved',
        addressSkipped: 'Delivery address skipped for now',
      },
      primaryButton: 'Start ordering',
    },
  ],
};

export default CUSTOMER_ONBOARDING_CONTENT;
