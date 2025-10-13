import { useEffect } from 'react';
import { useGeolocation } from '../hooks/useGeolocation';

interface LocateMeButtonProps {
  onLocationFound: (lat: number, lng: number, accuracy: number) => void;
  onError?: (error: string) => void;
}

export function LocateMeButton({ onLocationFound, onError }: LocateMeButtonProps) {
  const { latitude, longitude, accuracy, error, isLoading, getCurrentLocation } = useGeolocation();

  // Notify parent when location is found
  useEffect(() => {
    if (latitude !== null && longitude !== null && accuracy !== null) {
      onLocationFound(latitude, longitude, accuracy);
    }
  }, [latitude, longitude, accuracy, onLocationFound]);

  // Notify parent on error
  useEffect(() => {
    if (error && onError) {
      onError(error);
    }
  }, [error, onError]);

  return (
    <button
      onClick={getCurrentLocation}
      disabled={isLoading}
      className="bg-white border-2 border-gray-300 rounded-lg shadow-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
      aria-label="Locate me"
      title="Find my location"
    >
      {isLoading ? (
        <svg className="animate-spin h-5 w-5 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      ) : (
        <svg className="h-5 w-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      )}
    </button>
  );
}
