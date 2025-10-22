// components/StationDrawer.tsx
import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Station, Connector } from "../types/stations";

type Vote = "good" | "bad" | null;

/** The map can pass two shapes into the drawer:
 *  - regular OCM station: connectors = Connector[]
 *  - council marker:      connectors = number and isCouncil = true
 */
type AnyStation = Station & {
  connectors?: number | Array<Connector & { count?: number }>;
  isCouncil?: boolean;
  network?: string;
};

export interface StationDrawerProps {
  station: AnyStation | null;
  onClose: () => void;
  onFeedbackSubmit?: (stationId: string | number, vote: "good" | "bad", comment: string) => void;
  userLocation?: { lat: number; lng: number } | null;
}

/* helpers (local only) */
function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}
function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

function qty(c: Connector & { count?: number }) {
  // tolerate both quantity (your type) and count (some feeds)
  return (typeof c.quantity === "number" ? c.quantity : undefined) ??
         (typeof c.count === "number" ? c.count : undefined) ??
         1;
}

function getConnectorTotal(conn: AnyStation["connectors"]): number {
  if (!conn && conn !== 0) return 0;
  if (typeof conn === "number") return conn;
  if (Array.isArray(conn)) return conn.reduce((sum, c) => sum + qty(c), 0);
  return 0;
}

export default function StationDrawer({
  station,
  onClose,
  onFeedbackSubmit,
  userLocation,
}: StationDrawerProps) {
  const [vote, setVote] = useState<Vote>(null);
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copied, setCopied] = useState<"addr" | "pc" | null>(null);

  const cardRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // reset per station, focus close for a11y
  useEffect(() => {
    if (!station) return;
    setVote(null);
    setComment("");
    setIsSubmitting(false);
    setTimeout(() => closeRef.current?.focus(), 60);
  }, [station]);

  // close on ESC
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && station) onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [station, onClose]);

  if (!station) return null;

  const totalConnectors = getConnectorTotal(station.connectors);
  const addressLine = station.address;
  const postcode = station.postcode;
  const distanceKm =
    userLocation
      ? haversineKm(
          { lat: station.lat, lng: station.lng },
          { lat: userLocation.lat, lng: userLocation.lng }
        )
      : null;

  const handleDirections = () => {
    const base = "https://www.google.com/maps/dir/?api=1";
    const dest = `&destination=${station.lat},${station.lng}`;
    const name = station.name ? `&destination_place_id=&travelmode=driving&destination_name=${encodeURIComponent(station.name)}` : "";
    const origin = userLocation ? `&origin=${userLocation.lat},${userLocation.lng}` : "";
    window.open(`${base}${origin}${dest}${name}`, "_blank", "noopener,noreferrer");
  };

  const copy = async (text: string, which: "addr" | "pc") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(null), 1200);
    } catch {}
  };

  const submitFeedback = async () => {
    if (!vote) return;
    try {
      setIsSubmitting(true);
      onFeedbackSubmit?.(station.id, vote, comment.trim());
      setVote(null);
      setComment("");
    } finally {
      setIsSubmitting(false);
    }
  };

  const isCouncil = !!station.isCouncil;
  const hasArrayConnectors = Array.isArray(station.connectors);

  const card = (
    <>
      <div className="sd-backdrop" aria-hidden="true" />
      <div ref={cardRef} className="sd-card" role="dialog" aria-modal="false" aria-label="Station details">
        {/* header */}
        <div className="sd-head">
          <div className="sd-title">
            <div className="sd-name" title={station.name}>{station.name || "Charging station"}</div>
            <div className="sd-sub">
              {distanceKm !== null && (
                <span className="sd-distance">
                  {distanceKm < 1 ? `${Math.round(distanceKm * 1000)} m` : `${distanceKm.toFixed(1)} km`}
                </span>
              )}
              {isCouncil && <span className="sd-badge">Council data</span>}
              {station.network && <span className="sd-badge sd-net">{station.network}</span>}
            </div>
          </div>
          <button ref={closeRef} className="sd-iconbtn" onClick={onClose} aria-label="Close">×</button>
        </div>

        {/* address */}
        {(addressLine || postcode) && (
          <div className="sd-block sd-addr">
            {addressLine && (
              <div className="sd-row">
                <span className="sd-label">Address:</span>
                <span className="sd-value" title={addressLine}>{addressLine}</span>
                <button className="sd-mini" onClick={() => copy(addressLine, "addr")}>
                  {copied === "addr" ? "✓" : "Copy"}
                </button>
              </div>
            )}
            {postcode && (
              <div className="sd-row">
                <span className="sd-label">Postcode:</span>
                <span className="sd-value">{postcode}</span>
                <button className="sd-mini" onClick={() => copy(postcode, "pc")}>
                  {copied === "pc" ? "✓" : "Copy"}
                </button>
              </div>
            )}
          </div>
        )}

        {/* connectors */}
        <div className="sd-block">
          <div className="sd-row">
            <span className="sd-label">Connectors:</span>
            <span className="sd-value">{totalConnectors}</span>
          </div>

          {/* full breakdown when we have an array (OCM) */}
          {hasArrayConnectors && (station.connectors as Array<Connector & { count?: number }>).length > 0 && (
            <div className="sd-connlist">
              {(station.connectors as Array<Connector & { count?: number }>).slice(0, 6).map((c, i) => (
                <div key={`${c.type}-${i}`} className="sd-chip" title={`${c.type}${c.powerKW ? ` • ${c.powerKW}kW` : ""}`}>
                  <span className="sd-chip-type">{c.type}</span>
                  <span className="sd-dot">•</span>
                  <span className="sd-chip-qty">×{qty(c)}</span>
                  {typeof c.powerKW === "number" && (
                    <>
                      <span className="sd-dot">•</span>
                      <span className="sd-chip-kw">{clamp(c.powerKW, 1, 999)}kW</span>
                    </>
                  )}
                </div>
              ))}
              {(station.connectors as Array<any>).length > 6 && (
                <div className="sd-chip sd-more">+{(station.connectors as Array<any>).length - 6} more</div>
              )}
            </div>
          )}

          {/* small note for council items (count only) */}
          {isCouncil && !hasArrayConnectors && (
            <p className="sd-note">
              This marker comes from council-provided data. Detailed connector types may be unavailable.
            </p>
          )}
        </div>

        {/* actions */}
        <div className="sd-actions">
          <button className="sd-primary" onClick={handleDirections}>🧭 Directions</button>
          <button className="sd-outline" onClick={onClose}>Clear</button>
        </div>

        {/* feedback */}
        <div className="sd-block">
          <div className="sd-row sd-row-top">
            <span className="sd-label">Rate this location</span>
          </div>

          <div className="sd-votes">
            <button
              className={`sd-pill ${vote === "good" ? "is-on" : ""}`}
              onClick={() => setVote("good")}
              aria-pressed={vote === "good"}
            >
              <span>👍</span> Good
            </button>
            <button
              className={`sd-pill ${vote === "bad" ? "is-on" : ""}`}
              onClick={() => setVote("bad")}
              aria-pressed={vote === "bad"}
            >
              <span>👎</span> Bad
            </button>
          </div>

          <div className="sd-ta-wrap">
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value.slice(0, 280))}
              rows={3}
              placeholder="Optional comment… (max 280 chars)"
            />
          </div>

          <button
            className="sd-submit"
            disabled={!vote || isSubmitting}
            onClick={submitFeedback}
            title={!vote ? "Select Good or Bad" : "Submit feedback"}
          >
            {isSubmitting ? "Submitting…" : "Submit feedback"}
          </button>
        </div>
      </div>

      <style jsx>{`
        .sd-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.25); z-index: 9998; display: none; }
        .sd-card {
          position: fixed; right: 16px; bottom: 16px;
          width: 360px; max-height: calc(100vh - 32px); overflow: auto;
          background: #fff; border-radius: 14px; box-shadow: 0 12px 30px rgba(0,0,0,0.18);
          z-index: 9999; padding: 12px 12px 14px; border: 1px solid #e5e7eb;
        }
        .sd-head { display: flex; align-items: start; justify-content: space-between; gap: 8px; padding: 6px 4px 8px; border-bottom: 1px solid #f1f5f9; }
        .sd-title { display: grid; gap: 2px; min-width: 0; }
        .sd-name { font-weight: 600; color: #0f172a; font-size: 15px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 280px; }
        .sd-sub { display: flex; gap: 6px; align-items: center; }
        .sd-distance { font-size: 12px; color: #64748b; }
        .sd-badge { font-size: 11px; padding: 2px 6px; border-radius: 999px; background: #eef2ff; color: #3730a3; border: 1px solid #e0e7ff; }
        .sd-badge.sd-net { background: #ecfeff; color: #155e75; border-color: #cffafe; }
        .sd-iconbtn { border: 1px solid #e5e7eb; background: #fff; width: 28px; height: 28px; border-radius: 8px; font-size: 18px; line-height: 24px; color: #475569; }
        .sd-iconbtn:hover { background: #f8fafc; }
        .sd-block { margin-top: 10px; padding: 10px; border: 1px solid #eef2f7; border-radius: 10px; background: #fff; }
        .sd-addr .sd-row + .sd-row { margin-top: 6px; }
        .sd-row { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 8px; min-height: 22px; }
        .sd-row-top { grid-template-columns: 1fr; }
        .sd-label { font-size: 12px; color: #6b7280; }
        .sd-value { font-size: 13px; color: #111827; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .sd-mini { font-size: 11px; padding: 4px 8px; border-radius: 999px; border: 1px solid #e5e7eb; background: #fff; color: #334155; }
        .sd-mini:hover { background: #f8fafc; }
        .sd-connlist { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
        .sd-chip { display: inline-flex; align-items: center; gap: 6px; padding: 4px 8px; border: 1px solid #e5e7eb; border-radius: 999px; font-size: 12px; color: #334155; background: #fafafa; }
        .sd-chip-kw { color: #0ea5e9; }
        .sd-chip-type { font-weight: 600; color: #1f2937; }
        .sd-dot { color: #cbd5e1; }
        .sd-more { background: #f1f5f9; color: #475569; }
        .sd-note { margin-top: 8px; font-size: 12px; color: #6b7280; }
        .sd-actions { margin-top: 10px; display: flex; gap: 8px; }
        .sd-primary { flex: 1; background: #2563eb; color: #fff; border-radius: 10px; padding: 8px 10px; border: none; font-weight: 600; }
        .sd-primary:hover { background: #1d4ed8; }
        .sd-outline { padding: 8px 10px; border-radius: 10px; border: 1px solid #e5e7eb; background: #fff; color: #334155; font-weight: 600; }
        .sd-outline:hover { background: #f8fafc; }
        .sd-votes { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 8px; }
        .sd-pill { display: flex; align-items: center; justify-content: center; gap: 8px; border: 1px solid #e5e7eb; padding: 8px 10px; border-radius: 999px; font-weight: 600; background: #fff; color: #334155; }
        .sd-pill.is-on { border-color: #059669; background: #ecfdf5; color: #065f46; }
        .sd-pill:nth-child(2).is-on { border-color: #dc2626; background: #fef2f2; color: #991b1b; }
        .sd-ta-wrap { margin-top: 8px; }
        .sd-ta-wrap textarea { width: 100%; border: 1px solid #e5e7eb; border-radius: 10px; padding: 8px 10px; font-size: 13px; resize: vertical; min-height: 72px; background: #fff; color: #111827; }
        .sd-submit { margin-top: 10px; width: 100%; border: none; border-radius: 10px; background: #111827; color: #fff; padding: 9px 12px; font-weight: 600; }
        .sd-submit:disabled { opacity: .55; cursor: not-allowed; }
        @media (max-width: 768px) {
          .sd-backdrop { display: block; }
          .sd-card { right: 8px; left: 8px; width: auto; bottom: 8px; max-height: 65vh; }
        }
      `}</style>
    </>
  );

  return createPortal(card, document.body);
}
