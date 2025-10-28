// components/StationDrawer.tsx
import { useEffect, useRef, useState } from "react";
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

const StationDrawer = ({
  open,
  station,
  onClose,
  onFeedbackSubmit,
}: StationDrawerProps) => {
  // feedback form state
  const [vote, setVote] = useState<"good" | "bad" | null>(null);
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedOk, setSubmittedOk] = useState(false);

  const drawerRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // reset form & focus on close button when station changes
  useEffect(() => {
    if (station) {
      setVote(null);
      setComment("");
      setIsSubmitting(false);
      setSubmittedOk(false);
      // Focus close after paint
      const t = setTimeout(() => closeButtonRef.current?.focus(), 80);
      return () => clearTimeout(t);
    }
  }, [station]);

  // close on Escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) onClose();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [open, onClose]);

  // trap focus inside drawer when open
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

  // only render when open & station present (controlled, no auto-close)
  if (!open || !station) return null;

  const totalConnectors =
    Array.isArray(station.connectors)
      ? station.connectors.reduce((sum, c) => sum + (c?.count ?? 0), 0)
      : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!station?.id || !vote || isSubmitting) return;

    try {
      setIsSubmitting(true);
      await onFeedbackSubmit?.(station.id, vote, comment);
      setSubmittedOk(true);
      // keep drawer open; just show "Thanks" for a moment
      const t = setTimeout(() => setSubmittedOk(false), 2200);
      return () => clearTimeout(t);
    } catch (_) {
      // swallow; optionally you can show an error state
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    setVote(null);
    setComment("");
    setSubmittedOk(false);
  };

  const handleDirections = () => {
    if (typeof window === "undefined") return;
    const qName = encodeURIComponent(station.name ?? "");
    const lat = station.lat;
    const lng = station.lng;
    const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&destination_place_id=&travelmode=driving&destination_name=${qName}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const drawer = (
    <>
      {/* Mobile backdrop (no onClick so it never auto-closes) */}
      <div
        className="fixed inset-0 bg-black/30 lg:hidden"
        style={{ zIndex: 9998 }}
        aria-hidden="true"
      />
      {/* Drawer panel */}
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Station details"
        className="fixed left-0 right-0 bottom-0 h-[55vh] bg-white overflow-auto rounded-t-2xl
                   lg:top-[70px] lg:right-0 lg:left-auto lg:bottom-auto lg:w-[400px]
                   lg:h-[calc(100vh-70px)] lg:rounded-none lg:border-l lg:border-gray-200"
        style={{
          zIndex: 9999,
          boxShadow: "0 10px 30px rgba(0,0,0,0.12)",
        }}
      >
        {/* Header */}
        <header className="flex items-center justify-between border-b px-4 py-3">
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
                  <span className="font-medium">Network:</span>{" "}
                  {station.network}
                </p>
              )}
              <p className="mt-1">
                <span className="font-medium">Connectors:</span>{" "}
                {totalConnectors}
              </p>
              {Array.isArray(station.connectors) && station.connectors.length > 0 && (
                <ul className="mt-2 list-inside list-disc text-sm text-gray-600">
                  {station.connectors.map((c, i) => (
                    <li key={`${c.type}-${i}`}>
                      {c.type} × {c.count}
                    </li>
                  ))}
                </ul>
              )}
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
                    className={`rounded-md border px-3 py-1 text-sm
                               ${vote === "good" ? "border-emerald-600 bg-emerald-50 text-emerald-700" : "border-gray-300 hover:bg-gray-50"}`}
                    aria-pressed={vote === "good"}
                  >
                    👍 Good
                  </button>
                  <button
                    type="button"
                    onClick={() => setVote("bad")}
                    className={`rounded-md border px-3 py-1 text-sm
                               ${vote === "bad" ? "border-rose-600 bg-rose-50 text-rose-700" : "border-gray-300 hover:bg-gray-50"}`}
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
    </>
  );

  return createPortal(drawer, document.body);
};

// provide both default and named exports
export default StationDrawer;
export { StationDrawer };
