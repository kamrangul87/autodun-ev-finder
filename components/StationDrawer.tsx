import { useEffect, useRef, useCallback, useMemo, useState } from "react";
import type { Station, Connector } from "../types/stations";
import { aggregateToCanonical, normalizeConnectorLabel } from "../lib/connectorCatalog";

// Small helpers
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const isNonEmpty = (s?: string | null) => typeof s === "string" && s.trim().length > 0;

/** OpenCharge -> canonical label via ID/title */
function ocConnectionToLabel(conn: any): "CCS" | "CHAdeMO" | "Type 2" | null {
  // 1) Prefer explicit title if present
  const title: string | undefined = conn?.ConnectionType?.Title || conn?.ConnectionTypeTitle;
  const fromTitle = normalizeConnectorLabel(title || "");
  if (fromTitle) return fromTitle;

  // 2) Fallback to ID mapping (common IDs in OpenChargeMap)
  const id: number | undefined = typeof conn?.ConnectionTypeID === "number" ? conn.ConnectionTypeID : undefined;
  switch (id) {
    case 33: // CCS (Combo Type 2)
    case 32: // CCS (Combo Type 1)
      return "CCS";
    case 2: // CHAdeMO
      return "CHAdeMO";
    case 25: // Type 2 (Mennekes)
    case 30: // Tesla (Type 2) – treat as Type 2 for our UI buckets
      return "Type 2";
    default:
      return null;
  }
}

/** Extract connectors from various shapes the station might have */
function deriveConnectors(station?: any): Array<{ type?: string; quantity?: number }> {
  if (!station) return [];

  // 1) If your pipeline already normalized into `connectors`
  if (Array.isArray(station.connectors) && station.connectors.length > 0) {
    return station.connectors as Array<{ type?: string; quantity?: number }>;
  }

  // 2) Fallback: try OpenCharge `Connections`
  const oc = station.Connections || station.connections;
  if (Array.isArray(oc) && oc.length > 0) {
    return oc.map((c: any) => {
      const label = ocConnectionToLabel(c); // CCS/CHAdeMO/Type 2 | null
      const qty =
        typeof c?.Quantity === "number" && !Number.isNaN(c.Quantity) && c.Quantity > 0
          ? c.Quantity
          : 1;
      return { type: label || c?.ConnectionType?.Title || c?.ConnectionTypeTitle || "Unknown", quantity: qty };
    });
  }

  // 3) Nothing we can read
  return [];
}

type DrawerProps = {
  station: Station | null;
  onClose: () => void;
  onFeedbackSubmit?: (stationId: number | string, vote: "good" | "bad" | null, comment?: string) => void;
};

export default function StationDrawer({ station, onClose, onFeedbackSubmit }: DrawerProps) {
  const backdropRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const [vote, setVote] = useState<"good" | "bad" | null>(null);
  const [comment, setComment] = useState("");

  // Reset transient state when switching stations
  useEffect(() => {
    setVote(null);
    setComment("");
  }, [station?.id]);

  // Focus trap + close on ESC + click outside
  useEffect(() => {
    if (!station) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        // Simple focus trap
        const focusables = panelRef.current?.querySelectorAll<HTMLElement>(
          'button, [href], input, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (!focusables || focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement as HTMLElement | null;
        if (e.shiftKey && active === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    const onClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (panelRef.current && !panelRef.current.contains(target)) {
        onClose();
      }
    };

    document.addEventListener("keydown", onKey);
    backdropRef.current?.addEventListener("mousedown", onClickOutside);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey);
      backdropRef.current?.removeEventListener("mousedown", onClickOutside);
      document.body.style.overflow = "";
    };
  }, [station, onClose]);

  // Derived fields — robust across council vs normal
  const title =
    station?.name ||
    (station as any)?.AddressInfo?.Title ||
    (station as any)?.title ||
    "Unknown location";

  const address =
    station?.address ||
    (station as any)?.AddressInfo?.AddressLine1 ||
    (station as any)?.AddressInfo?.Title ||
    (station as any)?.address ||
    "—";

  const postcode =
    station?.postcode ||
    (station as any)?.AddressInfo?.Postcode ||
    (station as any)?.AddressInfo?.PostCode ||
    (station as any)?.Postcode ||
    (station as any)?.postCode ||
    (station as any)?.zip ||
    "";

  const isCouncil = Boolean((station as any)?.isCouncil);

  // Build a normalized/aggregated connector list
  const canonical = useMemo(() => {
    const raw = deriveConnectors(station);
    const agg = aggregateToCanonical(raw);
    return agg; // [{label: "Type 2" | "CCS" | "CHAdeMO", quantity: number}, ...]
  }, [station]);

  const totalConnectors = useMemo(
    () => canonical.reduce((s, c) => s + (typeof c.quantity === "number" ? c.quantity : 1), 0),
    [canonical]
  );

  const perTypeLines = useMemo(
    () => canonical.map((c) => `${c.label} × ${c.quantity}`),
    [canonical]
  );

  const handleSubmit = useCallback(() => {
    if (!station) return;
    onFeedbackSubmit?.(station.id, vote, comment.trim() || undefined);
  }, [station, vote, comment, onFeedbackSubmit]);

  if (!station) return null;

  return (
    <div
      ref={backdropRef}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2000,
        background: "transparent",
      }}
    >
      {/* Floating panel (right) */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        style={{
          position: "absolute",
          top: 16,
          right: 16,
          bottom: 16,
          width: clamp(360, 360, 420),
          maxWidth: "92vw",
          background: "#fff",
          borderRadius: 14,
          boxShadow:
            "0 10px 20px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.08)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "14px 16px",
            borderBottom: "1px solid #f1f5f9",
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 16, lineHeight: 1.2, flex: 1 }}>
            {title}
          </div>
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
            style={{
              border: 0,
              background: "transparent",
              padding: 6,
              borderRadius: 8,
              cursor: "pointer",
            }}
          >
            ✕
          </button>
        </div>

        {/* Body (scroll) */}
        <div style={{ padding: 16, overflowY: "auto" }}>
          {/* Address */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 4 }}>
              Address:
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              <div style={{ fontSize: 14, color: "#111827" }}>
                {address}
                {isNonEmpty(postcode) ? `, ${postcode}` : ""}
              </div>
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(
                    isNonEmpty(postcode) ? `${address}, ${postcode}` : address
                  );
                }}
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

          {/* Connectors */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 6 }}>
              Connectors:{" "}
              <span style={{ color: "#111827", fontWeight: 600 }}>
                {totalConnectors > 0 ? totalConnectors : "Unknown"}
              </span>
            </div>

            {perTypeLines.length > 0 ? (
              <div
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: 10,
                  padding: 10,
                  display: "grid",
                  rowGap: 6,
                }}
              >
                {perTypeLines.map((line) => (
                  <div key={line} style={{ fontSize: 14, color: "#111827" }}>
                    • {line}
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

          {/* Actions */}
          <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
            <a
              href={
                isNonEmpty(postcode)
                  ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
                      `${address}, ${postcode}`
                    )}`
                  : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
                      address
                    )}`
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
              onClick={() => {
                navigator.clipboard?.writeText(
                  isNonEmpty(postcode) ? `${address}, ${postcode}` : address
                );
              }}
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

          {/* Rating */}
          <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 8 }}>
            Rate this location
          </div>
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
              disabled={isCouncil} // keep feedback disabled for council
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

          {/* Comment box */}
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
            disabled={isCouncil} // disabled for council as before
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
