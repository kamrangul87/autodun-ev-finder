'use client';

import React from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="p-6 max-w-xl mx-auto">
      <h2 className="text-lg font-semibold mb-2">Map crashed</h2>
      <p className="text-sm text-gray-600">
        Something went wrong while rendering the map. Try reloading below.
      </p>

      <div className="mt-4 flex gap-3">
        <button
          onClick={() => reset()}
          className="px-4 py-2 rounded-lg border border-black/10 hover:bg-gray-50"
        >
          Reload map
        </button>
        <button
          onClick={() => location.reload()}
          className="px-4 py-2 rounded-lg border border-black/10 hover:bg-gray-50"
        >
          Refresh page
        </button>
      </div>

      {/* Debug details (safe to keep; helps catch the exact runtime error) */}
      <pre className="mt-4 text-xs whitespace-pre-wrap bg-gray-50 p-3 rounded-lg">
        {String(error?.message ?? '')}
      </pre>
    </div>
  );
}
