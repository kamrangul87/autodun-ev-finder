// components/StationDrawer.tsx
import { useEffect, useRef, useMemo } from "react";
import type { CSSProperties } from "react";
import { telemetry } from "../utils/telemetry";
import type { Station, Connector } from "../types/stations";

/* ------------------------------------------------------------------ */
/* Body scroll lock + keyboard/focus handling                          */
/* ------------------------------------------------------------------ */
function useBodyScrollLock(locked: boolean) {
  useEffect(() => {
    const body = typeof document !== "undefined" ? document.body : null;
    if (!body) return;
    const prev = body.style.overflow;
    if (locked) body.style.overflow = "hidden";
    return () => {
      body.style.overflow = prev;
    };
  }, [locked]);
}

function useEscapeToClose(open: boolean, onClose?: () => void) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
}

function useFocusTrap(enabled: boolean, containerRef: React.RefObject<HTMLElement>) {
  useEffect(() => {
    if (!enabled || !containerRef.current) return;
    const el = containerRef.current;

    const focusable = el.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const first = focusable[0] || el;
    const prevActive = document.activeElement as HTMLElement | null;

    const raf = requestAnimationFrame(() => first.focus({ preventScroll: true }));

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const list = Array.from(
        el.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
      );
      if (!list.length) return;

      const current = document.activeElement as HTMLElement | null;
      if (!el.contains(current)) {
        (e.shiftKey ? list[list.length - 1] : list[0]).focus({ preventScroll: true });
        e.preventDefault();
        return;
      }

      const idx = Math.max(0, list.indexOf(current!));
      const nextIdx = e.shiftKey ? (idx - 1 + list.length) % list.length : (idx + 1) % list.length;

      if ((e.shiftKey && idx === 0) || (!e.shiftKey && idx === list.length - 1)) {
        list[nextIdx].focus({ preventScroll: true });
        e.preventDefault();
      }
    };

    document.addEventListener("keydown", onKey, { capture: true });
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKey, { capture: true } as any);
      prevActive?.focus?.();
    };
  }, [enabled, containerRef]);
}

/* ------------------------------------------------------------------ */
/* Normalization helpers                                               */
/* ------------------------------------------------------------------ */

// Normalize into your Connector[] shape regardless of source.
function normalizeConnectors(station: any): Connector[] | null {
  // 1) Already normalized (your app shape)
  if (Array.isArray(station?.connectors) && station.connectors.length) {
    // coerce values safely
    return station.connectors.map((c: any) => ({
      type: c?.type ?? "Unknown",
      quantity:
        typeof c?.quantity === "number" && !Number.isNaN(c.quantity) ? c.quantity : 1,
      powerKW: typeof c?.powerKW === "number" ? c.powerKW : undefined,
    }));
  }

  // 2) OpenChargeMap shape: Connections[]
  if (Array.isArray(station?.Connections) && station.Connections.length) {
    return station.Connections.map((c: any) => ({
      type:
        c?.ConnectionType?.Title ??
        c?.Level?.Title ??
        c?.ConnectionType?.FormalName ??
        "Unknown",
      quantity: typeof c?.Quantity === "number" && c.Quantity > 0 ? c.Quantity : 1,
      powerKW: typeof c?.PowerKW === "number" ? c.PowerKW : undefined,
    }));
  }

  // 3) Council dataset: NumberOfPoints (no breakdown)
  if (typeof station?.NumberOfPoints === "number" && station.NumberOfPoints > 0) {
    return [
      {
        type: "Unknown",
        quantity: station.NumberOfPoints,
      },
    ];
  }

  // 4) Nothing we can use
  return null;
}

function sumConnectors(connectors: Connector[] | null): number | null {
  if (!Array.isArray(connectors) || connectors.length === 0) return null;
  let total = 0;
  for (const c of connectors) {
    const q = typeof c?.quantity === "number" && !Number.isNaN(c.quantity) ? c.quantity : 0;
    total += q;
  }
  return total > 0 ? total : null;
}

function prettyConnectorLines(connectors: Connector[] | null): string[] {
  if (!Array.isArray(connectors) || connectors.length === 0) return ["Unknown × 1"];
  return connectors.map((c) => {
    const t = c?.type ? String(c.type) : "Unknown";
    const q = typeof c?.quantity === "number" && !Number.isNaN(c.quantity) ? c.quantity : 1;
    return `${t} × ${q}`;
  });
}

/* ------------------------------------------------------------------ */
/* Props & Component                                                   */
/* ------------------------------------------------------------------ */
type Props = {
  station: Station | null; // null => closed
  onClose?: () => void;
  onFeedbackSubmit?: (stationId: number | string, vote: "up" | "down", comment?: string) => void;
};

export default function StationDrawer({ station, onClose, onFeedbackSubmit }: Props) {
  const open = Boolean(station);
  const containerRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  // Hardened UX
  useBodyScrollLock(open);
  useEscapeToClose(open, onClose);
  useFocusTrap(open, cardRef);

  // Outside click close
  useEffect(() => {
    if (!open) return;
    const overlay = containerRef.current;
    const handler = (e: PointerEvent) => {
      const card = cardRef.current;
      if (card && !card.contains(e.target as Node)) onClose?.();
    };
    overlay?.addEventListener("pointerdown", handler);
    return () => overlay?.removeEventListener("pointerdown", handler);
  }, [open, onClose]);

  // Debounced telemetry
  useEffect(() => {
    if (!open || !station) return;
    const id = window.setTimeout(() => {
      telemetry.drawerOpen((station as any).id, Boolean((station as any).isCouncil));
    }, 60);
    return () => window.clearTimeout(id);
  }, [open, station]);

  /* ---------- Derived display fields (safe across feeds) ---------- */
  const title = station?.name || "Unknown location";

  const address =
    (station as any)?.address ??
    (station as any)?.AddressInfo?.AddressLine1 ??
    "—";

  const postcode =
    (station as any)?.postcode ??
    (station as any)?.AddressInfo?.Postcode ??
    "—";

  // Normalize town from both shapes
  const town =
    (station as any)?.town ??
    (station as any)?.AddressInfo?.Town ??
    undefined;

  const isCouncil = Boolean((station as any)?.isCouncil);

  // Fully normalized connectors used for total + per-type lines
  const connectors = useMemo(() => normalizeConnectors(station as any), [station]);
  const totalConnectorsNumOrNull = useMemo(() => {
    const s = sumConnectors(connectors);
    if (s !== null) return s;
    // last-chance: council with no details — show 1 rather than Unknown
    if (isCouncil) return 1;
    return null;
  }, [connectors, isCouncil]);

  const totalConnectorsLabel =
    totalConnectorsNumOrNull !== null ? String(totalConnectorsNumOrNull) : "Unknown";
  const perLines = useMemo(() => prettyConnectorLines(connectors), [connectors]);

  if (!open) return null;

  return (
    <div
      ref={containerRef}
      aria-hidden={!open}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        background: "transparent",
        display: "flex",
        justifyContent: "flex-end",
      }}
    >
      {/* Compact drawer card */}
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{
          width: "min(328px, 88vw)",     // narrower
          height: "100%",
          background: "#fff",
          boxShadow:
            "0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05)",
          borderLeft: "1px solid rgba(0,0,0,0.06)",
          display: "flex",
          flexDirection: "column",
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* Scrollable content so we don't leave big empty middle */}
        <div style={{ padding: "10px 10px 8px", overflowY: "auto" }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <h3
                  style={{
                    fontSize: 16,
                    fontWeight: 700,
                    lineHeight: 1.2,
                    margin: 0,
                    color: "#111827",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                  title={title}
                >
                  {title}
                </h3>
                {isCouncil && (
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      background: "#ede9fe",
                      color: "#6d28d9",
                      padding: "2px 6px",
                      borderRadius: 999,
                      whiteSpace: "nowrap",
                    }}
                  >
                    Council dataset
                  </span>
                )}
              </div>
              {town && (
                <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{town}</div>
              )}
            </div>

            <button
              onClick={onClose}
              aria-label="Close"
              style={{
                appearance: "none",
                border: 0,
                background: "transparent",
                width: 30,
                height: 30,
                borderRadius: 8,
                display: "grid",
                placeItems: "center",
                cursor: "pointer",
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path
                  d="M6 6l12 12M18 6L6 18"
                  stroke="#6b7280"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>

          {/* Address */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "auto 1fr auto",
              alignItems: "center",
              gap: 8,
              padding: "8px 10px",
              borderRadius: 10,
              background: "#fafafa",
              border: "1px solid #efefef",
              marginTop: 8,
            }}
          >
            <div style={{ fontWeight: 600, color: "#374151", fontSize: 12.5 }}>Address:</div>
            <div
              style={{
                color: "#111827",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                fontSize: 12.5,
              }}
              title={`${address}${postcode ? `, ${postcode}` : ""}`}
            >
              {address}
              {postcode ? `, ${postcode}` : ""}
            </div>
            <button
              onClick={() => {
                const text = `${address}${postcode ? `, ${postcode}` : ""}`;
                navigator.clipboard?.writeText(text);
              }}
              style={copyBtnStyle}
            >
              Copy
            </button>
          </div>

          {/* Connectors */}
          <div
            style={{
              padding: "8px 10px",
              borderRadius: 10,
              background: "#fafafa",
              border: "1px solid #efefef",
              display: "flex",
              flexDirection: "column",
              gap: 6,
              marginTop: 8,
            }}
          >
            <div style={{ fontWeight: 700, color: "#111827", fontSize: 13.5 }}>
              Connectors: {totalConnectorsLabel}
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, color: "#374151", fontSize: 12.5 }}>
              {perLines.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
            {isCouncil && (
              <div style={{ fontSize: 11, color: "#6b7280" }}>
                Council feed may not include per-connector details.
              </div>
            )}
          </div>

          {/* CTA row */}
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <a
              href={
                station
                  ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
                      `${(station as any).lat},${(station as any).lng}`
                    )}`
                  : "#"
              }
              target="_blank"
              rel="noreferrer"
              style={primaryBtnStyle}
            >
              ➤ Directions
            </a>

            <button
              onClick={() => {
                if (!station) return;
                const text =
                  (station as any).name ||
                  (station as any).address ||
                  (station as any).postcode ||
                  `${(station as any).lat}, ${(station as any).lng}`;
                navigator.clipboard?.writeText(String(text));
              }}
              style={secondaryBtnStyle}
            >
              Copy
            </button>
          </div>
        </div>

        {/* Footer (sticks to bottom, no extra empty space above) */}
        <div style={{ padding: "8px 10px 10px", borderTop: "1px solid #f1f1f1" }}>
          <div style={{ fontSize: 12.5, color: "#374151", marginBottom: 6 }}>
            Rate this location
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <button
              style={voteBtnStyle}
              onClick={() => station && onFeedbackSubmit?.((station as any).id, "up")}
            >
              👍 Good
            </button>
            <button
              style={voteBtnStyle}
              onClick={() => station && onFeedbackSubmit?.((station as any).id, "down")}
            >
              👎 Bad
            </button>
          </div>
          <button
            style={footerSubmitStyle}
            onClick={() => {
              if (!station) return;
              onFeedbackSubmit?.((station as any).id, "up");
            }}
          >
            Submit feedback
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ styles ------------------------------ */
const copyBtnStyle: CSSProperties = {
  appearance: "none",
  border: "1px solid #e5e7eb",
  background: "#fff",
  padding: "6px 10px",
  borderRadius: 8,
  fontSize: 12.5,
  cursor: "pointer",
};

const primaryBtnStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  appearance: "none",
  textDecoration: "none",
  border: 0,
  background: "#2563eb",
  color: "#fff",
  padding: "10px 12px",
  borderRadius: 10,
  fontWeight: 700,
  width: "100%",
  cursor: "pointer",
  boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
  fontSize: 13.5,
};

const secondaryBtnStyle: CSSProperties = {
  ...primaryBtnStyle,
  background: "#fff",
  color: "#111827",
  border: "1px solid #e5e7eb",
};

const voteBtnStyle: CSSProperties = {
  ...secondaryBtnStyle,
  padding: "9px 10px",
  fontWeight: 600,
  fontSize: 12.5,
};

const footerSubmitStyle: CSSProperties = {
  ...primaryBtnStyle,
  marginTop: 0,
};
