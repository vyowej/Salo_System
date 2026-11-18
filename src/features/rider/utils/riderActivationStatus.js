import { mapBackendApplicationStatus } from '../../../services/applicationService.js';

/**
 * Derive activation display state from GET /api/rider/profile and
 * GET /api/rider/applications/current without inventing self-activation actions.
 */
export function getRiderActivationViewModel(profile, application) {
  if (!profile && !application) {
    return {
      state: 'empty',
      statusKey: 'not_applied',
      badgeLabel: 'Not Applied',
      badgeVariant: 'default',
      title: 'No rider application found',
      description: 'Submit a rider application to start the verification and activation process.',
      reviewerNote: null,
      canGoOnline: false,
    };
  }

  const riderStatus = String(profile?.rider_status || '').trim().toLowerCase();
  const appStatus = String(application?.application_status || '').trim().toLowerCase();
  const reviewerNote = application?.reviewer_note || null;

  if (riderStatus === 'active') {
    return {
      state: 'ready',
      statusKey: 'active',
      badgeLabel: 'Active',
      badgeVariant: 'success',
      title: 'Your rider account is active',
      description: 'An administrator has activated your rider account. You can now go online and accept deliveries.',
      reviewerNote,
      canGoOnline: true,
    };
  }

  if (riderStatus === 'approved' || appStatus === 'approved') {
    return {
      state: 'ready',
      statusKey: 'approved',
      badgeLabel: 'Approved · Awaiting Activation',
      badgeVariant: 'warning',
      title: 'Approved — awaiting admin activation',
      description:
        'Your rider application has been approved. An administrator must activate your rider account before you can go online or accept deliveries.',
      reviewerNote,
      canGoOnline: false,
    };
  }

  if (riderStatus === 'rejected' || appStatus === 'rejected') {
    return {
      state: 'ready',
      statusKey: 'rejected',
      badgeLabel: 'Rejected',
      badgeVariant: 'error',
      title: 'Rider application not approved',
      description: 'Your rider application was rejected. Review the feedback below or update your application.',
      reviewerNote,
      canGoOnline: false,
    };
  }

  if (riderStatus === 'suspended' || riderStatus === 'inactive') {
    return {
      state: 'ready',
      statusKey: riderStatus,
      badgeLabel: riderStatus === 'suspended' ? 'Suspended' : 'Inactive',
      badgeVariant: 'error',
      title: riderStatus === 'suspended' ? 'Rider account suspended' : 'Rider account inactive',
      description:
        'Your rider account is not currently active and cannot go online. Contact SALO support or an administrator for assistance.',
      reviewerNote,
      canGoOnline: false,
    };
  }

  const mappedAppLabel = mapBackendApplicationStatus(appStatus) || 'Pending Approval';
  return {
    state: 'ready',
    statusKey: 'pending',
    badgeLabel: mappedAppLabel,
    badgeVariant: 'warning',
    title: 'Application under review',
    description:
      'Your rider application is pending review. Once approved and activated by an administrator, you can go online.',
    reviewerNote,
    canGoOnline: false,
  };
}
