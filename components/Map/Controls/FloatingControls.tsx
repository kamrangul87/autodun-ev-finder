'use client';

import { useState, useEffect, FormEvent, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { debouncedSearch, saveLastSearch, getLastSearch } from '@/lib/search/nominatim';

interface FloatingControlsProps {
  showHeatmap: boolean;
  showMarkers: boolean;
  showCouncil: boolean;
  onToggleHeatmap: () => void;
  onToggleMarkers: () => void;
  onToggleCouncil: () => void;
  onSearchResult: (lat: number, lon: number, zoom?: number) => void;
  onFeedbackClick: () => void;
}

export default function FloatingControls(props: FloatingControlsProps) {
  const [expanded, setExpanded] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchError, setSearchError] = useState('');
  const [searching, setSearching] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  // Load last search on mount
  useEffect(() => {
    const last = getLastSearch();
    if (last) setSearchQuery(last);
  }, []);

  // Sync URL params
  useEffect(() => {
    const params = new URLSearchParams(searchParams?.toString() || '');
    params.set('heatmap', props.showHeatmap ? '1' : '0');
    params.set('markers', props.showMarkers ? '1' : '0');
    params.set('council', props.showCouncil ? '1' : '0');
    router.replace(`?${params.toString()}`, { scroll: false });
  }, [props.showHeatmap, props.showMarkers, props.showCouncil, router, searchParams]);

  const handleSearch = useCallback((e: FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim() || searching) return;

    setSearching(true);
    setSearchError('');

    debouncedSearch(searchQuery, (result) => {
      if (result) {
        const lat = parseFloat(result.lat);
        const lon = parseFloat(result.lon);
        const zoom = result.boundingbox ? 13 : 13;
        
        props.onSearchResult(lat, lon, zoom);
        saveLastSearch(searchQuery);
        setSearchQuery('');
      } else {
        setSearchError('Location not found. Try a UK city or postcode.');
      }
      setSearching(false);
    });
  }, [searchQuery, searching, props]);

  const handleUseLocation = () => {
    if (!navigator.geolocation) {
      setSearchError('Geolocation not supported');
      return;
    }

    setSearching(true);
    setSearchError('');

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        props.onSearchResult(pos.coords.latitude, pos.coords.longitude, 13);
        setSearching(false);
      },
      () => {
        setSearchError('Location access denied');
        setSearching(false);
      }
    );
  };

  return (
    <>
      {/* Desktop: Top-right floating card */}
      <div className="hidden md:block fixed top-4 right-4 z-[1000] pointer-events-none">
        <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-2xl border border-gray-200 p-4 w-80 pointer-events-auto">
          {/* Brand */}
          <div className="flex items-center justify-between mb-3">
            <a 
              href="/" 
              className="text-sm font-bold text-gray-800 hover:text-blue-600 transition-colors"
              tabIndex={0}
            >
              ⚡ autodun
            </a>
          </div>

          {/* Search */}
          <form onSubmit={handleSearch} className="mb-3">
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setSearchError('');
                }}
                placeholder="Search city or postcode..."
                className="w-full px-3 py-2 pr-20 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={searching}
                aria-label="Search location"
              />
              <div className="absolute right-1 top-1 flex gap-1">
                <button
                  type="button"
                  onClick={handleUseLocation}
                  disabled={searching}
                  className="p-1.5 hover:bg-gray-100 rounded disabled:opacity-50"
                  title="Use my location"
                  aria-label="Use my location"
                >
                  📍
                </button>
                <button
                  type="submit"
                  disabled={searching || !searchQuery.trim()}
                  className="px-2 py-1 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700 disabled:bg-gray-400"
                >
                  {searching ? '...' : 'Go'}
                </button>
              </div>
            </div>
            {searchError && (
              <p className="text-xs text-red-600 mt-1">{searchError}</p>
            )}
          </form>

          {/* Toggles */}
          <div className="space-y-2 mb-3">
            <label className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors">
              <input
                type="checkbox"
                checked={props.showHeatmap}
                onChange={props.onToggleHeatmap}
                className="w-4 h-4 rounded"
                aria-label="Toggle heatmap layer"
              />
              <span className="text-lg">🔥</span>
              <span className="text-sm font-medium flex-1">Heatmap</span>
            </label>
            
            <label className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors">
              <input
                type="checkbox"
                checked={props.showMarkers}
                onChange={props.onToggleMarkers}
                className="w-4 h-4 rounded"
                aria-label="Toggle station markers"
              />
              <span className="text-lg">📍</span>
              <span className="text-sm font-medium flex-1">Markers</span>
            </label>
            
            <label className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors">
              <input
                type="checkbox"
                checked={props.showCouncil}
                onChange={props.onToggleCouncil}
                className="w-4 h-4 rounded"
                aria-label="Toggle council boundaries"
              />
              <span className="text-lg">🗺️</span>
              <span className="text-sm font-medium flex-1">Council</span>
            </label>
          </div>

          {/* Feedback */}
          <button
            onClick={props.onFeedbackClick}
            className="w-full px-4 py-2 bg-yellow-400 hover:bg-yellow-300 text-gray-900 rounded-lg font-medium text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-yellow-500"
            aria-label="Send feedback"
          >
            💬 Feedback
          </button>
        </div>
      </div>

      {/* Mobile: Bottom sheet */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-[1000] pointer-events-none">
        {!expanded && (
          <button
            onClick={() => setExpanded(true)}
            className="absolute bottom-4 right-4 w-14 h-14 bg-blue-600 text-white rounded-full shadow-2xl flex items-center justify-center text-2xl pointer-events-auto focus:outline-none focus:ring-4 focus:ring-blue-300"
            style={{ minHeight: '56px', minWidth: '56px' }}
            aria-label="Open controls"
          >
            ⚙️
          </button>
        )}

        {expanded && (
          <div className="bg-white rounded-t-2xl shadow-2xl p-4 animate-slide-up pointer-events-auto">
            <div className="flex items-center justify-between mb-4">
              <span className="font-bold text-gray-900">Controls</span>
              <button
                onClick={() => setExpanded(false)}
                className="w-10 h-10 flex items-center justify-center text-gray-500 hover:text-gray-700 rounded-full hover:bg-gray-100"
                aria-label="Close controls"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSearch} className="mb-4">
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setSearchError('');
                  }}
                  placeholder="Search..."
                  className="w-full px-3 py-3 pr-16 border rounded-lg text-sm"
                  style={{ minHeight: '44px' }}
                />
                <button
                  type="button"
                  onClick={handleUseLocation}
                  className="absolute right-12 top-2 p-2"
                  style={{ minHeight: '40px', minWidth: '40px' }}
                >
                  📍
                </button>
                <button
                  type="submit"
                  disabled={searching}
                  className="absolute right-1 top-1 px-3 py-2 bg-blue-600 text-white rounded-lg"
                  style={{ minHeight: '40px' }}
                >
                  Go
                </button>
              </div>
              {searchError && (
                <p className="text-xs text-red-600 mt-1">{searchError}</p>
              )}
            </form>

            <div className="space-y-2 mb-4">
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
              onClick={props.onFeedbackClick}
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
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        .animate-slide-up {
          animation: slide-up 0.3s ease-out;
        }
      `}</style>
    </>
  );
}
