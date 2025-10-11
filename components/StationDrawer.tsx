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
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle');
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
    setSubmitStatus('idle');
    onClose();
  }, [station, onClose]);

  const handleCancel = useCallback(() => {
    setVote(null);
    setComment('');
    setSubmitStatus('idle');
    handleClose();
  }, [handleClose]);

  const handleSubmitFeedback = async () => {
    if (!station || !vote) return;

    setIsSubmitting(true);
    setSubmitStatus('idle');
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
        setSubmitStatus('success');
        if (onFeedbackSubmit) {
          onFeedbackSubmit(station.id, vote, comment);
        }
        // Reset form after brief success message
        setTimeout(() => {
          setVote(null);
          setComment('');
          setSubmitStatus('idle');
        }, 2000);
      } else {
        setSubmitStatus('error');
      }
    } catch (error) {
      console.error('[StationDrawer] Feedback error:', error);
      setSubmitStatus('error');
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

  const totalConnectors = station.connectors?.reduce((sum, conn) => sum + conn.count, 0) || 0;

  const drawer = (
    <>
      {/* Backdrop - mobile only */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* Feedback Panel */}
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
        className="fixed bg-white shadow-2xl z-50 flex flex-col border-l border-gray-200
                   lg:top-0 lg:right-0 lg:h-dvh lg:w-[380px]
                   max-lg:inset-x-0 max-lg:bottom-0 max-lg:max-h-[70vh] max-lg:rounded-t-2xl"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Mobile drag grabber */}
        <div className="lg:hidden flex justify-center pt-3 pb-2 flex-shrink-0">
          <div className="w-12 h-1.5 bg-gray-300 rounded-full" aria-label="Drag to close" />
        </div>

        {/* Header Row */}
        <div className="flex items-start justify-between gap-3 px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <h2 id="drawer-title" className="text-lg font-semibold leading-tight text-gray-900 flex-1">
            {station.name}
          </h2>
          <button
            onClick={handleClose}
            className="p-2 -m-2 hover:bg-gray-100 rounded-lg transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
            aria-label="Close panel"
          >
            <svg className="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          {/* Meta (small, muted) */}
          <div className="text-sm text-gray-500 space-y-1">
            {station.address && (
              <div className="truncate" title={station.address}>
                {station.address}
              </div>
            )}
            {totalConnectors > 0 && (
              <div>
                Connectors: {totalConnectors}
              </div>
            )}
          </div>

          {/* Feedback Controls */}
          <div className="mt-3 space-y-3">
            <label className="block text-sm font-medium text-gray-700">
              How was this station?
            </label>
            
            {/* Good / Bad Buttons */}
            <div className="flex gap-3">
              <button
                onClick={() => setVote('good')}
                className={`inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border transition-colors flex-1 ${
                  vote === 'good'
                    ? 'bg-blue-50 border-blue-500 text-blue-700'
                    : 'border-gray-300 hover:bg-gray-50 text-gray-700'
                }`}
                aria-selected={vote === 'good'}
                aria-label="Good experience"
              >
                👍 Good
              </button>
              <button
                onClick={() => setVote('bad')}
                className={`inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border transition-colors flex-1 ${
                  vote === 'bad'
                    ? 'bg-blue-50 border-blue-500 text-blue-700'
                    : 'border-gray-300 hover:bg-gray-50 text-gray-700'
                }`}
                aria-selected={vote === 'bad'}
                aria-label="Bad experience"
              >
                👎 Bad
              </button>
            </div>

            {/* Comment Textarea */}
            {vote && (
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value.slice(0, 280))}
                placeholder="Any details? e.g., broken connector, blocked bay, pricing issue."
                className="w-full rounded-md border border-gray-300 p-2 text-sm resize-vertical focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                rows={4}
                maxLength={280}
                aria-label="Feedback comment"
              />
            )}

            {/* Status Messages */}
            {submitStatus === 'success' && (
              <div className="text-sm text-green-600 bg-green-50 border border-green-200 rounded-md p-3">
                ✓ Thanks for your feedback!
              </div>
            )}
            {submitStatus === 'error' && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-3">
                Couldn't submit. Please try again.
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={handleSubmitFeedback}
              disabled={!vote || isSubmitting}
              className="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              aria-label="Submit feedback"
            >
              {isSubmitting ? 'Submitting...' : 'Submit feedback'}
            </button>
            <button
              onClick={handleCancel}
              className="px-4 py-2 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
              aria-label="Cancel"
            >
              Cancel
            </button>
          </div>

          {/* Get Directions Link */}
          <div className="pt-2">
            <button
              onClick={() => handleRoute('google')}
              className="text-blue-600 hover:text-blue-700 text-sm font-medium underline"
              aria-label="Get directions"
            >
              Get directions →
            </button>
          </div>
        </div>
      </div>
    </>
  );

  return createPortal(drawer, document.body);
}
