import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface Station {
  id: string;
  name: string;
  address?: string;
  lat: number;
  lng: number;
  connectors?: Array<{ type: string; count: number }>;
}

interface StationDrawerProps {
  station: Station | null;
  onClose: () => void;
  onFeedbackSubmit?: (stationId: string, vote: 'good' | 'bad', comment: string) => void;
}

export function StationDrawer({ station, onClose, onFeedbackSubmit }: StationDrawerProps) {
  const [vote, setVote] = useState<'good' | 'bad' | null>(null);
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (station) {
      console.log('[StationDrawer] Opened with station:', station.name || station.id);
      // Reset form on new station
      setVote(null);
      setComment('');
      setIsSubmitting(false);
      // Focus close button
      setTimeout(() => closeButtonRef.current?.focus(), 100);
    }
  }, [station]);

  // ESC key handler
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && station) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [station, onClose]);

  // Focus trap
  useEffect(() => {
    if (!station || !drawerRef.current) return;

    const drawer = drawerRef.current;
    const focusableElements = drawer.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstElement = focusableElements[0] as HTMLElement;
    const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      if (e.shiftKey && document.activeElement === firstElement) {
        e.preventDefault();
        lastElement?.focus();
      } else if (!e.shiftKey && document.activeElement === lastElement) {
        e.preventDefault();
        firstElement?.focus();
      }
    };

    drawer.addEventListener('keydown', handleTab as any);
    return () => drawer.removeEventListener('keydown', handleTab as any);
  }, [station]);

  const handleSubmit = async () => {
    if (!vote || !station) return;

    setIsSubmitting(true);
    try {
      await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stationId: station.id,
          vote,
          comment: comment.trim(),
          type: 'station'
        })
      });

      onFeedbackSubmit?.(station.id, vote, comment);
      
      // Reset and close
      setVote(null);
      setComment('');
      onClose();
    } catch (error) {
      console.error('Feedback error:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    setVote(null);
    setComment('');
    onClose();
  };

  const handleDirections = () => {
    if (!station) return;
    const url = `https://www.google.com/maps/dir/?api=1&destination=${station.lat},${station.lng}`;
    window.open(url, '_blank');
  };

  const totalConnectors = station?.connectors
    ? Array.isArray(station.connectors)
      ? station.connectors.reduce((sum, c) => sum + c.count, 0)
      : 0
    : 0;

  if (!station) return null;

  const drawer = (
    <>
      {/* Mobile backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-30 lg:hidden"
        style={{ zIndex: 9998 }}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
        className="fixed bg-white overflow-auto
                   left-0 right-0 bottom-0 h-[55vh] rounded-t-2xl
                   lg:top-[70px] lg:right-0 lg:left-auto lg:bottom-auto lg:w-[380px] lg:h-[calc(100vh-70px)] lg:rounded-none lg:border-l lg:border-gray-200"
        style={{
          zIndex: 9999,
          boxShadow: '0 10px 30px rgba(0,0,0,0.12)'
        }}
      >
        {/* Mobile drag handle */}
        <div className="lg:hidden flex justify-center pt-3 pb-2">
          <div className="w-12 h-1 bg-gray-300 rounded-full" />
        </div>

        {/* Header */}
        <div 
          className="sticky top-0 bg-gray-50 border-b border-gray-200 px-6 py-4 flex items-start justify-between gap-3"
          style={{ height: '60px' }}
        >
          <h2 
            id="drawer-title" 
            className="text-lg font-semibold text-gray-900 flex-1"
          >
            {station.name}
          </h2>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            className="p-2 -m-2 hover:bg-gray-200 rounded-lg transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Address */}
          {station.address && (
            <div className="text-sm text-gray-600">
              {station.address}
            </div>
          )}

          {/* Connectors */}
          {totalConnectors > 0 && (
            <div className="text-sm text-gray-600">
              Connectors: {totalConnectors}
            </div>
          )}

          {/* Good/Bad buttons */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={() => setVote('good')}
              className={`flex-1 px-4 py-2 rounded-full border transition-colors ${
                vote === 'good'
                  ? 'bg-green-50 border-green-600 text-green-700'
                  : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
              aria-pressed={vote === 'good'}
            >
              👍 Good
            </button>
            <button
              onClick={() => setVote('bad')}
              className={`flex-1 px-4 py-2 rounded-full border transition-colors ${
                vote === 'bad'
                  ? 'bg-red-50 border-red-600 text-red-700'
                  : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
              aria-pressed={vote === 'bad'}
            >
              👎 Bad
            </button>
          </div>

          {/* Comment textarea */}
          {vote && (
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value.slice(0, 280))}
              placeholder="Optional comment… e.g., broken connector, blocked bay, pricing issue."
              className="w-full rounded-lg border border-gray-300 p-3 text-sm resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              rows={3}
              maxLength={280}
            />
          )}

          {/* Action buttons */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={handleSubmit}
              disabled={!vote || isSubmitting}
              className="flex-1 px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSubmitting ? 'Submitting...' : 'Submit feedback'}
            </button>
            <button
              onClick={handleCancel}
              className="px-4 py-2 rounded-lg bg-white border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </div>

          {/* Get directions */}
          <div className="pt-2">
            <button
              onClick={handleDirections}
              className="text-blue-600 hover:text-blue-700 text-sm font-medium"
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
