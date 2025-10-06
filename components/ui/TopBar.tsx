'use client';

import { useState, FormEvent } from 'react';

interface TopBarProps {
  showHeatmap: boolean;
  showMarkers: boolean;
  showCouncil: boolean;
  onToggleHeatmap: () => void;
  onToggleMarkers: () => void;
  onToggleCouncil: () => void;
  onSearch: (query: string) => Promise<void>;
}

export default function TopBar({
  showHeatmap,
  showMarkers,
  showCouncil,
  onToggleHeatmap,
  onToggleMarkers,
  onToggleCouncil,
  onSearch,
}: TopBarProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackEmail, setFeedbackEmail] = useState('');
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [feedbackSending, setFeedbackSending] = useState(false);

  const handleSearch = async (e: FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim() || searchLoading) return;

    setSearchLoading(true);
    try {
      await onSearch(searchQuery);
      setSearchQuery('');
    } finally {
      setSearchLoading(false);
    }
  };

  const handleFeedbackSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!feedbackMessage.trim() || feedbackSending) return;

    setFeedbackSending(true);
    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: feedbackEmail || undefined,
          message: feedbackMessage,
        }),
      });

      if (response.ok) {
        alert('Thanks for your feedback!');
        setFeedbackOpen(false);
        setFeedbackEmail('');
        setFeedbackMessage('');
      } else {
        alert('Failed to send feedback');
      }
    } catch (error) {
      alert('Failed to send feedback');
    } finally {
      setFeedbackSending(false);
    }
  };

  return (
    <>
      <div className="absolute top-0 left-0 right-0 z-[1000] bg-white border-b shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 md:gap-4 px-3 md:px-4 py-2">
          <div className="flex items-center justify-between md:justify-start gap-3 md:gap-4">
            <h1 className="text-lg md:text-xl font-bold text-gray-900">autodun</h1>
            
            <form onSubmit={handleSearch} className="flex items-center gap-1 flex-1 md:flex-none">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search city or postcode..."
                className="px-2 md:px-3 py-1 text-sm border rounded w-full md:w-48 lg:w-64 focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={searchLoading}
              />
              <button
                type="submit"
                disabled={searchLoading || !searchQuery.trim()}
                className="px-2 md:px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 whitespace-nowrap"
              >
                {searchLoading ? '...' : 'Go'}
              </button>
            </form>
          </div>

          <div className="flex items-center justify-between md:justify-end gap-2 md:gap-3">
            <div className="flex items-center gap-2 text-sm">
              <label className="flex items-center gap-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showHeatmap}
                  onChange={onToggleHeatmap}
                  className="rounded"
                />
                <span className="hidden sm:inline">Heatmap</span>
                <span className="sm:hidden">Heat</span>
              </label>
              <label className="flex items-center gap-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showMarkers}
                  onChange={onToggleMarkers}
                  className="rounded"
                />
                <span className="hidden sm:inline">Markers</span>
                <span className="sm:hidden">Pins</span>
              </label>
              <label className="flex items-center gap-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showCouncil}
                  onChange={onToggleCouncil}
                  className="rounded"
                />
                <span className="hidden sm:inline">Council</span>
                <span className="sm:hidden">Area</span>
              </label>
            </div>

            <button
              onClick={() => setFeedbackOpen(true)}
              className="px-2 md:px-3 py-1 text-sm bg-yellow-400 text-gray-900 rounded hover:bg-yellow-300 font-medium"
            >
              Feedback
            </button>
          </div>
        </div>
      </div>

      {feedbackOpen && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50" onClick={() => setFeedbackOpen(false)}>
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-bold mb-4">Send Feedback</h2>
            <form onSubmit={handleFeedbackSubmit}>
              <input
                type="email"
                value={feedbackEmail}
                onChange={(e) => setFeedbackEmail(e.target.value)}
                placeholder="Your email (optional)"
                className="w-full px-3 py-2 border rounded mb-3 text-sm"
              />
              <textarea
                value={feedbackMessage}
                onChange={(e) => setFeedbackMessage(e.target.value)}
                placeholder="Your message"
                rows={4}
                className="w-full px-3 py-2 border rounded mb-3 text-sm"
                required
              />
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setFeedbackOpen(false)}
                  className="flex-1 px-4 py-2 border rounded text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={feedbackSending || !feedbackMessage.trim()}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded disabled:bg-gray-400 text-sm"
                >
                  {feedbackSending ? 'Sending...' : 'Send'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style jsx global>{`
        .council-tooltip {
          background: white !important;
          border: 2px solid #3A8DFF !important;
          border-radius: 4px !important;
          padding: 4px 8px !important;
          font-size: 12px !important;
          font-weight: 600 !important;
          color: #1e40af !important;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1) !important;
        }
      `}</style>
    </>
  );
}
