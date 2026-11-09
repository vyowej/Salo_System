// MOCK DATA ONLY - replace with real data later.
export const locationStatus = {
  default: {
    permission: 'prompt',
    stale: false,
    message: 'Location access is active for route tracking.',
    lastUpdated: '2026-11-09T09:15:00+08:00',
    banner: 'Location is current and route updates are available.',
  },
  empty: {
    permission: 'denied',
    stale: true,
    message: 'Location access has not been enabled.',
    lastUpdated: null,
    banner: 'No recent location update available.',
  },
  loading: {
    permission: 'prompt',
    stale: true,
    message: 'Checking location services...',
    lastUpdated: null,
    banner: 'Loading location status...',
  },
  error: {
    permission: 'denied',
    stale: true,
    message: 'Location services could not be loaded in this preview.',
    lastUpdated: null,
    banner: 'Location data is temporarily unavailable.',
  },
  denied: {
    permission: 'denied',
    stale: true,
    message: 'Location access has been denied.',
    lastUpdated: null,
    banner: 'Location access is denied. Your position cannot be refreshed.',
  },
  stale: {
    permission: 'prompt',
    stale: true,
    message: 'The last location update is outdated.',
    lastUpdated: '2026-11-09T08:30:00+08:00',
    banner: 'Your last route update is no longer current.',
  },
};

export default locationStatus;
