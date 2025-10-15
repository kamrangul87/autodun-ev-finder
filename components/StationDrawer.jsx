import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

/**
 * Floating drawer (right-side overlay).
 * - Only closes via the component's own controls (X / Close button).
 * - No ESC close, no backdrop-click close, no map-click close.
 * - Uses portal to avoid Leaflet z-index issues.
 */
export default function StationDrawer({ open, onClose, station }) {
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return (
  <div id="station-drawer" style={{position:"fixed", right:16, bottom:16, width:"min(420px, 92vw)", maxHeight:"72vh", overflow:"auto", zIndex:60, background:"#fff", borderRadius:12, boxShadow:"0 12px 28px rgba(0,0,0,.28)"}}>
) => {
      document.body.style.overflow = prev || "";
    };
  }, [open]);

  if (!open) return null;

  const title =
    station?.AddressInfo?.Title ||
    station?.title ||
    station?.name ||
    "Charging station";

  const address =
    station?.AddressInfo?.AddressLine1 ||
    station?.address ||
    "";

  const town =
    station?.AddressInfo?.Town ||
    station?.AddressInfo?.City ||
    "";

  const postcode =
    station?.AddressInfo?.Postcode ||
    station?.postcode ||
    "";

  const lat = station?.AddressInfo?.Latitude || station?.lat || 0;
  const lng = station?.AddressInfo?.Longitude || station?.lng || 0;
  
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;

  return createPortal(
    <div
      className="fixed inset-0 z-[10000]"
      aria-hidden="false"
      style={{ pointerEvents: "none" }}
    >
      {/* Optional backdrop for dimming; DOES NOT close on click */}
      <div
        className="absolute inset-0 bg-black/35"
        style={{ pointerEvents: "none" }}
      />

      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Station details"
        className="fixed right-0 top-0 h-screen w-[420px] max-w-[90vw] bg-white shadow-2xl border-l border-neutral-200 flex flex-col"
        style={{ pointerEvents: "auto" }}
      >
        <header className="sticky top-0 bg-white border-b px-4 py-3 flex items-center justify-between z-10">
          <h2 className="font-semibold text-lg truncate pr-2">{title}</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="px-2 py-1 text-sm rounded border hover:bg-neutral-100 flex-shrink-0"
          >
            ✕
          </button>
        </header>

        <section className="flex-1 overflow-auto p-4 text-sm space-y-4">
          {/* Station Details */}
          <div className="space-y-2">
            {address && (
              <div>
                <span className="font-medium">Address: </span>
                {address}
              </div>
            )}
            {town && (
              <div>
                <span className="font-medium">Town/City: </span>
                {town}
              </div>
            )}
            {postcode && (
              <div>
                <span className="font-medium">Postcode: </span>
                {postcode}
              </div>
            )}
            {station?.connectors !== undefined && (
              <div>
                <span className="font-medium">Connectors: </span>
                {station.connectors}
              </div>
            )}
            {station?.source && (
              <div>
                <span className="font-medium">Source: </span>
                <span className="text-xs uppercase tracking-wide">{station.source}</span>
              </div>
            )}
          </div>

          {/* Directions Button */}
          {lat && lng && (
            
              href={directionsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white text-center rounded font-medium transition-colors"
            >
              Get Directions
            </a>
          )}

          {/* Feedback Form */}
          <div className="border border-green-200 bg-green-50 rounded p-3">
            <aside id="station-drawer" className="station-drawer">
<form action="/api/feedback" method="POST" className="space-y-3">
<button type="button" aria-label="Close" className="drawer-close" onclick="(function(e){e.preventDefault(); var el=document.getElementById("station-drawer"); if(el) el.classList.add("hidden");})(event)">×</button>
              <input type="hidden" name="stationId" value={station?.id || station?.ID || ""} />
              
              <label htmlFor="feedback-note" className="block text-sm font-medium text-gray-700">
                Quick Feedback
              </label>
              <textarea
                id="feedback-note"
                name="note"
                rows={3}
                placeholder="Share your experience..."
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
              />
              <button
                type="submit"
                className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded font-medium transition-colors"
              >
                Submit Feedback
              </button>
            </form>
</aside>
          </div>
        </section>

        <footer className="sticky bottom-0 bg-white border-t px-4 py-3 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded border border-gray-300 hover:bg-neutral-50 font-medium"
          >
            Close
          </button>
        </footer>
      </aside>
    </div>,
    document.body
  );
}
