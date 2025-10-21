// components/StationDrawer.tsx
"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";

export interface Station {
  id: string;
  name: string;
  address?: string;
  lat: number;
  lng: number;
  connectors?: Array<{ type: string; count: number }>;
  network?: string;
}

export interface StationDrawerProps {
  /** whether the drawer is visible */
  open: boolean;
  /** selected station (or null) */
  station: Station | null;
  /** called when the user clicks “×” or presses Escape */
  onClose: () => void;
  /** optional feedback handler */
  onFeedbackSubmit?: (
    stationId: string,
    vote: "good" | "bad",
    comment: string
  ) => Promise<void> | void;
}

export default function StationDrawer({
  open,
  station,
  onClose,
  onFeedbackSubmit,
}: StationDrawerProps) {
  // feedback form state
  const [vote, setVote] = useState<"good" | "bad" | null>(null);
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedOk, setSubmittedOk] = useState(false);

  const drawerRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Reset form & focus on close button when station changes
  useEffect(() => {
    if (!station) return;
    setVote(null);
    setComment("");
    setIsSubmitting(false);
    setSubmittedOk(false);
    const t = setTimeout(() => closeButtonRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, [station]);

  // Close on Escape only (no backdrop close)
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) onClose();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [open, onClose]);

  // Trap focus inside the drawer when open
  useEffect(() => {
    if (!open || !drawerRef.current) return;
    const drawer = drawerRef.current;

    const getFocusable = () =>
      Array.from(
        drawer.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => !el.hasAttribute("disabled"));

    const trap = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const focusable = getFocusable();
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };

    drawer.addEventListener("keydown", trap as any);
    return () => drawer.removeEventListener("keydown", trap as any);
  }, [open]);

  // Only render when open & station present
  if (!open || !station) return null;

  const totalConnectors = Array.isArray(station.connectors)
    ? station.connectors.reduce((sum, c) => sum + (c?.count ?? 0), 0)
    : 0;

  const connectorsSummary =
    Array.isArray(station.connectors) && station.connectors.length
      ? station.connectors
          .filter(Boolean)
          .map((c) => `${c.type} × ${c.count ?? 1}`)
          .join(", ")
      : "";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!station?.id || !vote || isSubmitting) return;

    try {
      setIsSubmitting(true);
      await onFeedbackSubmit?.(station.id, vote, comment);
      setSubmittedOk(true);
      const t = setTimeout(() => setSubmittedOk(false), 2200);
      return () => clearTimeout(t);
    } catch {
      // Optional: surface an error state
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    setVote(null);
    setComment("");
    setSubmittedOk(false);
  };

  const handleDirections = useCallback(() => {
    const qName = encodeURIComponent(station.name ?? "");
    const url = `https://www.google.com/maps/dir/?api=1&destination=${station.lat},${station.lng}&travelmode=driving&destination_name=${qName}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }, [station]);

  // Wrapper has pointer-events: none → map beneath stays interactive.
  // Panel itself is pointer-events: auto so it’s clickable.
  const drawer = (
    <div
      className="fixed inset-0"
      style={{ zIndex: 9999, pointerEvents: "none" }}
      aria-hidden={!open}
    >
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="false"
        aria-label="Station details"
        className="pointer-events-auto fixed left-0 right-0 bottom-0 h-[55vh] bg-white overflow-auto rounded-t-2xl
                   lg:top-[70px] lg:right-4 lg:left-auto lg:bottom-auto lg:w-[420px]
                   lg:h-[calc(100vh-86px)] lg:rounded-2xl lg:border lg:border-gray-200"
        style={{ boxShadow: "0 10px 30px rgba(0,0,0,0.12)" }}
      >
        {/* Header */}
        <header className="flex items-center justify-between border-b px-4 py-3 sticky top-0 bg-white z-10">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold">
              {station.name ?? "Charging station"}
            </h2>
            {station.address && (
              <p className="mt-0.5 truncate text-sm text-gray-600">
                {station.address}
              </p>
            )}
          </div>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            aria-label="Close drawer"
            className="ml-3 rounded-md px-2 py-1 text-gray-500 hover:bg-gray-100"
          >
            ✕
          </button>
        </header>

        {/* Body */}
        <div className="space-y-4 p-4">
          {/* Summary */}
          <section className="rounded-lg border p-3">
            <div className="text-sm text-gray-700">
              {!!station.network && (
                <p>
                  <span className="font-medium">Network:</span> {station.network}
                </p>
              )}
              <p className="mt-1">
                <span className="font-medium">Connectors:</span> {totalConnectors}
                {connectorsSummary ? ` (${connectorsSummary})` : ""}
              </p>
              <p className="mt-1 text-gray-600">
                <span className="font-medium">Coords:</span>{" "}
                {station.lat.toFixed(5)}, {station.lng.toFixed(5)}
              </p>
            </div>
          </section>

          {/* Feedback */}
          <section className="rounded-lg border p-3">
            <h3 className="mb-2 text-sm font-medium">Rate this location</h3>

            {submittedOk ? (
              <p className="text-sm text-green-600">Thanks for your feedback!</p>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setVote("good")}
                    className={`rounded-md border px-3 py-1 text-sm ${
                      vote === "good"
                        ? "border-emerald-600 bg-emerald-50 text-emerald-700"
                        : "border-gray-300 hover:bg-gray-50"
                    }`}
                    aria-pressed={vote === "good"}
                  >
                    👍 Good
                  </button>
                  <button
                    type="button"
                    onClick={() => setVote("bad")}
                    className={`rounded-md border px-3 py-1 text-sm ${
                      vote === "bad"
                        ? "border-rose-600 bg-rose-50 text-rose-700"
                        : "border-gray-300 hover:bg-gray-50"
                    }`}
                    aria-pressed={vote === "bad"}
                  >
                    👎 Bad
                  </button>
                </div>

                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows={3}
                  placeholder="Optional comment…"
                  className="w-full resize-y rounded-md border border-gray-300 p-2 text-sm outline-none focus:border-gray-400"
                />

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="submit"
                    disabled={!vote || isSubmitting}
                    className="rounded-md bg-black px-3 py-1 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isSubmitting ? "Submitting…" : "Submit feedback"}
                  </button>
                  <button
                    type="button"
                    onClick={handleCancel}
                    className="rounded-md border border-gray-300 px-3 py-1 text-sm hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </section>

          {/* Actions */}
          <section className="pt-1">
            <button
              type="button"
              onClick={handleDirections}
              className="text-sm font-medium text-blue-600 hover:underline"
            >
              Get directions →
            </button>
          </section>
        </div>
      </div>
    </div>
  );

  // Render above Leaflet panes, into <body>
  return createPortal(drawer, document.body);
}
