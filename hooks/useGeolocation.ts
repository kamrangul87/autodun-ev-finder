import { useState, useCallback, useEffect } from 'react';
import { telemetry } from '../utils/telemetry';

export interface GeolocationState {
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  error: string | null;
  isLoading: boolean;
}

export interface UseGeolocationReturn extends GeolocationState {
  getCurrentLocation: () => void;
  clearLocation: () => void;
}

const GEOLOCATION_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 10000,
  maximumAge: 30000, // Cache for 30 seconds
};

/**
 * Hook for accessing user's geolocation
 * Handles permissions, errors, and provides loading state
 */
export function useGeolocation(): UseGeolocationReturn {
  const [state, setState] = useState<GeolocationState>({
    latitude: null,
    longitude: null,
    accuracy: null,
    error: null,
    isLoading: false,
  });

  const getCurrentLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setState(prev => ({
        ...prev,
        error: 'Geolocation is not supported by your browser',
        isLoading: false,
      }));
      telemetry.locateMeClicked(false);
      return;
    }

    setState(prev => ({ ...prev, isLoading: true, error: null }));

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setState({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          error: null,
          isLoading: false,
        });
        telemetry.locateMeClicked(true);
      },
      (error) => {
        let errorMessage = 'Unable to get your location';
        
        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorMessage = 'Location permission denied';
            break;
          case error.POSITION_UNAVAILABLE:
            errorMessage = 'Location information unavailable';
            break;
          case error.TIMEOUT:
            errorMessage = 'Location request timed out';
            break;
        }

        setState({
          latitude: null,
          longitude: null,
          accuracy: null,
          error: errorMessage,
          isLoading: false,
        });
        telemetry.locateMeClicked(false);
      },
      GEOLOCATION_OPTIONS
    );
  }, []);

  const clearLocation = useCallback(() => {
    setState({
      latitude: null,
      longitude: null,
      accuracy: null,
      error: null,
      isLoading: false,
    });
  }, []);

  return {
    ...state,
    getCurrentLocation,
    clearLocation,
  };
}
