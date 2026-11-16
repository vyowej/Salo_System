/**
 * Business / Restaurant Owner Onboarding Content Configuration
 * Role 3: Business / Restaurant Owner (guided setup intro + derived checklist)
 */

export const BUSINESS_ONBOARDING_CONTENT = {
  role: 'business',
  roleBadge: 'Restaurant Partner',
  overviewPath: '/owner',
  checklistCard: {
    eyebrow: 'PARTNER SETUP',
    title: 'Setup checklist',
    subtitle: 'Complete these remaining steps so your restaurant is ready for customer orders and reservations.',
    progressTemplate: '{completed} of {total} completed',
    dismissLabel: 'Dismiss checklist',
    dismissAriaLabel: 'Dismiss restaurant setup checklist card',
    actionLabel: 'Configure',
    doneLabel: 'Done',
  },
  steps: [
    {
      id: 'welcome',
      kind: 'welcome',
      titleTemplate: 'Welcome, {username}!',
      fallbackUsername: 'Partner',
      body: 'Congrats at isa ka nang partner ng SALO! Ihanda na natin ang restaurant mo para makatanggap ng orders.',
      highlights: [
        {
          id: 'storefront-control',
          icon: 'store',
          title: 'Your public storefront & menu',
          description: 'Customize your business profile, operating hours, categories, and dishes from one workspace.',
        },
        {
          id: 'live-operations',
          icon: 'check-circle',
          title: 'Real-time order & table controls',
          description: 'Manage incoming orders, table reservations, and customer availability toggles independently.',
        },
      ],
      primaryButton: 'Simulan na natin!',
      wholeSkipButton: 'Mamaya na lang',
    },
    {
      id: 'setup-checklist',
      kind: 'business-checklist',
      title: 'Ihanda ang restaurant mo',
      helper: 'Each item below reflects your current restaurant configuration and links directly to its management page:',
      items: {
        businessProfile: {
          id: 'business_profile',
          label: 'Business Profile',
          description: 'Upload your logo and cover photo, and verify your description, contact info, and kitchen address.',
          href: '/owner/profile',
          ctaLabel: 'Open Profile',
        },
        operatingHours: {
          id: 'operating_hours',
          label: 'Operating Hours',
          description: 'Configure your weekly opening and closing times for customer orders and bookings.',
          href: '/owner/profile#operating-hours-heading',
          ctaLabel: 'Set Hours',
        },
        menu: {
          id: 'menu',
          label: 'Menu (Categories & Items)',
          description: 'Create at least one active menu category and publish at least one available dish.',
          href: '/owner/menu',
          ctaLabel: 'Manage Menu',
        },
        tables: {
          id: 'tables',
          label: 'Dining Tables',
          description: 'Register your dining room tables and seating capacities for dine-in and table reservations.',
          href: '/owner/tables',
          ctaLabel: 'Manage Tables',
        },
        availabilityToggles: {
          id: 'availability_toggles',
          label: 'Accepting Orders & Reservations Toggles',
          description: 'Enable your Accepting Orders and Accepting Reservations switches when ready to serve customers.',
          href: '/owner/profile#operating-hours-heading',
          ctaLabel: 'Review Toggles',
        },
      },
      primaryButton: 'Susunod',
      stepSkipButton: 'Laktawan muna',
      backButton: 'Bumalik',
    },
    {
      id: 'good-to-know',
      kind: 'points',
      title: 'Mga dapat mong malaman',
      helper: 'Key guidelines for managing your restaurant on SALO:',
      points: [
        {
          id: 'own-orders-only',
          icon: 'receipt',
          title: 'Manage your own restaurant orders',
          description: 'You receive and process only your own restaurant sub-orders. Review incoming orders promptly and provide a clear reason whenever rejecting an order.',
        },
        {
          id: 'availability-switches',
          icon: 'sliders',
          title: 'Availability toggles control customer access',
          description: 'Your configured operating hours and the Accepting Orders and Accepting Reservations toggles determine when customers can submit orders or book tables.',
        },
        {
          id: 'invite-staff',
          icon: 'users',
          title: 'Invite staff anytime from Team and Staff',
          description: 'You can invite managers, order handlers, reservation handlers, or menu staff and assign role-specific permissions from the Team and Staff section.',
        },
      ],
      primaryButton: 'Susunod',
      backButton: 'Bumalik',
    },
    {
      id: 'finish',
      kind: 'finish',
      title: 'Handa ka na!',
      completedBody: 'Pwede mong ituloy ang setup anytime. Nasa Overview ang checklist mo.',
      skippedBody: 'Pwede mong ituloy ang setup anytime. Nasa Overview ang checklist mo.',
      primaryButton: 'Simulan na ang setup',
    },
  ],
};

export default BUSINESS_ONBOARDING_CONTENT;
