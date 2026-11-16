/**
 * Rider Onboarding Content Configuration
 * Role 2: Rider (guided intro, read-only checklist, safety & COD rules)
 */

export const RIDER_ONBOARDING_CONTENT = {
  role: 'rider',
  roleBadge: 'Delivery Rider',
  dashboardPath: '/rider',
  steps: [
    {
      id: 'welcome',
      kind: 'welcome',
      titleTemplate: 'Welcome, {username}!',
      fallbackUsername: 'Rider',
      body: 'Welcome to the SALO rider fleet. Here is a quick overview of how to get started.',
      highlights: [
        {
          id: 'shift-dispatch',
          icon: 'clock',
          title: 'Shift-based availability',
          description: 'Go online during your assigned schedule and receive delivery offers in your eligible zone.',
        },
        {
          id: 'guided-flow',
          icon: 'route',
          title: 'Clear delivery stages',
          description: 'Confirm restaurant pickup, customer drop-off, and proof of delivery step by step.',
        },
      ],
      primaryButton: 'Tara, mag-deliver tayo!',
      wholeSkipButton: 'Maybe later',
    },
    {
      id: 'how-it-works',
      kind: 'points',
      title: 'How deliveries work',
      helper: 'Here is how delivery assignments work inside your Rider workspace:',
      points: [
        {
          id: 'go-online-shift',
          icon: 'clock',
          title: 'Go online during your assigned shift',
          description: 'Enable Driver Mode when your scheduled shift is active and you are ready to receive assignments in your zone.',
        },
        {
          id: 'respond-offers',
          icon: 'bell',
          title: 'Review and respond to delivery offers',
          description: 'Incoming offers show the restaurant pickup location, customer delivery area, and payment collection details. Accept or decline within the response window.',
        },
        {
          id: 'follow-stages',
          icon: 'check-circle',
          title: 'Follow the delivery steps in order',
          description: 'Progress each assignment through Accepted, Picked Up, and Delivered, and submit the required proof of delivery upon completion.',
        },
      ],
      primaryButton: 'Next',
      stepSkipButton: 'Skip this step',
      backButton: 'Back',
    },
    {
      id: 'before-online',
      kind: 'rider-checklist',
      title: 'Before you go online',
      helper: 'Your account must meet these Go Online requirements before receiving delivery offers:',
      requirements: {
        applicationApproved: {
          label: 'Approved rider application',
          approvedDetail: 'Verified and approved by SALO Administration',
        },
        accountActive: {
          label: 'Active rider account',
          activeDetail: 'Account activated for Rider workspace operations',
          pendingDetail: 'Awaiting account activation',
        },
        eligibleZone: {
          label: 'Eligible delivery zone',
          detailPrefix: 'Assigned base city: ',
        },
        assignedShift: {
          label: 'Assigned shift schedule',
        },
        noConflictingDelivery: {
          label: 'No conflicting active delivery',
          clearDetail: 'Ready for a new assignment',
          busyDetail: 'Currently handling an active delivery',
        },
        locationPermission: {
          label: 'Device location permission',
          grantedDetail: 'Browser location access is enabled',
          promptDetail: 'Required before going online for dispatch and order tracking',
          deniedDetail: 'Location access was blocked in your browser settings',
          unsupportedDetail: 'Geolocation is not supported in this browser',
          requestButtonLabel: 'Enable Location Access',
          requestingLabel: 'Requesting permission...',
          grantedButtonLabel: 'Location Enabled',
        },
      },
      primaryButton: 'Next',
      stepSkipButton: 'Skip this step',
      backButton: 'Back',
    },
    {
      id: 'safety-cod',
      kind: 'points',
      title: 'Safety and cash-on-delivery',
      helper: 'Keep these safety and payment collection rules in mind on every trip:',
      points: [
        {
          id: 'road-safety',
          icon: 'shield',
          title: 'Do not use the app while driving',
          description: 'Always stop safely in a secure spot before checking offers, updating delivery statuses, or contacting a customer.',
        },
        {
          id: 'cod-exact-amount',
          icon: 'cash',
          title: 'Cash on Delivery (COD) collection & remittance',
          description: 'For COD orders, the authoritative amount to collect comes from the system. Collect the exact amount only — collected COD cash is remitted to SALO and confirmed by an administrator (it is not rider income).',
        },
        {
          id: 'online-paid-orders',
          icon: 'card',
          title: 'Never collect again on online-paid orders',
          description: 'When an order is marked as already paid online, hand over the order and never request payment from the customer again.',
        },
      ],
      primaryButton: 'Next',
      backButton: 'Back',
    },
    {
      id: 'finish',
      kind: 'finish',
      title: 'You are ready to go!',
      completedBody: 'You can review these guidelines anytime in Settings or Support.',
      skippedBody: 'You can review these guidelines anytime in Settings or Support.',
      primaryButton: 'Go to Rider Dashboard',
    },
  ],
};

export default RIDER_ONBOARDING_CONTENT;
