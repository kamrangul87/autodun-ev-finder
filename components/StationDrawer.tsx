"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import type { Station, Connector } from "../types/stations";

// ------- helpers (no UI changes) -------
const isNonEmpty = (s?: string | null) => typeof s === "string" && s.trim().length > 0;

function normalizeLabel(raw: string): "CCS" | "CHAdeMO" | "Type 2" | null {
  const t = raw.toLowerCase();
  if (t.includes("ccs") || t.includes("combo")) return "CCS";
  if (t.includes("chademo")) return "CHAdeMO";
  if (t.includes("type 2") || t.includes("mennekes")) return "Type 2";
  return null;
}

function ocConnToLabel(conn: any): "CCS" | "CHAdeMO" | "Type 2" | null {
  const title: string | undefined = conn?.ConnectionType?.Title || conn?.ConnectionTypeTitle;
  if (isNonEmpty(title)) {
    const byTitle = normalizeLabel(title!);
    if (byTitle) return byTitle;
  }
  const id: number | undefined =
    typeof conn?.ConnectionTypeID === "number" ? conn.ConnectionTypeID : undefined;
  switch (id) {
    case 33: // CCS (Combo Type 2)
    case 32: // CCS (Combo Type 1)
      return "CCS";
    case 2: // CHAdeMO
      return "CHAdeMO";
    case 25: // Type 2 (Mennekes)
    case 30: // Tesla (Type 2) → display as Type 2
      return "Type 2";
    default:
      return null;
  }
}

function deriveConnectorsForDisplay(station: any): Array<{ label: string; quantity: number }> {
  // Use normalized connectors if present
  if (Array.isArray(station?.connectors) && station.connectors.length > 0) {
    const byType: Record<string, number> = {};
    (station.connectors as Connector[]).forEach((c) => {
      const raw = (c as any)?.type || (c as any)?.label || "Unknown";
      const q =
        typeof (c as any)?.quantity === "number" && (c as any).quantity > 0 ? (c as any).quantity : 1;
      const canon = normalizeLabel(String(raw)) || (String(raw).trim() || "Unknown");
      byType[canon] = (byType[canon] || 0) + q;
    });
    return Object.entries(byType).map(([label, quantity]) => ({ label, quantity }));
  }

  // Fallback to OpenChargeMap shape
  const oc = station?.Connections || station?.connections;
  if (Array.isArray(oc) && oc.length > 0) {
    const byType: Record<string, number> = {};
    oc.forEach((conn: any) => {
      const canon = ocConnToLabel(conn) || normalizeLabel(conn?.ConnectionType?.Title || "") || "Unknown";
      const qty = typeof conn?.Quantity === "number" && conn.Quantity > 0 ? conn.Quantity : 1;
      byType[canon] = (byType[canon] || 0) + qty;
    });
    return Object.entries(byType).map(([label, quantity]) => ({ label, quantity }));
  }

  return [];
}

type Props = {
  station: Station | null;
  onClose: () => void;
  onFeedbackSubmit?: (stationId: number | string, vote: "good" | "bad" | null, comment?: string) => void;
};

export default function StationDrawer({ station, onClose, onFeedbackSubmit }: Props) {
  const backdropRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [vote, setVote] = useState<"good" | "bad" | null>(null);
  const [comment, setComment] = useState("");

  useEffect(() => {
    setVote(null);
    setComment("");
  }, [station?.id]);

  // Hardened focus/scroll/outside-click behavior
  useEffect(() => {
    if (!station) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (panelRef.current && !panelRef.current.contains(target)) onClose();
    };

    document.addEventListener("keydown", onKey);
    backdropRef.current?.addEventListener("mousedown", onDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey);
      backdropRef.current?.removeEventListener("mousedown", onDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [station, onClose]);

  if (!station) return null;

  const isCouncil = Boolean((station as any)?.isCouncil);

  const title =
    (station as any)?.name ||
    (station as any)?.AddressInfo?.Title ||
    (station as any)?.title ||
    "Unknown location";

  const address =
    (station as any)?.address ||
    (station as any)?.AddressInfo?.AddressLine1 ||
    (station as any)?.AddressInfo?.Title ||
    (station as any)?.AddressInfo?.Town ||
    (station as any)?.AddressInfo?.Place ||
    "—";

  const postcode =
    (station as any)?.postcode ||
    (station as any)?.AddressInfo?.Postcode ||
    (station as any)?.AddressInfo?.PostCode ||
    "";

  const connectors = useMemo(() => deriveConnectorsForDisplay(station), [station]);
  const total = useMemo(
    () => connectors.reduce((s, c) => s + (typeof c.quantity === "number" ? c.quantity : 1), 0),
    [connectors]
  );

  const handleSubmit = useCallback(() => {
    onFeedbackSubmit?.(station.id, vote, comment.trim() || undefined);
  }, [onFeedbackSubmit, station?.id, vote, comment]);

  return (
    <div
      ref={backdropRef}
      style={{ position: "fixed", inset: 0, zIndex: 2000, background: "transparent" }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        style={{
          position: "absolute",
          right: 16,
          top: 16,
          bottom: 16,
          width: 380,
          maxWidth: "92vw",
          background: "#fff",
          borderRadius: 12,
          boxShadow: "0 10px 20px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.08)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "14px 16px",
            borderBottom: "1px solid #f1f5f9",
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 16, lineHeight: 1.2, flex: 1 }}>{title}</div>
          {isCouncil && (
            <span
              style={{
                fontSize: 12,
                background: "#f3e8ff",
                color: "#7c3aed",
                padding: "2px 8px",
                borderRadius: 999,
                fontWeight: 600,
              }}
            >
              Council dataset
            </span>
          )}
          <button
            onClick={onClose}
            aria-label="Close"
            style={{ border: 0, background: "transparent", padding: 6, borderRadius: 8, cursor: "pointer" }}
          >
            ✕
          </button>
        </div>

        {/* body */}
        <div style={{ padding: 16, overflowY: "auto" }}>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 4 }}>Address:</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <div style={{ fontSize: 14, color: "#111827" }}>
                {address}
                {isNonEmpty(postcode) ? `, ${postcode}` : ""}
              </div>
              <button
                onClick={() =>
                  navigator.clipboard?.writeText(
                    isNonEmpty(postcode) ? `${address}, ${postcode}` : address
                  )
                }
                style={{
                  marginLeft: "auto",
                  fontSize: 12,
                  border: "1px solid #e5e7eb",
                  padding: "4px 8px",
                  borderRadius: 8,
                  background: "#fff",
                  cursor: "pointer",
                }}
              >
                Copy
              </button>
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 6 }}>
              Connectors:{" "}
              <span style={{ color: "#111827", fontWeight: 600 }}>
                {total > 0 ? total : "Unknown"}
              </span>
            </div>

            {connectors.length > 0 ? (
              <div
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: 10,
                  padding: 10,
                  display: "grid",
                  rowGap: 6,
                }}
              >
                {connectors.map((c) => (
                  <div key={c.label} style={{ fontSize: 14, color: "#111827" }}>
                    • {c.label} × {c.quantity}
                  </div>
                ))}
                {isCouncil && (
                  <div style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>
                    Council feed may not include per-connector details.
                  </div>
                )}
              </div>
            ) : (
              <div
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: 10,
                  padding: 10,
                  fontSize: 14,
                  color: "#6b7280",
                }}
              >
                Connector types not specified.
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
            <a
              href={
                isNonEmpty(postcode)
                  ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
                      `${address}, ${postcode}`
                    )}`
                  : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`
              }
              target="_blank"
              rel="noreferrer"
              style={{
                flex: 1,
                textAlign: "center",
                background: "#2563eb",
                color: "#fff",
                padding: "10px 12px",
                borderRadius: 10,
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              ➤ Directions
            </a>
            <button
              onClick={() =>
                navigator.clipboard?.writeText(
                  isNonEmpty(postcode) ? `${address}, ${postcode}` : address
                )
              }
              style={{
                width: 96,
                background: "#f8fafc",
                border: "1px solid #e5e7eb",
                borderRadius: 10,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Copy
            </button>
          </div>

          <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 8 }}>Rate this location</div>
          <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
            <button
              onClick={() => setVote((v) => (v === "good" ? null : "good"))}
              style={{
                flex: 1,
                background: vote === "good" ? "#dcfce7" : "#f8fafc",
                border: "1px solid #e5e7eb",
                borderRadius: 10,
                padding: "8px 10px",
                cursor: "pointer",
              }}
              disabled={isCouncil}
            >
              👍 Good
            </button>
            <button
              onClick={() => setVote((v) => (v === "bad" ? null : "bad"))}
              style={{
                flex: 1,
                background: vote === "bad" ? "#fee2e2" : "#f8fafc",
                border: "1px solid #e5e7eb",
                borderRadius: 10,
                padding: "8px 10px",
                cursor: "pointer",
              }}
              disabled={isCouncil}
            >
              👎 Bad
            </button>
          </div>

          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Optional comment (e.g., price, access, reliability)…"
            rows={3}
            style={{
              width: "100%",
              resize: "vertical",
              minHeight: 72,
              border: "1px solid #e5e7eb",
              borderRadius: 10,
              padding: 10,
              fontSize: 14,
              outline: "none",
              marginBottom: 12,
            }}
            disabled={isCouncil}
          />

          <button
            onClick={handleSubmit}
            disabled={!vote || isCouncil}
            style={{
              width: "100%",
              background: !vote || isCouncil ? "#e5e7eb" : "#2563eb",
              color: !vote || isCouncil ? "#6b7280" : "#fff",
              padding: "10px 12px",
              borderRadius: 10,
              fontWeight: 700,
              cursor: !vote || isCouncil ? "not-allowed" : "pointer",
            }}
          >
            Submit feedback
          </button>
        </div>
      </div>
    </div>
  );
}
