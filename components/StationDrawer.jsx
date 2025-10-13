import React, { useEffect, useRef } from 'react';

export default function StationDrawer({ isOpen, station, onClose }) {
  const drawerRef = useRef(null);

  // ESC key handler
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Focus management
  useEffect(() => {
    if (isOpen && drawerRef.current) {
      drawerRef.current.focus();
    }
  }, [isOpen]);

  if (!isOpen || !station) return null;

  const stationName = station.name || station.title || 'Charging Station';
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${station.lat},${station.lng}`;

  return (
    <div
      ref={drawerRef}
      role="dialog"
      aria-modal="false"
      aria-labelledby="drawer-title"
      tabIndex={-1}
      className="fixed top-4 right-4 w-96 max-w-[calc(100vw-2rem)] bg-white dark:bg-gray-800 rounded-lg shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden"
      style={{ 
        zIndex: 1100, 
        maxHeight: 'calc(100vh - 2rem)',
        pointerEvents: 'auto'
      }}
    >
      {/* Header */}
      <div className="flex items-start justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-blue-50 to-blue-100 dark:from-gray-700 dark:to-gray-600">
        <div className="flex-1 pr-2">
          <h2 
            id="drawer-title" 
            className="text-lg font-semibold text-gray-900 dark:text-white"
          >
            {stationName}
          </h2>
          {station.address && (
            <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
              {station.address}
              {station.postcode && `, ${station.postcode}`}
            </p>
          )}
        </div>
        <button
          onClick={onClose}
          aria-label="Close drawer"
          className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/50 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="p-4 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 10rem)' }}>
        {/* Station Info */}
        {(station.connectors !== undefined || station.source) && (
          <div className="space-y-2 mb-4 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
            {station.connectors !== undefined && (
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-gray-700 dark:text-gray-300">Connectors:</span>
                <span className="text-gray-900 dark:text-white font-semibold">{station.connectors}</span>
              </div>
            )}
            {station.source && (
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-gray-700 dark:text-gray-300">Source:</span>
                <span className="text-gray-600 dark:text-gray-400 text-xs uppercase tracking-wide">{station.source}</span>
              </div>
            )}
          </div>
        )}

        {/* Directions Button */}
        
          href={directionsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full mb-4 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-all hover:shadow-lg"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 013.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
          </svg>
          Get Directions
        </a>

        {/* Quick Feedback Form */}
        <form action="/api/feedback" method="POST" className="space-y-3 p-3 bg-green-50 dark:bg-gray-700 rounded-lg">
          <input type="hidden" name="stationId" value={station.id} />
          
          <div>
            <label htmlFor="feedback-note" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Quick Feedback
            </label>
            <textarea
              id="feedback-note"
              name="note"
              rows={3}
              placeholder="Share your experience at this station..."
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 text-sm"
            />
          </div>

          <button
            type="submit"
            className="w-full px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-all hover:shadow-lg flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Submit Feedback
          </button>
        </form>
      </div>
    </div>
  );
}
