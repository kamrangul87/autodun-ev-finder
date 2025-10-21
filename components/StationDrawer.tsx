"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Connector = { type: string; count?: number; powerKW?: number };

export interface Station {
  id: string | number;
  name: string;
  address?: string;   // e.g. "123 High St"
  postcode?: string;  // e.g. "SW1A 1AA"
  lat: number;
  lng: number;
  connectors?: Connector[];
  network?: string;
}

export interface StationDrawerProps {
  station: Station | null;
  onClose: () => void;
  onFeedbackSubmit?: (
    stationId: string | number,
    vote: "good" | "bad",
    comment: string
  ) => void | Promise<void>;
}

function StationDrawer({ station, onClose, onFeedbackSubmit }: StationDrawerProps) {
  const [vote, setVote] = useState<"good" | "bad" | null>(null);
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Reset & focus on station change
  useEffect(() => {
    if (!station) return;
    setVote(null);
    setComment("");
    setIsSubmitting(false);
    const t = setTimeout(() => closeRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, [station]);

  // ESC to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && station) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [station, onClose]);

  // Focus trap
  useEffect(() => {
    if (!station || !panelRef.current) return;
    const el = panelRef.current;

    const getFocus = () =>
      Array.from(
        el.querySelectorAll<HTMLElement>(
          'button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])'
        )
      ).filter((n) => !n.hasAttribute("disabled"));

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const f = getFocus();
      if (!f.length) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };

    el.addEventListener("keydown", onKey as any);
    return () => el.removeEventListener("keydown", onKey as any);
  }, [station]);

  if (!station) return null;

  const total =
    Array.isArray(station.connectors) && station.connectors.length
      ? station.connectors.reduce((s, c) => s + (c.count ?? 1), 0)
      : 0;

  const fullAddress = [station.address, station.postcode].filter(Boolean).join(", ");

  const handleSubmit = async () => {
    if (!vote || !station || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stationId: station.id,
          vote,
          comment: comment.trim(),
          type: "station",
        }),
      });
      await onFeedbackSubmit?.(station.id, vote, comment);
      // keep panel open; clear form
      setVote(null);
      setComment("");
    } catch (e) {
      console.error("[StationDrawer] feedback error", e);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDirections = () => {
    const q = encodeURIComponent(station.name ?? "");
    const url = `https://www.google.com/maps/dir/?api=1&destination=${station.lat},${station.lng}&travelmode=driving&destination_name=${q}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  // Panel content
  const node = (
    <div className="fixed inset-0" style={{ zIndex: 9999, pointerEvents: "none" }}>
      {/* mobile dim only (no click-to-close, map stays interactive) */}
      <div className="lg:hidden fixed inset-0" style={{ background: "rgba(0,0,0,0.25)", pointerEvents: "none" }} />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="false"
        aria-label="Station details"
        className="pointer-events-auto fixed bg-white overflow-auto border border-gray-200 rounded-lg shadow-xl station-drawer"
      >
        {/* header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-3 py-2.5 flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-semibold truncate" title={station.name}>
              {station.name ?? "Charging station"}
            </div>
            {fullAddress && (
              <div className="mt-0.5 text-xs text-gray-600 truncate" title={fullAddress}>
                {fullAddress}
              </div>
            )}
          </div>

          <button
            ref={closeRef}
            onClick={onClose}
            className="text-gray-600 hover:bg-gray-100 rounded-md px-2 py-1"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* body */}
        <div className="p-3 space-y-3">
          {/* quick facts */}
          <div className="border border-gray-200 rounded-md p-2.5 text-sm text-gray-700">
            {!!station.network && (
              <div>
                <span className="font-medium">Network:</span> {station.network}
              </div>
            )}
            <div className="mt-1">
              <span className="font-medium">Connectors:</span> {total}
            </div>

            {Array.isArray(station.connectors) && station.connectors.length > 0 && (
              <ul className="mt-2 text-xs text-gray-600 list-disc list-inside space-y-0.5">
                {station.connectors.map((c, i) => (
                  <li key={`${c.type}-${i}`}>
                    {c.type}
                    {typeof c.count === "number" ? ` × ${c.count}` : ""}
                    {typeof c.powerKW === "number" ? ` • ${c.powerKW} kW` : ""}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* actions */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleDirections}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-[16px] w-[16px]" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M12 2l7 7-7 7-7-7 7-7zm0 0v20" />
              </svg>
              Directions
            </button>
            <button
              type="button"
              onClick={() => {
                setVote(null);
                setComment("");
              }}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Clear
            </button>
          </div>

          {/* feedback */}
          <div className="border border-gray-200 rounded-md p-2.5">
            <div className="text-sm font-medium mb-2">Rate this location</div>

            <div className="flex gap-2 mb-2">
              <button
                type="button"
                onClick={() => setVote("good")}
                aria-pressed={vote === "good"}
                className={`flex-1 rounded-full border px-3 py-1.5 text-sm ${
                  vote === "good"
                    ? "border-emerald-600 bg-emerald-50 text-emerald-700"
                    : "border-gray-300 text-gray-700 hover:bg-gray-50"
                }`}
              >
                👍 Good
              </button>
              <button
                type="button"
                onClick={() => setVote("bad")}
                aria-pressed={vote === "bad"}
                className={`flex-1 rounded-full border px-3 py-1.5 text-sm ${
                  vote === "bad"
                    ? "border-rose-600 bg-rose-50 text-rose-700"
                    : "border-gray-300 text-gray-700 hover:bg-gray-50"
                }`}
              >
                👎 Bad
              </button>
            </div>

            {vote && (
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value.slice(0, 280))}
                placeholder="Optional: broken connector, blocked bay, pricing issue…"
                className="w-full rounded-md border border-gray-300 p-2 text-sm outline-none focus:border-gray-400"
                rows={3}
                maxLength={280}
              />
            )}

            <div className="mt-2 flex">
              <button
                onClick={handleSubmit}
                disabled={!vote || isSubmitting}
                className="flex-1 rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isSubmitting ? "Submitting…" : "Submit feedback"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* positioning styles */}
      <style jsx>{`
        /* Mobile: bottom sheet */
        .station-drawer {
          left: 0;
          right: 0;
          bottom: 0;
          height: 60vh;
          border-top-left-radius: 16px;
          border-top-right-radius: 16px;
        }
        /* Desktop+: compact floating card in the bottom-right corner */
        @media (min-width: 1024px) {
          .station-drawer {
            top: auto;
            bottom: 16px;
            right: 16px;
            left: auto;
            height: auto;
            max-height: 72vh;
            width: 360px;
            border-radius: 14px;
          }
        }
      `}</style>
    </div>
  );

  return createPortal(node, document.body);
}

export default StationDrawer;
export { StationDrawer };
