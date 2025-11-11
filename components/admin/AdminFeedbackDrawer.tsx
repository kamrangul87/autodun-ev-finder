"use client";

import { useEffect, useState } from "react";
import { getCouncilAtPoint, type CouncilHit } from "@/lib/council";

type FeedbackItem = {
  id?: string | number;
  stationId?: string | number;
  vote?: string;
  comment?: string;
  source?: string;
  mlScore?: number | null;
  lat?: number | null;
  lng?: number | null;
  // add any other fields your UI shows
};

export type AdminFeedbackDrawerProps = {
  isOpen: boolean;
  onClose: () => void;
  item: FeedbackItem | null;
  onZoomTo?: (lat: number, lng: number) => void; // optional: parent wires to the map
};

export default function AdminFeedbackDrawer({
  isOpen,
  onClose,
  item,
  onZoomTo,
}: AdminFeedbackDrawerProps) {
  const lat = item?.lat ?? null;
  const lng = item?.lng ?? null;

  const [council, setCouncil] = useState<CouncilHit | null>(null);
  const [loadingCouncil, setLoadingCouncil] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      setCouncil(null);
      if (lat == null || lng == null) return;
      setLoadingCouncil(true);
      const hit = await getCouncilAtPoint(lat, lng);
      if (alive) {
        setCouncil(hit);
        setLoadingCouncil(false);
      }
    })();
    return () => { alive = false; };
  }, [lat, lng]);

  function copy(text?: string) {
    if (!text) return;
    navigator.clipboard?.writeText(text);
  }

  function zoomToCouncil() {
    if (lat != null && lng != null && onZoomTo) onZoomTo(lat, lng);
  }

  // If you use shadcn/ui Sheet or Dialog, you can swap container markup.
  if (!isOpen) return null;

  return (
    <aside className="fixed right-0 top-0 z-50 h-full w-[380px] max-w-[90vw] bg-white shadow-xl border-l overflow-y-auto">
      <div className="p-4 flex items-center justify-between border-b">
        <h2 className="text-lg font-semibold">Feedback details</h2>
        <button
          onClick={onClose}
          className="text-sm px-2 py-1 rounded border hover:bg-gray-50"
        >
          Close
        </button>
      </div>

      <div className="p-4 space-y-4">
        {/* Existing blocks you already show (vote, score, comment, mini-map, etc.) can be placed here */}

        {/* ───────────────── Council block (the fix you asked for) ───────────────── */}
        <section className="rounded-xl border p-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Council</h3>
            <div className="flex gap-2">
              <button
                className="text-xs px-2 py-1 rounded border"
                onClick={() => copy(council?.code)}
                disabled={!council?.code}
                title="Copy council code"
              >
                Copy code
              </button>
              <button
                className="text-xs px-2 py-1 rounded border"
                onClick={zoomToCouncil}
                title="Zoom to council"
              >
                Zoom on map
              </button>
            </div>
          </div>

          {lat == null || lng == null ? (
            <p className="text-sm mt-2 opacity-70">No coordinates on this feedback.</p>
          ) : loadingCouncil ? (
            <p className="text-sm mt-2 opacity-70">Looking up council…</p>
          ) : council ? (
            <div className="mt-2 text-sm">
              <div className="mb-1">
                <span className="opacity-70">Name:</span> {council.name}
              </div>
              {council.code && (
                <div className="mb-1">
                  <span className="opacity-70">Code:</span> {council.code}{" "}
                  <button className="ml-2 text-xs underline" onClick={() => copy(council.code)}>
                    Copy
                  </button>
                </div>
              )}
              {council.region && (
                <div className="mb-1"><span className="opacity-70">Region:</span> {council.region}</div>
              )}
              {council.country && (
                <div className="mb-1"><span className="opacity-70">Country:</span> {council.country}</div>
              )}
            </div>
          ) : (
            <p className="text-sm mt-2 opacity-70">No council found for this point.</p>
          )}
        </section>

        {/* keep the rest of your drawer UI below */}
      </div>
    </aside>
  );
}
