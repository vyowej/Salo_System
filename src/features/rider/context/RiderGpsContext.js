import { createContext, useContext } from 'react';

const DEFAULT_GPS_STATE = {
  location: null,
  gpsError: '',
  syncError: '',
  lastSyncedAt: null,
  permissionState: 'prompt',
};

export const RiderGpsContext = createContext(DEFAULT_GPS_STATE);

export function useRiderGps() {
  return useContext(RiderGpsContext) || DEFAULT_GPS_STATE;
}
