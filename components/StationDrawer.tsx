"use client";

import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Station as StationType } from "../types/station";

type Vote = "good" | "bad" | null;

interface StationDrawerProps {
  station: StationType | null;
  onClose: () => void;
  onFeedbackSubmit?: (
    stationId: number | string,
    vote: "good" | "bad",
    comment: string
  ) => Promise<void> | void;
}

export const StationDrawer: React.FC<StationDrawerProps> = ({
  station,
  onClose,
  onFeedbackSubmit,
}: StationDrawerProps) => {
  const [vote, setVote] = useState<Vote>(null);
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!station) return;
    setVote(null);
    setComment("");
    setIsSubmitting(false);
    const t = setTimeout(() => closeRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [station]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && station) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [station, onClose]);

  if (!station) return null;

  const address = [station.address, station.postcode].filter(Boolean).join(", ");
  const totalConnectors =
    Array.isArray(station.connectors) && station.connectors.length
      ? station.connectors.reduce(
          (s, c: any) => s + Number(c.count ?? c.quantity ?? 1),
          0
        )
      : 0;

  const handleSubmit = async () => {
    if (!vote) return;
    setIsSubmitting(true);
    try {
      await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stationId: station.id,
          vote,
          comment,
          type: "station",
        }),
      }).catch(() => {});
      await onFeedbackSubmit?.(station.id, vote as "good" | "bad", comment);
      setVote(null);
      setComment("");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDirections = () => {
    const q = encodeURIComponent(station.name ?? "");
    window.open(
      `https://www.google.com/maps/dir/?api=1&destination=${station.lat},${station.lng}&destination_name=${q}`,
      "_blank",
      "noopener,noreferrer"
    );
  };

  return createPortal(
    <div className="station-drawer-layer">
      <div className="drawer-dim lg:hidden" />
      <div ref={panelRef} className="drawer-card" role="dialog">
        <div className="drawer-header">
          <div className="drawer-title">
            <div className="name">{station.name}</div>
            {address && <div className="address">{address}</div>}
          </div>
          <button ref={closeRef} onClick={onClose} className="close">
            ✕
          </button>
        </div>

        <div className="drawer-body">
          <div className="card">
            <div className="row">
              <span className="label">Connectors:</span> {totalConnectors}
            </div>
          </div>

          <div className="actions">
            <button className="btn primary" onClick={handleDirections}>
              ⤴ Directions
            </button>
            <button className="btn" onClick={() => { setVote(null); setComment(""); }}>
              Clear
            </button>
          </div>

          <div className="card">
            <div className="row head">Rate this location</div>
            <div className="vote">
              <button
                onClick={() => setVote("good")}
                className={`chip ${vote === "good" ? "chip-on-good" : ""}`}
              >
                👍 Good
              </button>
              <button
                onClick={() => setVote("bad")}
                className={`chip ${vote === "bad" ? "chip-on-bad" : ""}`}
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

      <style jsx>{`
        .station-drawer-layer {
          position: fixed;
          inset: 0;
          z-index: 9999;
          pointer-events: none;
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
          bottom: 16px;
          right: 16px;
          width: 360px;
          background: #fff;
          border-radius: 14px;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.12);
          border: 1px solid #e5e7eb;
          overflow: hidden;
        }
        @media (max-width: 1023px) {
          .drawer-card {
            left: 0;
            right: 0;
            bottom: 0;
            width: auto;
            border-radius: 14px 14px 0 0;
          }
        }
        .drawer-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 10px 12px;
          border-bottom: 1px solid #e5e7eb;
        }
        .name {
          font-weight: 600;
          color: #111827;
        }
        .address {
          font-size: 12px;
          color: #6b7280;
        }
        .drawer-body {
          padding: 10px;
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
        .label {
          font-weight: 600;
          margin-right: 4px;
        }
        .actions {
          display: flex;
          gap: 8px;
        }
        .btn {
          border: 1px solid #d1d5db;
          border-radius: 8px;
          padding: 8px 10px;
          font-size: 14px;
        }
        .btn.primary {
          background: #2563eb;
          color: #fff;
        }
        .btn.dark {
          background: #111827;
          color: #fff;
        }
        .vote {
          display: flex;
          gap: 8px;
          margin-top: 8px;
        }
        .chip {
          flex: 1;
          border: 1px solid #d1d5db;
          border-radius: 999px;
          padding: 6px;
          text-align: center;
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
          margin-top: 6px;
        }
      `}</style>
    </div>,
    document.body
  );
};

export default StationDrawer;
