"use client";

import { useCouncilByPoint } from "@/hooks/useCouncilByPoint";

export default function CouncilBadge({ lat, lng }:{ lat?: number; lng?: number }) {
  const { loading, feature, error } = useCouncilByPoint(lat, lng);

  if (!lat || !lng) return null;

  return (
    <div className="mt-3">
      <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">Council</div>

      {loading && (
        <div className="inline-flex items-center gap-2 text-xs px-2 py-1 rounded-full border">
          <span className="animate-pulse">Looking up…</span>
        </div>
      )}

      {!loading && error && (
        <div className="text-xs text-red-600">{error}</div>
      )}

      {!loading && !error && feature && (
        <div className="inline-flex items-center gap-2">
          <span className="px-2 py-1 rounded-full border bg-white text-sm">
            {feature.properties.name}
          </span>
          <span className="text-xs text-gray-500">({feature.properties.code})</span>
          <button
            type="button"
            className="text-xs underline"
            onClick={() => navigator.clipboard?.writeText(feature.properties.code)}
            title="Copy council code"
          >
            Copy code
          </button>
        </div>
      )}

      {!loading && !error && !feature && (
        <div className="text-xs text-gray-500">No council found</div>
      )}
    </div>
  );
}
