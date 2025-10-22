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
function pick<T = any>(obj: any, keys: string[]): T | undefined {
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== undefined && v !== null && v !== "") return v as T;
  }
  return undefined;
}

// Normalize into your Connector[] shape regardless of source.
function normalizeConnectors(station: any): Connector[] | null {
  // 1) Already normalized (your app)
  if (Array.isArray(station?.connectors) && station.connectors.length) {
    return station.connectors.map((c: any) => ({
      type: c?.type ?? "Unknown",
      quantity:
        typeof c?.quantity === "number" && !Number.isNaN(c.quantity) ? c.quantity : 1,
      powerKW: typeof c?.powerKW === "number" ? c.powerKW : undefined,
    }));
  }

  // 2) OpenChargeMap (Connections[])
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

  // 3) Council dataset: NumberOfPoints if provided
  const npts =
    pick<number>(station, ["NumberOfPoints", "numberOfPoints", "points", "count"]) ?? null;
  if (typeof npts === "number" && npts > 0) {
    return [{ type: "Unknown", quantity: npts }];
  }

  // 4) If explicitly council row and no info, assume one logical point
  if (station?.isCouncil) {
    return [{ type: "Unknown", quantity: 1 }];
  }

  // 5) nothing
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
  const s: any = station || {};
  const isCouncil = Boolean(s.isCouncil);
  const title = s.name || "Unknown location";

  const ai = s.AddressInfo || {};

  // Address line candidates
  const addressLine1 =
    pick<string>(s, ["address", "AddressLine1"]) ??
    pick<string>(ai, ["AddressLine1", "Title"]) ??
    undefined;

  // Town candidates
  const town =
    pick<string>(s, ["town", "city", "Town", "City"]) ??
    pick<string>(ai, ["Town", "City"]) ??
    undefined;

  // Postcode candidates (handle different casings/keys)
  const postcode =
    pick<string>(s, ["postcode", "postCode", "Postcode", "PostalCode"]) ??
    pick<string>(ai, ["Postcode", "PostalCode"]) ??
    undefined;

  // Full address string
  const fullAddress = [addressLine1, town, postcode].filter(Boolean).join(", ") || "—";

  // Normalized connectors + total (never Unknown for council)
  const connectors = useMemo(() => normalizeConnectors(s), [s]);
  const totalNum = useMemo(() => {
    const val = sumConnectors(connectors);
    if (val !== null) return val;
    return isCouncil ? 1 : null;
  }, [connectors, isCouncil]);
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
          width: "min(288px, 92vw)", // **extra compact drawer**
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
        <div style={{ padding: "8px 9px", overflowY: "auto" }}>
          {/* header */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <h3
                  title={title}
                  style={{
                    fontSize: 15,
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
                      fontSize: 10.5,
                      fontWeight: 600,
                      background: "#ede9fe",
                      color: "#6d28d9",
                      padding: "1px 6px",
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
              gap: 6,
              padding: "7px 9px",
              borderRadius: 10,
              background: "#fafafa",
              border: "1px solid #efefef",
              marginTop: 8,
            }}
          >
            <div style={{ fontWeight: 600, color: "#374151", fontSize: 12 }}>Address:</div>
            <div
              title={fullAddress}
              style={{
                color: "#111827",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                fontSize: 12,
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
              padding: "7px 9px",
              borderRadius: 10,
              background: "#fafafa",
              border: "1px solid #efefef",
              display: "flex",
              flexDirection: "column",
              gap: 6,
              marginTop: 8,
            }}
          >
            <div style={{ fontWeight: 700, color: "#111827", fontSize: 13 }}>
              Connectors: {totalLabel}
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, color: "#374151", fontSize: 12 }}>
              {perLines.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
            {isCouncil && (
              <div style={{ fontSize: 10.5, color: "#6b7280" }}>
                Council feed may not include per-connector details.
              </div>
            )}
          </div>

          {/* actions */}
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <a
              href={
                station
                  ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
                      `${(s.lat as number) ?? ""},${(s.lng as number) ?? ""}`
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
                const text = s.name || fullAddress || `${s.lat}, ${s.lng}`;
                navigator.clipboard?.writeText(String(text));
              }}
              style={secondaryBtnStyle}
            >
              Copy
            </button>
          </div>
        </div>

        {/* footer */}
        <div style={{ padding: "8px 9px 9px", borderTop: "1px solid #f1f1f1" }}>
          <div style={{ fontSize: 12, color: "#374151", marginBottom: 6 }}>Rate this location</div>
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            <button
              style={voteBtnStyle}
              onClick={() => station && onFeedbackSubmit?.(s.id, "up")}
            >
              👍 Good
            </button>
            <button
              style={voteBtnStyle}
              onClick={() => station && onFeedbackSubmit?.(s.id, "down")}
            >
              👎 Bad
            </button>
          </div>
          <button
            style={footerSubmitStyle}
            onClick={() => station && onFeedbackSubmit?.(s.id, "up")}
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
  padding: "6px 9px",
  borderRadius: 8,
  fontSize: 12,
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
  padding: "9px 10px",
  borderRadius: 10,
  fontWeight: 700,
  width: "100%",
  cursor: "pointer",
  boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
  fontSize: 13,
};

const secondaryBtnStyle: CSSProperties = {
  ...primaryBtnStyle,
  background: "#fff",
  color: "#111827",
  border: "1px solid #e5e7eb",
};

const voteBtnStyle: CSSProperties = {
  ...secondaryBtnStyle,
  padding: "8px 10px",
  fontWeight: 600,
  fontSize: 12,
};

const footerSubmitStyle: CSSProperties = {
  ...primaryBtnStyle,
  marginTop: 0,
};
