"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Connector = { type: string; count?: number; powerKW?: number };
export interface Station {
  id: string | number;
  name: string;
  address?: string;
  lat: number;
  lng: number;
  connectors?: Connector[];
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

export default function StationDrawer({
  station,
  onClose,
  onFeedbackSubmit,
}: StationDrawerProps) {
  const [vote, setVote] = useState<"good" | "bad" | null>(null);
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const drawerRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // reset on station change
  useEffect(() => {
    if (!station) return;
    setVote(null);
    setComment("");
    setIsSubmitting(false);
    const t = setTimeout(() => closeButtonRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, [station]);

  // esc to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && station) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [station, onClose]);

  // focus trap
  useEffect(() => {
    if (!station || !drawerRef.current) return;
    const el = drawerRef.current;
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
      // keep open, just reset
      setVote(null);
      setComment("");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDirections = () => {
    const q = encodeURIComponent(station.name ?? "");
    const url = `https://www.google.com/maps/dir/?api=1&destination=${station.lat},${station.lng}&travelmode=driving&destination_name=${q}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  // --------- RENDER ----------
  const node = (
    <div
      className="fixed inset-0"
      style={{ zIndex: 9999, pointerEvents: "none" }}
    >
      {/* subtle dim only on mobile; no click handler (don’t auto-close) */}
      <div
        className="lg:hidden fixed inset-0"
        style={{ background: "rgba(0,0,0,0.25)", pointerEvents: "none" }}
      />

      {/* panel */}
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="false"
        aria-label="Station details"
        className="pointer-events-auto fixed bg-white overflow-auto"
        // mobile: bottom sheet
        style={{
          left: 0,
          right: 0,
          bottom: 0,
          height: "45vh", // smaller than before
          borderTopLeftRadius: 14,
          borderTopRightRadius: 14,
          boxShadow: "0 8px 24px rgba(0,0,0,0.14)",
        }}
      >
        {/* desktop: compact floating card in bottom-right */}
        <style>{`
          @media (min-width: 1024px) {
            .drawer-compact {
              left: auto !important;
              right: 16px !important;
              bottom: 16px !important;
              top: auto !important;
              width: 360px !important;
              max-height: 70vh !important;
              height: auto !important;
              border-radius: 14px !important;
              border: 1px solid rgba(0,0,0,0.08);
            }
          }
        `}</style>
        <div className="drawer-compact" />

        {/* header */}
        <div
          className="sticky top-0"
          style={{
            background: "#fff",
            borderBottom: "1px solid #e5e7eb",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "10px 12px",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 15,
                fontWeight: 600,
                lineHeight: "20px",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
              title={station.name}
            >
              {station.name ?? "Charging station"}
            </div>
            {station.address && (
              <div
                style={{
                  marginTop: 2,
                  fontSize: 12,
                  color: "#6b7280",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
                title={station.address}
              >
                {station.address}
              </div>
            )}
          </div>

          <button
            ref={closeButtonRef}
            onClick={onClose}
            aria-label="Close"
            style={{
              marginLeft: 8,
              border: "1px solid transparent",
              background: "transparent",
              borderRadius: 8,
              padding: "4px 6px",
              color: "#6b7280",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#f3f4f6")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            ✕
          </button>
        </div>

        {/* body */}
        <div style={{ padding: 12 }}>
          {/* summary */}
          <section
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: 10,
              padding: 10,
              marginBottom: 10,
              fontSize: 13,
              color: "#374151",
            }}
          >
            <div>
              <span style={{ fontWeight: 600 }}>Connectors:</span> {total}
            </div>
          </section>

          {/* rate */}
          <section
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: 10,
              padding: 10,
              marginBottom: 10,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
              Rate this location
            </div>

            <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
              <button
                type="button"
                onClick={() => setVote("good")}
                aria-pressed={vote === "good"}
                style={{
                  flex: 1,
                  borderRadius: 999,
                  padding: "8px 10px",
                  border: vote === "good" ? "1px solid #059669" : "1px solid #d1d5db",
                  background: vote === "good" ? "#ecfdf5" : "#fff",
                  color: vote === "good" ? "#065f46" : "#374151",
                  fontSize: 13,
                }}
              >
                👍 Good
              </button>
              <button
                type="button"
                onClick={() => setVote("bad")}
                aria-pressed={vote === "bad"}
                style={{
                  flex: 1,
                  borderRadius: 999,
                  padding: "8px 10px",
                  border: vote === "bad" ? "1px solid #e11d48" : "1px solid #d1d5db",
                  background: vote === "bad" ? "#fff1f2" : "#fff",
                  color: vote === "bad" ? "#9f1239" : "#374151",
                  fontSize: 13,
                }}
              >
                👎 Bad
              </button>
            </div>

            {vote && (
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value.slice(0, 280))}
                placeholder="Optional comment…"
                rows={3}
                maxLength={280}
                style={{
                  width: "100%",
                  borderRadius: 8,
                  border: "1px solid #d1d5db",
                  padding: 8,
                  fontSize: 13,
                  resize: "vertical",
                  outline: "none",
                  marginBottom: 6,
                }}
              />
            )}

            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={handleSubmit}
                disabled={!vote || isSubmitting}
                style={{
                  flex: 1,
                  borderRadius: 8,
                  background: "#111827",
                  color: "#fff",
                  fontWeight: 600,
                  padding: "8px 10px",
                  fontSize: 13,
                  opacity: !vote || isSubmitting ? 0.6 : 1,
                  cursor: !vote || isSubmitting ? "not-allowed" : "pointer",
                }}
              >
                {isSubmitting ? "Submitting…" : "Submit feedback"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setVote(null);
                  setComment("");
                }}
                style={{
                  borderRadius: 8,
                  background: "#fff",
                  border: "1px solid #d1d5db",
                  color: "#374151",
                  padding: "8px 10px",
                  fontSize: 13,
                }}
              >
                Cancel
              </button>
            </div>
          </section>

          {/* actions */}
          <section>
            <button
              type="button"
              onClick={handleDirections}
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "#2563eb",
                background: "transparent",
                border: "none",
                padding: 0,
                cursor: "pointer",
              }}
            >
              Get directions →
            </button>
          </section>
        </div>
      </div>
    </div>
  );

  return createPortal(node, document.body);
}
