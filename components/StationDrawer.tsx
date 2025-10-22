// components/StationDrawer.tsx
import { useEffect, useMemo, useRef } from "react";
import type { CSSProperties } from "react";
import { telemetry } from "../utils/telemetry";
import type { Station, Connector } from "../types/stations";
import {
  aggregateToCanonical,
  CONNECTOR_COLORS,
} from "../lib/connectorCatalog";

/* ───────────────────────────── UX helpers ───────────────────────────── */

function useBodyScrollLock(locked: boolean) {
  useEffect(() => {
    const b = typeof document !== "undefined" ? document.body : null;
    if (!b) return;
    const prev = b.style.overflow;
    if (locked) b.style.overflow = "hidden";
    return () => {
      b.style.overflow = prev;
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

function useFocusTrap(
  enabled: boolean,
  containerRef: React.RefObject<HTMLElement>
) {
  useEffect(() => {
    if (!enabled || !containerRef.current) return;
    const el = containerRef.current;

    const firstFocusable =
      (el.querySelector(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      ) as HTMLElement | null) || el;

    const prevActive = document.activeElement as HTMLElement | null;
    const raf = requestAnimationFrame(() =>
      firstFocusable.focus({ preventScroll: true })
    );

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const nodes = Array.from(
        el.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
      );
      if (!nodes.length) return;

      const cur = (document.activeElement as HTMLElement) || nodes[0];
      if (!el.contains(cur)) {
        (e.shiftKey ? nodes[nodes.length - 1] : nodes[0]).focus({
          preventScroll: true,
        });
        e.preventDefault();
        return;
      }

      const i = Math.max(0, nodes.indexOf(cur));
      const next = e.shiftKey
        ? (i - 1 + nodes.length) % nodes.length
        : (i + 1) % nodes.length;

      if ((e.shiftKey && i === 0) || (!e.shiftKey && i === nodes.length - 1)) {
        nodes[next].focus({ preventScroll: true });
        e.preventDefault();
      }
    };

    document.addEventListener("keydown", onKey, { capture: true });
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKey, {
        capture: true,
      } as any);
      prevActive?.focus?.();
    };
  }, [enabled, containerRef]);
}

/* ───────────────────────────── Normalizers ───────────────────────────── */

const pick = <T,>(obj: any, keys: string[]): T | undefined => {
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== undefined && v !== null && v !== "") return v as T;
  }
  return undefined;
};

function normalizeConnectors(station: any): Connector[] | null {
  // 1) Already normalized in app
  if (Array.isArray(station?.connectors) && station.connectors.length) {
    return station.connectors.map((c: any) => ({
      type: c?.type ?? "Unknown",
      quantity:
        typeof c?.quantity === "number" && !Number.isNaN(c.quantity)
          ? c.quantity
          : 1,
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

  // 3) Council dataset: NumberOfPoints
  const npts =
    pick<number>(station, ["NumberOfPoints", "numberOfPoints", "points", "count"]) ??
    null;
  if (typeof npts === "number" && npts > 0) return [{ type: "Unknown", quantity: npts }];

  // 4) Explicit council row fallback
  if (station?.isCouncil) return [{ type: "Unknown", quantity: 1 }];

  return null;
}

function sumConnectors(list: Connector[] | null): number | null {
  if (!Array.isArray(list) || !list.length) return null;
  let total = 0;
  for (const c of list) {
    const q =
      typeof c?.quantity === "number" && !Number.isNaN(c.quantity) ? c.quantity : 0;
    total += q;
  }
  return total > 0 ? total : null;
}

/* ───────────────────────────── Component ───────────────────────────── */

type Props = {
  station: Station | null;
  onClose?: () => void;
  onFeedbackSubmit?: (
    stationId: number | string,
    vote: "up" | "down",
    comment?: string
  ) => void;
};

export default function StationDrawer({
  station,
  onClose,
  onFeedbackSubmit,
}: Props) {
  const open = Boolean(station);
  const overlayRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useBodyScrollLock(open);
  useEscapeToClose(open, onClose);
  useFocusTrap(open, cardRef);

  // close on outside click
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

  // telemetry
  useEffect(() => {
    if (!open || !station) return;
    const id = setTimeout(
      () => telemetry.drawerOpen((station as any).id, Boolean((station as any).isCouncil)),
      60
    );
    return () => clearTimeout(id);
  }, [open, station]);

  const s: any = station || {};
  const isCouncil = Boolean(s.isCouncil);

  // Address fields (robust join of line1, town/city, postcode)
  const ai = s.AddressInfo || {};
  const line1 =
    pick<string>(s, ["address", "AddressLine1"]) ??
    pick<string>(ai, ["AddressLine1", "Title"]);
  const town =
    pick<string>(s, ["town", "city", "Town", "City"]) ??
    pick<string>(ai, ["Town", "City"]);
  const postcode =
    pick<string>(s, ["postcode", "postCode", "Postcode", "PostalCode"]) ??
    pick<string>(ai, ["Postcode", "PostalCode"]);
  const fullAddress = [line1, town, postcode].filter(Boolean).join(", ") || "—";

  const title = s.name || ai.Title || "Unknown location";

  // Connectors (aggregate into CCS / CHAdeMO / Type 2)
  const connectors = useMemo(() => normalizeConnectors(s), [s]);
  const totalNum = useMemo(() => {
    const n = sumConnectors(connectors);
    if (n !== null) return n;
    return isCouncil ? 1 : null;
  }, [connectors, isCouncil]);
  const totalLabel = totalNum !== null ? String(totalNum) : "Unknown";

  const canonical = useMemo(() => {
    if (!Array.isArray(connectors) || !connectors.length) return [];
    return aggregateToCanonical(
      connectors.map((c) => ({
        type: c?.type,
        quantity: c?.quantity,
        powerKW: (c as any)?.powerKW,
      }))
    );
  }, [connectors]);

  const showTypesMessage =
    isCouncil &&
    (!Array.isArray(connectors) || !connectors.length || canonical.length === 0);

  if (!open) return null;

  return (
    <>
      {/* transparent overlay (outside click catcher) */}
      <div
        ref={overlayRef}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 10000,
          background: "transparent",
        }}
      />
      {/* floating compact card (keep as-is) */}
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onPointerDown={(e) => e.stopPropagation()}
        style={drawerStyle}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <h3
                title={title}
                style={{
                  fontSize: 15,
                  fontWeight: 800,
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
          <button onClick={onClose} aria-label="Close" style={iconBtn}>
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

        {/* Body */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            overflowY: "auto",
          }}
        >
          {/* Address */}
          <div style={cardRow}>
            <div style={rowLabel}>Address:</div>
            <div title={fullAddress} style={rowValue}>
              {fullAddress}
            </div>
            <button
              onClick={() => navigator.clipboard?.writeText(fullAddress)}
              style={chipBtn}
            >
              Copy
            </button>
          </div>

          {/* Connectors */}
          <div style={cardRow}>
            <div style={{ fontWeight: 800, color: "#111827", fontSize: 13 }}>
              Connectors: {totalLabel}
            </div>

            {showTypesMessage ? (
              <div style={{ marginTop: 6, fontSize: 12, color: "#6b7280" }}>
                Connector types not specified.
              </div>
            ) : (
              <ul
                style={{
                  margin: "6px 0 0 0",
                  padding: 0,
                  listStyle: "none",
                }}
              >
                {canonical.map((c) => (
                  <li
                    key={c.label}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      fontSize: 12,
                      color: "#374151",
                      marginBottom: 4,
                    }}
                  >
                    <span
                      aria-hidden
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: 999,
                        background: CONNECTOR_COLORS[c.label],
                        display: "inline-block",
                        flex: "0 0 10px",
                      }}
                    />
                    <span>
                      {c.label} × {c.quantity}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {isCouncil && (
              <div style={{ marginTop: 4, fontSize: 10.5, color: "#6b7280" }}>
                Council feed may not include per-connector details.
              </div>
            )}
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: 6 }}>
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
              style={primaryBtn}
            >
              ➤ Directions
            </a>
            <button
              onClick={() => {
                const text = s.name || fullAddress || `${s.lat}, ${s.lng}`;
                navigator.clipboard?.writeText(String(text));
              }}
              style={secondaryBtn}
            >
              Copy
            </button>
          </div>
        </div>

        {/* Footer inside the card */}
        <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
          <div style={{ fontSize: 12, color: "#374151" }}>Rate this location</div>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              style={voteBtn}
              onClick={() => station && onFeedbackSubmit?.(s.id, "up")}
            >
              👍 Good
            </button>
            <button
              style={voteBtn}
              onClick={() => station && onFeedbackSubmit?.(s.id, "down")}
            >
              👎 Bad
            </button>
          </div>
          <button
            style={primaryBtn}
            onClick={() => station && onFeedbackSubmit?.(s.id, "up")}
          >
            Submit feedback
          </button>
        </div>
      </div>
    </>
  );
}

/* ───────────────────────────── Styles ───────────────────────────── */

const drawerStyle: CSSProperties = {
  position: "fixed",
  right: 12,
  top: 84, // below the app bar
  zIndex: 10001,
  width: "min(286px, 92vw)",
  maxHeight: "calc(100vh - 96px)",
  background: "#fff",
  border: "1px solid #eaeaea",
  borderRadius: 14,
  boxShadow: "0 20px 40px rgba(0,0,0,0.14), 0 6px 18px rgba(0,0,0,0.08)",
  padding: 10,
  display: "flex",
  flexDirection: "column",
};

const cardRow: CSSProperties = {
  padding: "8px 10px",
  border: "1px solid #efefef",
  borderRadius: 10,
  background: "#fafafa",
};

const rowLabel: CSSProperties = {
  fontWeight: 700,
  color: "#374151",
  fontSize: 12,
  marginBottom: 4,
};

const rowValue: CSSProperties = {
  color: "#111827",
  fontSize: 12,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const iconBtn: CSSProperties = {
  appearance: "none",
  border: 0,
  background: "transparent",
  width: 28,
  height: 28,
  borderRadius: 8,
  display: "grid",
  placeItems: "center",
  cursor: "pointer",
};

const chipBtn: CSSProperties = {
  appearance: "none",
  border: "1px solid #e5e7eb",
  background: "#fff",
  padding: "6px 9px",
  borderRadius: 8,
  fontSize: 12,
  cursor: "pointer",
  marginLeft: 8,
};

const primaryBtn: CSSProperties = {
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
  fontSize: 13,
};

const secondaryBtn: CSSProperties = {
  ...primaryBtn,
  background: "#fff",
  color: "#111827",
  border: "1px solid #e5e7eb",
};

const voteBtn: CSSProperties = {
  ...secondaryBtn,
  padding: "8px 10px",
  fontWeight: 600,
  fontSize: 12,
};
