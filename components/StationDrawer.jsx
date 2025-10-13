import React, { useEffect, useRef } from 'react';

export default function StationDrawer({ station, open, onClose }) {
  const drawerRef = useRef(null);

  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && open) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [open, onClose]);

  useEffect(() => {
    if (open && drawerRef.current) {
      drawerRef.current.focus();
    }
  }, [open]);

  if (!open || !station) return null;

  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${station.lat},${station.lng}`;

  return (
    <div
      ref={drawerRef}
      role="dialog"
      aria-modal="false"
      aria-labelledby="drawer-title"
      tabIndex={-1}
      className="fixed top-4 right-4 w-96 max-w-[calc(100vw-2rem)] bg-white dark:bg-gray-800 rounded-lg shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden"
      style={{ zIndex: 1100, maxHeight: 'calc(100vh - 2rem)' }}
    >
      {/* Header */}
      <div className="flex items-start justify-between p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex-1 pr-2">
          <h2 id="drawer-title" className="text-lg font-semibold text-gray-900 dark:text-white">
            {station.name}
          </h2>
          {station.address && (
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              {station.address}
              {station.postcode && `, ${station.postcode}`}
            </p>
          )}
        </div>
        <button
          onClick={onClose}
          aria-label="Close drawer"
          className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="p-4 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 12rem)' }}>
        {/* Station Info */}
        <div className="space-y-2 mb-4">
          {station.connectors !== undefined && (
            <div className="flex items-center text-sm">
              <span className="font-medium text-gray-700 dark:text-gray-300">Connectors:</span>
              <span className="ml-2 text-gray-600 dark:text-gray-400">{station.connectors}</span>
            </div>
          )}
          {station.source && (
            <div className="flex items-center text-sm">
              <span className="font-medium text-gray-700 dark:text-gray-300">Source:</span>
              <span className="ml-2 text-gray-600 dark:text-gray-400">{station.source}</span>
            </div>
          )}
        </div>

        {/* Directions Button */}
        
          href={directionsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block w-full mb-4 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-center rounded-lg font-medium transition-colors"
        >
          Get Directions
        </a>

        {/* Quick Feedback Form */}
        <form action="/api/feedback" method="POST" className="space-y-3">
          <input type="hidden" name="stationId" value={station.id} />
          
          <div>
            <label htmlFor="feedback-note" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Quick Feedback
            </label>
            <textarea
              id="feedback-note"
              name="note"
              rows={3}
              placeholder="Share your experience..."
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
            />
          </div>

          <button
            type="submit"
            className="w-full px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors"
          >
            Submit Feedback
          </button>
        </form>
      </div>
    </div>
  );
}
