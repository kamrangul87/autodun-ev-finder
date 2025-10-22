// components/StationDrawer.tsx
import { useEffect, useRef, useMemo } from "react";
import type { CSSProperties } from "react";
import { telemetry } from "../utils/telemetry";
import type { Station, Connector } from "../types/stations";

/* ----------------------------- UX helpers ----------------------------- */
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
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
}

function useFocusTrap(enabled: boolean, containerRef: React.RefObject<HTMLElement>) {
  useEffect(() => {
    if (!enabled || !containerRef.current) return;
    const el = containerRef.current;

    const firstFocusable =
      (el.querySelector(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      ) as HTMLElement | null) || el;

    const prevActive = document.activeElement as HTMLElement | null;
    const raf = requestAnimationFrame(() => firstFocusable.focus({ preventScroll: true }));

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const nodes = Array.from(
        el.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
      );
      if (!nodes.length) return;

      const current = (document.activeElement as HTMLElement) || nodes[0];
      if (!el.contains(current)) {
        (e.shiftKey ? nodes[nodes.length - 1] : nodes[0]).focus({ preventScroll: true });
        e.preventDefault();
        return;
      }

      const i = Math.max(0, nodes.indexOf(current));
      const next = e.shiftKey ? (i - 1 + nodes.length) % nodes.length : (i + 1) % nodes.length;
      if ((e.shiftKey && i === 0) || (!e.shiftKey && i === nodes.length - 1)) {
        nodes[next].focus({ preventScroll: true });
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

/* ------------------------ Normalization helpers ----------------------- */
// → return your Connector[] shape regardless of source
function normalizeConnectors(station: any): Connector[] | null {
  // 1) Already normalized
  if (Array.isArray(station?.connectors) && station.connectors.length) {
    return station.connectors.map((c: any) => ({
      type: c?.type ?? "Unknown",
      quantity:
        typeof c?.quantity === "number" && !Number.isNaN(c.quantity) ? c.quantity : 1,
      powerKW: typeof c?.powerKW === "number" ? c.powerKW : undefined,
    }));
  }
  // 2) OpenChargeMap
  if (Array.isArray(station?.Connections) && station.Connections.length) {
    return station.Connections.map((c: any) => ({
      type:
        c?.ConnectionType?.Title ??
        c?.ConnectionType?.FormalName ??
        c?.Level?.Title ??
        "Unknown",
      quantity: typeof c?.Quantity === "number" && c.Quantity > 0 ? c.Quantity : 1,
      powerKW: typeof c?.PowerKW === "number" ? c.PowerKW : undefined,
    }));
  }
  // 3) Council feed (no per-connector detail)
  if (typeof station?.NumberOfPoints === "number" && station.NumberOfPoints > 0) {
    return [{ type: "Unknown", quantity: station.NumberOfPoints }];
  }
  // 4) If explicitly a council row with nothing else, assume 1 logical point
  if (station?.isCouncil) {
    return [{ type: "Unknown", quantity: 1 }];
  }
  return null;
}

function sumConnectors(list: Connector[] | null): number | null {
  if (!Array.isArray(list) || !list.length) return null;
  let total = 0;
  for (const c of list) {
    const q = typeof c?.quantity === "number" && !Number.isNaN(c.quantity) ? c.quantity : 0;
    total += q;
  }
  return total > 0 ? total : null;
}

/* ----------------------------- Component ----------------------------- */
type Props = {
  station: Station | null;
  onClose?: () => void;
  onFeedbackSubmit?: (
    stationId: number | string,
    vote: "up" | "down",
    comment?: string
  ) => void;
};

export default function StationDrawer({ station, onClose, onFeedbackSubmit }: Props) {
  const open = Boolean(station);
  const overlayRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useBodyScrollLock(open);
  useEscapeToClose(open, onClose);
  useFocusTrap(open, cardRef);

  // outside click
  useEffect(() => {
    if (!open) return;
    const overlay = overlayRef.current;
    const handler = (e: PointerEvent) => {
      const card = cardRef.current;
      if (card && !card.contains(e.target as Node)) onClose?.();
    };
    overlay?.addEventListener("pointerdown", handler);
    return () => overlay?.removeEventListener("pointerdown", handler);
  }, [open, onClose]);

  // telemetry (debounced)
  useEffect(() => {
    if (!open || !station) return;
    const id = setTimeout(
      () => telemetry.drawerOpen((station as any).id, Boolean((station as any).isCouncil)),
      60
    );
    return () => clearTimeout(id);
  }, [open, station]);

  /* -------- normalized display fields (handles all shapes) -------- */
  const isCouncil = Boolean((station as any)?.isCouncil);
  const title = (station as any)?.name || "Unknown location";

  const ai = (station as any)?.AddressInfo || {};
  const addressLine1: string | undefined =
    (station as any)?.address ?? ai.AddressLine1 ?? undefined;
  const town: string | undefined =
    (station as any)?.town ?? ai.Town ?? undefined;
  const postcode: string | undefined =
    (station as any)?.postcode ?? ai.Postcode ?? undefined;

  // Full address string (AddressLine1, Town, Postcode)
  const fullAddress = [addressLine1, town, postcode].filter(Boolean).join(", ") || "—";

  // Normalized connectors + total
  const connectors = useMemo(() => normalizeConnectors(station as any), [station]);
  const totalNum = useMemo(() => sumConnectors(connectors), [connectors]);
  const totalLabel = totalNum !== null ? String(totalNum) : "Unknown";
  const perLines = useMemo(() => {
    if (!Array.isArray(connectors) || !connectors.length) return ["Unknown × 1"];
    return connectors.map((c) => {
      const t = c?.type ? String(c.type) : "Unknown";
      const q =
        typeof c?.quantity === "number" && !Number.isNaN(c.quantity) ? c.quantity : 1;
      return `${t} × ${q}`;
    });
  }, [connectors]);

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        background: "transparent",
        display: "flex",
        justifyContent: "flex-end",
      }}
    >
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onPointerDown={(e) => e.stopPropagation()}
        style={{
          width: "min(304px, 86vw)", // compact
          height: "100%",
          background: "#fff",
          borderLeft: "1px solid rgba(0,0,0,0.06)",
          boxShadow:
            "0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* content (scrollable) */}
        <div style={{ padding: "8px 10px 8px", overflowY: "auto" }}>
          {/* header */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <h3
                  title={title}
                  style={{
                    fontSize: 16,
                    fontWeight: 700,
                    margin: 0,
                    color: "#111827",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
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
            </div>

            <button
              aria-label="Close"
              onClick={onClose}
              style={{
                appearance: "none",
                border: 0,
                background: "transparent",
                width: 28,
                height: 28,
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

          {/* address */}
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
              title={fullAddress}
              style={{
                color: "#111827",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                fontSize: 12.5,
              }}
            >
              {fullAddress}
            </div>
            <button
              onClick={() => navigator.clipboard?.writeText(fullAddress)}
              style={copyBtnStyle}
            >
              Copy
            </button>
          </div>

          {/* connectors */}
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
              Connectors: {totalLabel}
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

          {/* actions */}
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
                  fullAddress ||
                  `${(station as any).lat}, ${(station as any).lng}`;
                navigator.clipboard?.writeText(String(text));
              }}
              style={secondaryBtnStyle}
            >
              Copy
            </button>
          </div>
        </div>

        {/* footer */}
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
            onClick={() => station && onFeedbackSubmit?.((station as any).id, "up")}
          >
            Submit feedback
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------- styles ------------------------------- */
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
