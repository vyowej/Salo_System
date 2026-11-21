/**
 * Role-based Unified Settings section configuration.
 * Common sections (Account, Notifications, Security, Preferences) are shared across all roles;
 * role-specific sections strictly reflect existing specifications.
 */

const COMMON_SECTIONS = [
  {
    id: 'account',
    group: 'Account',
    label: 'Account',
    eyebrow: 'Account',
    title: 'Account & Workspaces',
    description: 'Review your profile summary, email, password access, and workspace switching.',
  },
  {
    id: 'notifications',
    group: 'Account',
    label: 'Notifications',
    eyebrow: 'Notifications',
    title: 'Notification Preferences',
    description: 'Choose which activity and operational updates you want to receive.',
  },
  {
    id: 'security',
    group: 'Account',
    label: 'Security',
    eyebrow: 'Security',
    title: 'Password & Security',
    description: 'Manage your password, sign-in alerts, and active session controls.',
  },
  {
    id: 'preferences',
    group: 'Account',
    label: 'Preferences',
    eyebrow: 'Preferences',
    title: 'Display Preferences',
    description: 'Customize your appearance and interface preferences.',
  },
];

const ROLE_SPECIFIC_SECTIONS = {
  customer: [
    {
      id: 'addresses',
      group: 'Customer',
      label: 'Addresses',
      eyebrow: 'Delivery',
      title: 'Saved Addresses',
      description: 'Manage your saved delivery and billing addresses.',
    },
    {
      id: 'contact_numbers',
      group: 'Customer',
      label: 'Contact Numbers',
      eyebrow: 'Delivery',
      title: 'Saved Contact Numbers',
      description: 'Manage your personal, work, and alternate contact numbers.',
    },
    {
      id: 'privacy',
      group: 'Customer',
      label: 'Privacy',
      eyebrow: 'Privacy',
      title: 'Privacy & Data',
      description: 'Control how your customer profile and activity preferences are handled.',
    },
  ],
  restaurant: [
    {
      id: 'business',
      group: 'Restaurant',
      label: 'Business',
      eyebrow: 'Business Availability',
      title: 'Business Availability',
      description: 'Control delivery, pickup, and dine-in availability for your restaurant.',
    },
    {
      id: 'orders',
      group: 'Restaurant',
      label: 'Orders',
      eyebrow: 'Order Preferences',
      title: 'Fulfillment & Preparation',
      description: 'Configure order fulfillment modes, preparation estimates, and stock deduction.',
    },
    {
      id: 'reservations',
      group: 'Restaurant',
      label: 'Reservations',
      eyebrow: 'Reservation Preferences',
      title: 'Table Reservations',
      description: 'Set reservation acceptance, time slots, duration, and guest instructions.',
    },
    {
      id: 'payments',
      group: 'Restaurant',
      label: 'Payments',
      eyebrow: 'Payout Summary',
      title: 'Payout & Payment Details',
      description: 'Review your connected payout method and protected payment status.',
    },
    {
      id: 'verification',
      group: 'Restaurant',
      label: 'Verification & Identity',
      eyebrow: 'Admin Approval',
      title: 'Verified Business Identity',
      description: 'Submit sensitive legal name or business type changes for administrator review.',
    },
  ],
  rider: [
    {
      id: 'driver_mode',
      group: 'Rider',
      label: 'Driver Mode',
      eyebrow: 'Availability',
      title: 'Driver Mode & Availability',
      description: 'Manage your live availability status and review readiness checks before going online.',
    },
    {
      id: 'verification',
      group: 'Rider',
      label: 'Vehicle & Verification',
      eyebrow: 'Admin Approval',
      title: 'Verified Vehicle & Identity',
      description: 'View approved vehicle details and submit verification change requests for administrator review.',
    },
    {
      id: 'location',
      group: 'Rider',
      label: 'Location',
      eyebrow: 'Navigation',
      title: 'Location Guidance',
      description: 'Review device location permissions and safe route guidance.',
    },
    {
      id: 'privacy',
      group: 'Rider',
      label: 'Privacy',
      eyebrow: 'Privacy',
      title: 'Privacy & Data Handling',
      description: 'Guidelines for handling customer and delivery information responsibly.',
    },
    {
      id: 'terms',
      group: 'Rider',
      label: 'Terms & Agreement',
      eyebrow: 'Legal',
      title: 'Terms & Rider Agreement',
      description: 'Review the rider agreement terms and platform service guidelines.',
    },
  ],
  admin: [
    {
      id: 'branding',
      group: 'Platform',
      label: 'Branding',
      eyebrow: 'Platform Identity',
      title: 'Platform Branding',
      description: 'Manage the public platform name, tagline, and brand identity.',
    },
    {
      id: 'contact',
      group: 'Platform',
      label: 'Contact',
      eyebrow: 'Support Channels',
      title: 'Platform Contact Details',
      description: 'Configure public support hotline, email, address, and support hours.',
    },
    {
      id: 'payments',
      group: 'Platform',
      label: 'Payments',
      eyebrow: 'Checkout',
      title: 'Supported Payment Methods',
      description: 'Select which payment methods are available to customers at checkout.',
    },
    {
      id: 'maintenance',
      group: 'Platform',
      label: 'Maintenance',
      eyebrow: 'Availability',
      title: 'Maintenance Notice',
      description: 'Schedule planned maintenance windows and public service notices.',
    },
    {
      id: 'legal',
      group: 'Platform',
      label: 'Legal',
      eyebrow: 'Compliance',
      title: 'Terms & Privacy Links',
      description: 'Maintain public URLs for Terms & Conditions and Privacy Policy.',
    },
    {
      id: 'operations',
      group: 'Platform',
      label: 'Operations',
      eyebrow: 'Defaults',
      title: 'Default Operating Configuration',
      description: 'Configure supported service locations and default payout schedule display.',
    },
  ],
};

export function getSettingsSectionsForRole(role) {
  const roleSpecific = ROLE_SPECIFIC_SECTIONS[role] || [];
  if (role === 'admin') {
    return [
      COMMON_SECTIONS[0], // Account
      ...roleSpecific,
      COMMON_SECTIONS[1], // Notifications
      COMMON_SECTIONS[2], // Security
      COMMON_SECTIONS[3], // Preferences
    ];
  }
  return [
    COMMON_SECTIONS[0], // Account
    ...roleSpecific,
    COMMON_SECTIONS[1], // Notifications
    COMMON_SECTIONS[2], // Security
    COMMON_SECTIONS[3], // Preferences
  ];
}

export const SETTINGS_LABELS = {
  unsavedTitle: 'Unsaved changes',
  unsavedHint: 'Save your changes or discard them to revert.',
  discardButton: 'Discard',
  saveButton: 'Save changes',
  backToSections: 'All settings',
  switchAccountButton: 'Switch Account',
  dangerZoneTitle: 'Danger zone',
  dangerZoneEyebrow: 'Irreversible or high-impact actions',
};
