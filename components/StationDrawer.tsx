// components/StationDrawer.jsx
"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Minimal, framework-agnostic station shape expected by the drawer.
 * (Works with your OCM mapping.)
 */
export function StationDrawer({ station, onClose, onFeedbackSubmit }) {
  const [vote, setVote] = useState(null); // "good" | "bad" | null
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const panelRef = useRef(null);
  const closeRef = useRef(null);

  // Reset form + focus when station changes
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
    const onKey = (e) => {
      if (e.key === "Escape" && station) onClose?.();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [station, onClose]);

  // Focus trap (keeps keyboard focus inside the panel)
  useEffect(() => {
    if (!station || !panelRef.current) return;
    const el = panelRef.current;

    const getFocusables = () =>
      Array.from(
        el.querySelectorAll(
          'button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])'
        )
      ).filter((n) => !n.hasAttribute("disabled"));

    const onKey = (e) => {
      if (e.key !== "Tab") return;
      const items = getFocusables();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };

    el.addEventListener("keydown", onKey);
    return () => el.removeEventListener("keydown", onKey);
  }, [station]);

  if (!station) return null;

  const fullAddress = [station.address, station.postcode].filter(Boolean).join(", ");

  const totalConnectors =
    Array.isArray(station.connectors) && station.connectors.length
      ? station.connectors.reduce((s, c) => s + (c?.count ?? c?.quantity ?? 1), 0)
      : 0;

  const handleSubmit = async () => {
    if (!vote || isSubmitting) return;
    setIsSubmitting(true);
    try {
      // Keep your existing API (noop if not configured)
      await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stationId: station.id,
          vote,
          comment: comment.trim(),
          type: "station",
        }),
      }).catch(() => {});
      await onFeedbackSubmit?.(station.id, vote, comment);
      // Keep the drawer open, clear form
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

  const node = (
    <div className="station-drawer-layer" aria-hidden={!station}>
      {/* Dim only on mobile; map stays interactive on desktop */}
      <div className="drawer-dim lg:hidden" />

      {/* Panel */}
      <div ref={panelRef} role="dialog" aria-modal="false" className="drawer-card">
        {/* Header */}
        <div className="drawer-header">
          <div className="drawer-title">
            <div className="name" title={station.name}>
              {station.name || "Charging station"}
            </div>
            {fullAddress && (
              <div className="address" title={fullAddress}>
                {fullAddress}
              </div>
            )}
          </div>
          <button
            ref={closeRef}
            onClick={onClose}
            className="close"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="drawer-body">
          {/* Quick facts */}
          <div className="card">
            {!!station.network && (
              <div className="row">
                <span className="label">Network:</span> {station.network}
              </div>
            )}
            <div className="row">
              <span className="label">Connectors:</span> {totalConnectors}
            </div>

            {Array.isArray(station.connectors) && station.connectors.length > 0 && (
              <ul className="conns">
                {station.connectors.map((c, i) => (
                  <li key={`${c?.type || "conn"}-${i}`}>
                    {c?.type || "Connector"}
                    {typeof (c?.count ?? c?.quantity) === "number"
                      ? ` × ${(c?.count ?? c?.quantity)}`
                      : ""}
                    {typeof c?.powerKW === "number" ? ` • ${c.powerKW} kW` : ""}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Actions */}
          <div className="actions">
            <button className="btn primary" onClick={handleDirections}>
              ⤴ Directions
            </button>
            <button
              className="btn"
              onClick={() => {
                setVote(null);
                setComment("");
              }}
            >
              Clear
            </button>
          </div>

          {/* Feedback */}
          <div className="card">
            <div className="row head">Rate this location</div>

            <div className="vote">
              <button
                type="button"
                onClick={() => setVote("good")}
                aria-pressed={vote === "good"}
                className={`chip ${vote === "good" ? "chip-on-good" : ""}`}
              >
                👍 Good
              </button>
              <button
                type="button"
                onClick={() => setVote("bad")}
                aria-pressed={vote === "bad"}
                className={`chip ${vote === "bad" ? "chip-on-bad" : ""}`}
              >
                👎 Bad
              </button>
            </div>

            {vote && (
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value.slice(0, 280))}
                placeholder="Optional: broken connector, blocked bay, pricing issue…"
                rows={3}
                maxLength={280}
                className="ta"
              />
            )}

            <button
              onClick={handleSubmit}
              disabled={!vote || isSubmitting}
              className="btn block dark"
            >
              {isSubmitting ? "Submitting…" : "Submit feedback"}
            </button>
          </div>
        </div>
      </div>

      {/* Styles */}
      <style jsx>{`
        .station-drawer-layer {
          position: fixed;
          inset: 0;
          z-index: 9999;
          pointer-events: none; /* map stays interactive except on the card */
        }
        .drawer-dim {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.25);
          pointer-events: none;
        }
        .drawer-card {
          pointer-events: auto;
          position: fixed;
          left: 0;
          right: 0;
          bottom: 0;
          height: 58vh;
          background: #fff;
          border-top-left-radius: 14px;
          border-top-right-radius: 14px;
          box-shadow: 0 10px 30px rgba(0,0,0,0.12);
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        /* Desktop — compact floating card in bottom-right */
        @media (min-width: 1024px) {
          .drawer-card {
            bottom: 16px;
            right: 16px;
            left: auto;
            top: auto;
            height: auto;
            max-height: 72vh;
            width: 360px;
            border-radius: 14px;
            border: 1px solid #e5e7eb;
          }
        }

        .drawer-header {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 12px;
          border-bottom: 1px solid #e5e7eb;
          background: #fff;
          position: sticky;
          top: 0;
          z-index: 1;
        }
        .drawer-title {
          min-width: 0;
          flex: 1;
        }
        .name {
          font-weight: 600;
          font-size: 15px;
          color: #111827;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .address {
          margin-top: 2px;
          font-size: 12px;
          color: #6b7280;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .close {
          color: #6b7280;
          border: 0;
          background: transparent;
          border-radius: 6px;
          padding: 4px 6px;
        }
        .close:hover {
          background: #f3f4f6;
        }

        .drawer-body {
          padding: 10px;
          overflow: auto;
          display: grid;
          gap: 10px;
        }
        .card {
          border: 1px solid #e5e7eb;
          border-radius: 10px;
          padding: 10px;
        }
        .row {
          font-size: 14px;
          color: #374151;
        }
        .row + .row {
          margin-top: 4px;
        }
        .row .label {
          font-weight: 600;
        }
        .row.head {
          font-weight: 600;
          margin-bottom: 8px;
        }
        .conns {
          margin-top: 6px;
          color: #6b7280;
          font-size: 12px;
          padding-left: 18px;
          list-style: disc;
        }

        .actions {
          display: flex;
          gap: 8px;
        }
        .btn {
          border: 1px solid #d1d5db;
          background: #fff;
          color: #374151;
          font-weight: 500;
          font-size: 14px;
          padding: 8px 10px;
          border-radius: 8px;
        }
        .btn:hover {
          background: #f9fafb;
        }
        .btn.primary {
          background: #2563eb;
          border-color: #2563eb;
          color: #fff;
        }
        .btn.primary:hover {
          background: #1e40af;
          border-color: #1e40af;
        }
        .btn.block {
          width: 100%;
          margin-top: 8px;
        }
        .btn.dark {
          background: #111827;
          border-color: #111827;
          color: #fff;
        }

        .vote {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
          margin-bottom: 8px;
        }
        .chip {
          border: 1px solid #d1d5db;
          border-radius: 999px;
          padding: 7px 10px;
          font-size: 14px;
          color: #374151;
          background: #fff;
        }
        .chip-on-good {
          background: #ecfdf5;
          border-color: #059669;
          color: #047857;
        }
        .chip-on-bad {
          background: #fef2f2;
          border-color: #dc2626;
          color: #b91c1c;
        }

        .ta {
          width: 100%;
          border: 1px solid #d1d5db;
          border-radius: 8px;
          padding: 8px;
          font-size: 14px;
          color: #374151;
          outline: none;
        }
        .ta:focus {
          border-color: #9ca3af;
        }
      `}</style>
    </div>
  );

  return createPortal(node, document.body);
}

export default StationDrawer;
