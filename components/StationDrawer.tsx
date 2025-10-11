import { useEffect, useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { telemetry } from '../utils/telemetry';
import { haversineDistance, formatDistance } from '../utils/haversine';

interface Station {
  id: string;
  name: string;
  address?: string;
  lat: number;
  lng: number;
  connectors?: Array<{ type: string; count: number }>;
  openingHours?: string;
  provider?: string;
  isCouncil?: boolean;
}

interface StationDrawerProps {
  station: Station | null;
  userLocation?: { lat: number; lng: number } | null;
  onClose: () => void;
  onFeedbackSubmit?: (stationId: string, vote: 'good' | 'bad', comment: string) => void;
}

export function StationDrawer({ station, userLocation, onClose, onFeedbackSubmit }: StationDrawerProps) {
  const [vote, setVote] = useState<'good' | 'bad' | null>(null);
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const openTimeRef = useRef<number>(Date.now());
  const drawerRef = useRef<HTMLDivElement>(null);

  // Track drawer open time for telemetry
  useEffect(() => {
    if (station) {
      openTimeRef.current = Date.now();
      telemetry.drawerOpen(station.id, station.isCouncil || false);
    }
  }, [station]);

  // Close on Escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && station) {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [station]);

  // Focus trap
  useEffect(() => {
    if (station && drawerRef.current) {
      const focusableElements = drawerRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusableElements.length > 0) {
        focusableElements[0].focus();
      }
    }
  }, [station]);

  const handleClose = useCallback(() => {
    if (station) {
      const duration = Date.now() - openTimeRef.current;
      telemetry.drawerClose(station.id, duration);
    }
    setVote(null);
    setComment('');
    onClose();
  }, [station, onClose]);

  const handleSubmitFeedback = async () => {
    if (!station || !vote) return;

    setIsSubmitting(true);
    telemetry.feedbackSubmit(station.id, vote, comment.length > 0);

    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stationId: station.id,
          stationName: station.name,
          vote,
          comment,
          type: 'station',
        }),
      });

      if (response.ok) {
        if (onFeedbackSubmit) {
          onFeedbackSubmit(station.id, vote, comment);
        }
        // Reset form
        setVote(null);
        setComment('');
        // Show success (parent will handle toast)
      }
    } catch (error) {
      console.error('[StationDrawer] Feedback error:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRoute = (provider: 'google' | 'apple') => {
    if (!station) return;

    telemetry.routeClicked(station.id, provider);

    const origin = userLocation ? `${userLocation.lat},${userLocation.lng}` : '';
    const dest = `${station.lat},${station.lng}`;

    let url: string;
    if (provider === 'google') {
      url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest}&travelmode=driving`;
    } else {
      url = `http://maps.apple.com/?saddr=${origin}&daddr=${dest}&dirflg=d`;
    }

    window.open(url, '_blank', 'noopener,noreferrer');
  };

  // Swipe-to-close on mobile
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart(e.touches[0].clientY);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStart === null) return;
    
    const touchEnd = e.touches[0].clientY;
    const diff = touchEnd - touchStart;
    
    // Only allow downward swipe to close (diff > 50px)
    if (diff > 50 && drawerRef.current) {
      handleClose();
    }
  };

  const handleTouchEnd = () => {
    setTouchStart(null);
  };

  if (!station) return null;

  const distance = userLocation ? haversineDistance(userLocation, { lat: station.lat, lng: station.lng }) : null;

  const drawer = (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-40 md:hidden"
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
        className="fixed bg-white shadow-2xl z-50 flex flex-col
                   md:right-0 md:top-0 md:h-full md:w-96
                   max-md:bottom-0 max-md:left-0 max-md:right-0 max-md:rounded-t-2xl max-md:h-[75vh]"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Mobile swipe indicator */}
        <div className="md:hidden flex justify-center pt-3 pb-2 flex-shrink-0">
          <div className="w-12 h-1 bg-gray-300 rounded-full" />
        </div>

        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-start justify-between flex-shrink-0">
          <div className="flex-1 pr-4">
            <h2 id="drawer-title" className="text-lg font-semibold text-gray-900 break-words">
              {station.name}
            </h2>
            {station.isCouncil && (
              <span className="inline-block mt-1 px-2 py-0.5 bg-purple-100 text-purple-800 text-xs font-medium rounded">
                Council
              </span>
            )}
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
            aria-label="Close drawer"
          >
            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body - Scrollable */}
        <div className="p-4 space-y-4 overflow-y-auto flex-1">
          {/* Address */}
          {station.address && (
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-1">Address</h3>
              <p className="text-sm text-gray-600">{station.address}</p>
            </div>
          )}

          {/* Distance */}
          {distance !== null && (
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-1">Distance</h3>
              <p className="text-sm text-gray-600">{formatDistance(distance)} away</p>
            </div>
          )}

          {/* Connectors */}
          {station.connectors && station.connectors.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">Connectors</h3>
              <div className="space-y-1">
                {station.connectors.map((conn, idx) => (
                  <div key={idx} className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">{conn.type}</span>
                    <span className="font-medium text-gray-900">{conn.count}×</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Opening Hours */}
          {station.openingHours && (
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-1">Hours</h3>
              <p className="text-sm text-gray-600">{station.openingHours}</p>
            </div>
          )}

          {/* Provider */}
          {station.provider && (
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-1">Provider</h3>
              <p className="text-sm text-gray-600">{station.provider}</p>
            </div>
          )}

          {/* Feedback Section */}
          <div className="border-t border-gray-200 pt-4">
            <h3 className="text-sm font-medium text-gray-700 mb-3">How was this station?</h3>
            
            {/* Vote Buttons */}
            <div className="flex gap-3 mb-3">
              <button
                onClick={() => setVote('good')}
                className={`flex-1 min-h-[44px] px-4 py-2 rounded-lg font-medium transition-all ${
                  vote === 'good'
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
                aria-pressed={vote === 'good'}
              >
                👍 Good
              </button>
              <button
                onClick={() => setVote('bad')}
                className={`flex-1 min-h-[44px] px-4 py-2 rounded-lg font-medium transition-all ${
                  vote === 'bad'
                    ? 'bg-red-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
                aria-pressed={vote === 'bad'}
              >
                👎 Bad
              </button>
            </div>

            {/* Comment */}
            {vote && (
              <div className="mb-3">
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value.slice(0, 280))}
                  placeholder="Optional comment (max 280 characters)"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  rows={3}
                  maxLength={280}
                />
                <div className="text-xs text-gray-500 mt-1 text-right">
                  {comment.length}/280
                </div>
              </div>
            )}

            {/* Submit */}
            {vote && (
              <button
                onClick={handleSubmitFeedback}
                disabled={isSubmitting}
                className="w-full min-h-[44px] px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isSubmitting ? 'Submitting...' : 'Submit Feedback'}
              </button>
            )}
          </div>

          {/* Actions */}
          <div className="border-t border-gray-200 pt-4 space-y-2">
            <h3 className="text-sm font-medium text-gray-700 mb-2">Actions</h3>
            
            {userLocation ? (
              <button
                onClick={() => handleRoute('google')}
                className="w-full min-h-[44px] px-4 py-2 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 transition-colors"
              >
                🗺️ Route from my location
              </button>
            ) : (
              <button
                onClick={() => handleRoute('google')}
                className="w-full min-h-[44px] px-4 py-2 bg-gray-600 text-white font-medium rounded-lg hover:bg-gray-700 transition-colors"
              >
                🗺️ Get Directions
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );

  return createPortal(drawer, document.body);
}
