// components/StationDrawer.tsx
import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Station as StationType } from "../types/stations";

type Vote = "good" | "bad" | null;

type Station = StationType & {
  // runtime flag from CouncilMarkerLayer
  isCouncil?: boolean;
};

interface Props {
  station: Station | null;
  onClose: () => void;
  onFeedbackSubmit?: (stationId: number | string, vote: "good" | "bad", comment: string) => void;
}

function sumConnectors(connectors: Station["connectors"]): number {
  if (!Array.isArray(connectors)) return 0;
  return connectors.reduce(
    (sum, c: any) => sum + (typeof c?.quantity === "number" ? c.quantity : 1),
    0
  );
}

function openDirections(station: Station) {
  const qName = encodeURIComponent(station.name ?? "");
  const url = `https://www.google.com/maps/dir/?api=1&destination=${station.lat},${station.lng}&destination_name=${qName}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

const badgeStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "2px 8px",
  borderRadius: 999,
  background: "rgba(147,51,234,0.10)",
  color: "#6b21a8",
  fontSize: 12,
  fontWeight: 600,
  border: "1px solid rgba(147,51,234,0.25)",
};

export default function StationDrawer({ station, onClose, onFeedbackSubmit }: Props) {
  const [vote, setVote] = useState<Vote>(null);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!station) return;
    setVote(null);
    setComment("");
    setSubmitting(false);
    const t = setTimeout(() => closeBtnRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, [station]);

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && station) onClose();
    };
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [station, onClose]);

  if (!station) return null;

  const total = sumConnectors(station.connectors);
  const fullAddress = [station.address, station.postcode].filter(Boolean).join(", ");
  const isCouncil = !!station.isCouncil;

  const copy = async (text: string) => {
    try {
      await navigator.clipboard?.writeText(text);
    } catch {}
  };

  const submit = async () => {
    if (!vote) return;
    try {
      setSubmitting(true);
      onFeedbackSubmit?.(station.id, vote, comment.trim());
      setVote(null);
      setComment("");
    } finally {
      setSubmitting(false);
    }
  };

  const node = (
    <>
      {/* backdrop only on small screens */}
      <div
        className="sd-backdrop"
        aria-hidden
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.25)",
          zIndex: 9998,
          display: "none",
        }}
      />
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Station details"
        style={{
          position: "fixed",
          right: 16,
          top: 92,
          width: 360,
          maxWidth: "92vw",
          borderRadius: 14,
          background: "#fff",
          boxShadow: "0 12px 32px rgba(0,0,0,0.18)",
          zIndex: 9999,
          overflow: "hidden",
          border: "1px solid #e5e7eb",
        }}
      >
        {/* header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            padding: "12px 14px",
            borderBottom: "1px solid #f0f1f3",
            gap: 10,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              title={station.name}
              style={{
                fontWeight: 700,
                color: "#111827",
                fontSize: 16,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {station.name || "Charging station"}
            </div>
            {fullAddress && (
              <div
                title={fullAddress}
                style={{
                  marginTop: 2,
                  fontSize: 12,
                  color: "#6b7280",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {fullAddress}
              </div>
            )}
          </div>
          {isCouncil && <span style={badgeStyle}>Council dataset</span>}
          <button
            ref={closeBtnRef}
            onClick={onClose}
            aria-label="Close"
            style={{
              border: 0,
              background: "transparent",
              width: 32,
              height: 32,
              borderRadius: 8,
              color: "#6b7280",
              cursor: "pointer",
            }}
            onMouseOver={(e) => (e.currentTarget.style.background = "#f3f4f6")}
            onMouseOut={(e) => (e.currentTarget.style.background = "transparent")}
          >
            ✕
          </button>
        </div>

        {/* content */}
        <div style={{ padding: 14, display: "grid", gap: 12 }}>
          {/* address row with copy chips */}
          {!!station.address && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "auto 1fr auto",
                gap: 8,
                alignItems: "center",
                fontSize: 13,
              }}
            >
              <span style={{ color: "#6b7280" }}>Address:</span>
              <span style={{ color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {station.address}
              </span>
              <button
                onClick={() => copy(station.address!)}
                style={{
                  fontSize: 12,
                  padding: "4px 8px",
                  borderRadius: 999,
                  border: "1px solid #e5e7eb",
                  background: "#fff",
                  cursor: "pointer",
                }}
              >
                Copy
              </button>
            </div>
          )}

          {!!station.postcode && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "auto 1fr auto",
                gap: 8,
                alignItems: "center",
                fontSize: 13,
              }}
            >
              <span style={{ color: "#6b7280" }}>Postcode:</span>
              <span style={{ color: "#111827" }}>{station.postcode}</span>
              <button
                onClick={() => copy(station.postcode!)}
                style={{
                  fontSize: 12,
                  padding: "4px 8px",
                  borderRadius: 999,
                  border: "1px solid #e5e7eb",
                  background: "#fff",
                  cursor: "pointer",
                }}
              >
                Copy
              </button>
            </div>
          )}

          {/* connectors */}
          <div
            style={{
              padding: 10,
              border: "1px solid #e5e7eb",
              borderRadius: 10,
              background: "#fafafa",
              fontSize: 13,
            }}
          >
            <div style={{ color: "#374151", marginBottom: 6 }}>
              <strong>Connectors:</strong> {total}
            </div>
            {Array.isArray(station.connectors) && station.connectors.length > 0 && (
              <ul style={{ margin: 0, paddingLeft: 16, color: "#4b5563" }}>
                {station.connectors.map((c: any, i: number) => (
                  <li key={i}>
                    {c?.type || "Unknown"}
                    {typeof c?.powerKW === "number" ? ` · ${c.powerKW}kW` : ""}
                    {typeof c?.quantity === "number" ? ` × ${c.quantity}` : ""}
                  </li>
                ))}
              </ul>
            )}
            {isCouncil && (
              <div style={{ marginTop: 8, fontSize: 12, color: "#6b7280" }}>
                Council feed may not include per-connector details.
              </div>
            )}
          </div>

          {/* actions */}
          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={() => openDirections(station)}
              style={{
                flex: 1,
                height: 40,
                borderRadius: 10,
                border: "1px solid #2563eb",
                background: "#2563eb",
                color: "white",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              ➤ Directions
            </button>
            <button
              onClick={() => copy(fullAddress || station.name || "")}
              style={{
                width: 80,
                height: 40,
                borderRadius: 10,
                border: "1px solid #e5e7eb",
                background: "#fff",
                color: "#374151",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Copy
            </button>
          </div>

          {/* feedback (hide for council) */}
          {!isCouncil && (
            <div
              style={{
                paddingTop: 6,
                borderTop: "1px dashed #e5e7eb",
                display: "grid",
                gap: 10,
              }}
            >
              <div style={{ fontSize: 13, color: "#374151", fontWeight: 600 }}>
                Rate this location
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  aria-pressed={vote === "good"}
                  onClick={() => setVote("good")}
                  style={{
                    flex: 1,
                    height: 36,
                    borderRadius: 999,
                    border: `1px solid ${vote === "good" ? "#059669" : "#e5e7eb"}`,
                    background: vote === "good" ? "#ecfdf5" : "#fff",
                    color: vote === "good" ? "#065f46" : "#374151",
                    cursor: "pointer",
                  }}
                >
                  👍 Good
                </button>
                <button
                  aria-pressed={vote === "bad"}
                  onClick={() => setVote("bad")}
                  style={{
                    flex: 1,
                    height: 36,
                    borderRadius: 999,
                    border: `1px solid ${vote === "bad" ? "#dc2626" : "#e5e7eb"}`,
                    background: vote === "bad" ? "#fef2f2" : "#fff",
                    color: vote === "bad" ? "#991b1b" : "#374151",
                    cursor: "pointer",
                  }}
                >
                  👎 Bad
                </button>
              </div>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value.slice(0, 280))}
                rows={3}
                placeholder="Optional comment…"
                style={{
                  width: "100%",
                  padding: 10,
                  borderRadius: 10,
                  border: "1px solid #e5e7eb",
                  outline: "none",
                  fontSize: 13,
                }}
              />
              <button
                onClick={submit}
                disabled={!vote || submitting}
                style={{
                  height: 40,
                  borderRadius: 10,
                  border: "1px solid #111827",
                  background: "#111827",
                  color: "white",
                  fontWeight: 700,
                  cursor: !vote || submitting ? "not-allowed" : "pointer",
                  opacity: !vote || submitting ? 0.6 : 1,
                }}
              >
                {submitting ? "Submitting…" : "Submit feedback"}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* mobile tweaks: show backdrop under 768px */}
      <style>{`
        @media (max-width: 768px) {
          .sd-backdrop { display: block; }
        }
      `}</style>
    </>
  );

  return createPortal(node, document.body);
}
