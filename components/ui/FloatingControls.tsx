'use client';

import { useState, FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

interface FloatingControlsProps {
  showHeatmap: boolean;
  showMarkers: boolean;
  showCouncil: boolean;
  onToggleHeatmap: () => void;
  onToggleMarkers: () => void;
  onToggleCouncil: () => void;
  onSearch: (query: string) => Promise<void>;
  onFeedback: () => void;
}

export default function FloatingControls(props: FloatingControlsProps) {
  const [expanded, setExpanded] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const handleSearch = async (e: FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim() || searchLoading) return;

    setSearchLoading(true);
    try {
      await props.onSearch(searchQuery);
      setSearchQuery('');
    } finally {
      setSearchLoading(false);
    }
  };

  return (
    <>
      {/* Desktop: Top-right floating card */}
      <div className="hidden md:block absolute top-4 right-4 z-[1000]">
        <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-xl border border-gray-200 p-4 w-80">
          {/* Brand */}
          <div className="flex items-center justify-between mb-4">
            <a href="https://autodun.com" className="flex items-center gap-2 text-sm font-semibold text-gray-700 hover:text-gray-900">
              <span className="text-lg">⚡</span>
              autodun.com
            </a>
            <button
              onClick={() => setShowHelp(!showHelp)}
              className="w-6 h-6 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-600"
              aria-label="Help"
            >
              ?
            </button>
          </div>

          {/* Help Popover */}
          {showHelp && (
            <div className="mb-4 p-3 bg-blue-50 rounded-lg text-xs space-y-2">
              <p><strong>🔥 Heatmap:</strong> Shows charging density</p>
              <p><strong>�� Markers:</strong> Individual stations</p>
              <p><strong>🗺️ Council:</strong> Borough boundaries</p>
            </div>
          )}

          {/* Search */}
          <form onSubmit={handleSearch} className="mb-4">
            <div className="flex items-center gap-2 border rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-blue-500">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search city or postcode..."
                className="flex-1 px-3 py-2 text-sm focus:outline-none"
                disabled={searchLoading}
                aria-label="Search location"
              />
              <button
                type="submit"
                disabled={searchLoading || !searchQuery.trim()}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:bg-gray-400"
              >
                {searchLoading ? '...' : 'Go'}
              </button>
            </div>
          </form>

          {/* Layer Toggles */}
          <div className="space-y-2 mb-4">
            <label className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 cursor-pointer">
              <input
                type="checkbox"
                checked={props.showHeatmap}
                onChange={props.onToggleHeatmap}
                className="w-4 h-4 rounded"
                aria-label="Toggle heatmap"
              />
              <span className="text-xl">🔥</span>
              <span className="text-sm font-medium flex-1">Heatmap</span>
            </label>
            
            <label className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 cursor-pointer">
              <input
                type="checkbox"
                checked={props.showMarkers}
                onChange={props.onToggleMarkers}
                className="w-4 h-4 rounded"
                aria-label="Toggle markers"
              />
              <span className="text-xl">📍</span>
              <span className="text-sm font-medium flex-1">Markers</span>
            </label>
            
            <label className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 cursor-pointer">
              <input
                type="checkbox"
                checked={props.showCouncil}
                onChange={props.onToggleCouncil}
                className="w-4 h-4 rounded"
                aria-label="Toggle council boundaries"
              />
              <span className="text-xl">🗺️</span>
              <span className="text-sm font-medium flex-1">Council</span>
            </label>
          </div>

          {/* Feedback Button */}
          <button
            onClick={props.onFeedback}
            className="w-full px-4 py-2 bg-yellow-400 hover:bg-yellow-300 text-gray-900 rounded-lg font-medium text-sm transition-colors"
          >
            💬 Send Feedback
          </button>
        </div>
      </div>

      {/* Mobile: Bottom sheet */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-[1000]">
        {!expanded && (
          <button
            onClick={() => setExpanded(true)}
            className="absolute bottom-4 right-4 w-14 h-14 bg-blue-600 text-white rounded-full shadow-xl flex items-center justify-center text-2xl"
            aria-label="Open controls"
          >
            ⚙️
          </button>
        )}

        {expanded && (
          <div className="bg-white rounded-t-2xl shadow-2xl p-4 animate-slide-up">
            <div className="flex items-center justify-between mb-4">
              <span className="font-bold text-gray-900">Controls</span>
              <button
                onClick={() => setExpanded(false)}
                className="w-8 h-8 flex items-center justify-center text-gray-500 hover:text-gray-700"
                aria-label="Close controls"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSearch} className="mb-4">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search..."
                  className="flex-1 px-3 py-3 border rounded-lg text-sm"
                  style={{ minHeight: '44px' }}
                />
                <button
                  type="submit"
                  disabled={searchLoading}
                  className="px-4 bg-blue-600 text-white rounded-lg"
                  style={{ minHeight: '44px' }}
                >
                  Go
                </button>
              </div>
            </form>

            <div className="space-y-3 mb-4">
              <label className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 active:bg-gray-100" style={{ minHeight: '44px' }}>
                <input type="checkbox" checked={props.showHeatmap} onChange={props.onToggleHeatmap} className="w-5 h-5" />
                <span className="text-xl">🔥</span>
                <span className="text-sm font-medium">Heatmap</span>
              </label>
              <label className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 active:bg-gray-100" style={{ minHeight: '44px' }}>
                <input type="checkbox" checked={props.showMarkers} onChange={props.onToggleMarkers} className="w-5 h-5" />
                <span className="text-xl">📍</span>
                <span className="text-sm font-medium">Markers</span>
              </label>
              <label className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 active:bg-gray-100" style={{ minHeight: '44px' }}>
                <input type="checkbox" checked={props.showCouncil} onChange={props.onToggleCouncil} className="w-5 h-5" />
                <span className="text-xl">🗺️</span>
                <span className="text-sm font-medium">Council</span>
              </label>
            </div>

            <button
              onClick={props.onFeedback}
              className="w-full px-4 py-3 bg-yellow-400 text-gray-900 rounded-lg font-medium"
              style={{ minHeight: '44px' }}
            >
              💬 Feedback
            </button>
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes slide-up {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        .animate-slide-up {
          animation: slide-up 0.3s ease-out;
        }
      `}</style>
    </>
  );
}
