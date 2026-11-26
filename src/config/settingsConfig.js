/**
 * Role-based Unified Settings section configuration.
 * Common sections (Account, Notifications, Security, Preferences) are shared across all roles;
 * role-specific sections strictly reflect existing specifications.
 */

const ACCOUNT_WIDE_GROUP = 'Account (All Modes)';
const ACCOUNT_WIDE_HINT = 'Applies to all your SALO modes';
const MODE_ONLY_HINT = 'Applies to this mode only';

const COMMON_SECTIONS = [
  {
    id: 'account',
    group: ACCOUNT_WIDE_GROUP,
    groupHint: ACCOUNT_WIDE_HINT,
    scope: 'account',
    label: 'Profile & Email',
    eyebrow: 'Account · All Modes',
    title: 'Profile & Email',
    description: 'Manage your shared profile, email address, and workspaces across all SALO modes.',
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
    group: ACCOUNT_WIDE_GROUP,
    groupHint: ACCOUNT_WIDE_HINT,
    scope: 'account',
    label: 'Password & Security',
    eyebrow: 'Account · All Modes',
    title: 'Password & Security',
    description: 'Manage your password, sign-in alerts, and active session controls across all modes.',
  },
  {
    id: 'preferences',
    group: ACCOUNT_WIDE_GROUP,
    groupHint: ACCOUNT_WIDE_HINT,
    scope: 'account',
    label: 'Display Preferences',
    eyebrow: 'Account · All Modes',
    title: 'Display Preferences',
    description: 'Customize your appearance and interface preferences across all modes.',
  },
];

const ROLE_SPECIFIC_SECTIONS = {
  customer: [
    {
      id: 'addresses',
      group: 'Customer Settings',
      groupHint: MODE_ONLY_HINT,
      scope: 'mode',
      label: 'Addresses',
      eyebrow: 'Customer Mode · Delivery',
      title: 'Saved Addresses',
      description: 'Manage your saved delivery and billing addresses.',
    },
    {
      id: 'contact_numbers',
      group: 'Customer Settings',
      groupHint: MODE_ONLY_HINT,
      scope: 'mode',
      label: 'Contact Numbers',
      eyebrow: 'Customer Mode · Delivery',
      title: 'Saved Contact Numbers',
      description: 'Manage your personal, work, and alternate contact numbers.',
    },
    {
      id: 'notifications',
      group: 'Customer Settings',
      groupHint: MODE_ONLY_HINT,
      scope: 'mode',
      label: 'Customer Notifications',
      eyebrow: 'Customer Mode · Notifications',
      title: 'Customer Notifications',
      description: 'Choose which order, promo, and reservation updates you receive in Customer mode.',
    },
    {
      id: 'privacy',
      group: 'Customer Settings',
      groupHint: MODE_ONLY_HINT,
      scope: 'mode',
      label: 'Customer Privacy',
      eyebrow: 'Customer Mode · Privacy',
      title: 'Customer Privacy & Data',
      description: 'Control how your customer profile and activity preferences are handled.',
    },
  ],
  restaurant: [
    {
      id: 'business',
      group: 'Restaurant Settings',
      groupHint: MODE_ONLY_HINT,
      scope: 'mode',
      label: 'Business',
      eyebrow: 'Restaurant Mode · Availability',
      title: 'Business Availability',
      description: 'Control delivery, pickup, and dine-in availability for your restaurant.',
    },
    {
      id: 'orders',
      group: 'Restaurant Settings',
      groupHint: MODE_ONLY_HINT,
      scope: 'mode',
      label: 'Orders',
      eyebrow: 'Restaurant Mode · Orders',
      title: 'Fulfillment & Preparation',
      description: 'Configure order fulfillment modes, preparation estimates, and stock deduction.',
    },
    {
      id: 'reservations',
      group: 'Restaurant Settings',
      groupHint: MODE_ONLY_HINT,
      scope: 'mode',
      label: 'Reservations',
      eyebrow: 'Restaurant Mode · Reservations',
      title: 'Table Reservations',
      description: 'Set reservation acceptance, time slots, duration, and guest instructions.',
    },
    {
      id: 'payments',
      group: 'Restaurant Settings',
      groupHint: MODE_ONLY_HINT,
      scope: 'mode',
      label: 'Payments',
      eyebrow: 'Restaurant Mode · Payouts',
      title: 'Payout & Payment Details',
      description: 'Review your connected payout method and protected payment status.',
    },
    {
      id: 'notifications',
      group: 'Restaurant Settings',
      groupHint: MODE_ONLY_HINT,
      scope: 'mode',
      label: 'Restaurant Notifications',
      eyebrow: 'Restaurant Mode · Notifications',
      title: 'Restaurant Notifications',
      description: 'Choose which order, reservation, and settlement alerts you receive in Restaurant mode.',
    },
    {
      id: 'verification',
      group: 'Restaurant Settings',
      groupHint: MODE_ONLY_HINT,
      scope: 'mode',
      label: 'Verification & Identity',
      eyebrow: 'Restaurant Mode · Admin Approval',
      title: 'Verified Business Identity',
      description: 'Submit sensitive legal name or business type changes for administrator review.',
    },
  ],
  rider: [
    {
      id: 'driver_mode',
      group: 'Rider Settings',
      groupHint: MODE_ONLY_HINT,
      scope: 'mode',
      label: 'Driver Mode',
      eyebrow: 'Rider Mode · Availability',
      title: 'Driver Mode & Availability',
      description: 'Manage your live availability status and review readiness checks before going online.',
    },
    {
      id: 'verification',
      group: 'Rider Settings',
      groupHint: MODE_ONLY_HINT,
      scope: 'mode',
      label: 'Vehicle & Verification',
      eyebrow: 'Rider Mode · Admin Approval',
      title: 'Verified Vehicle & Identity',
      description: 'View approved vehicle details and submit verification change requests for administrator review.',
    },
    {
      id: 'location',
      group: 'Rider Settings',
      groupHint: MODE_ONLY_HINT,
      scope: 'mode',
      label: 'Location',
      eyebrow: 'Rider Mode · Navigation',
      title: 'Location Guidance',
      description: 'Review device location permissions and safe route guidance.',
    },
    {
      id: 'notifications',
      group: 'Rider Settings',
      groupHint: MODE_ONLY_HINT,
      scope: 'mode',
      label: 'Rider Notifications',
      eyebrow: 'Rider Mode · Notifications',
      title: 'Rider Notifications',
      description: 'Choose which dispatch, earnings, and SMS alerts you receive in Rider mode.',
    },
    {
      id: 'privacy',
      group: 'Rider Settings',
      groupHint: MODE_ONLY_HINT,
      scope: 'mode',
      label: 'Rider Privacy & Guidelines',
      eyebrow: 'Rider Mode · Privacy & Guidelines',
      title: 'Privacy & Rider Guidelines',
      description: 'Customer data handling rules and core SALO rider service guidelines.',
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
    ...roleSpecific,
    COMMON_SECTIONS[0], // Profile & Email (All Modes)
    COMMON_SECTIONS[2], // Password & Security (All Modes)
    COMMON_SECTIONS[3], // Display Preferences (All Modes)
  ];
}

export const SETTINGS_LABELS = {
  unsavedTitle: 'Unsaved changes',
  unsavedHint: 'Save your changes or discard them to revert.',
  discardButton: 'Discard',
  saveButton: 'Save changes',
  backToSections: 'All settings',
  switchAccountButton: 'Switch Mode',
  dangerZoneTitle: 'Danger zone',
  dangerZoneEyebrow: 'Irreversible or high-impact actions',
};
