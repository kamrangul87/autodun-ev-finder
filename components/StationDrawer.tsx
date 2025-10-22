import { useEffect, useRef, useCallback, useMemo } from "react";
import { telemetry } from "../utils/telemetry";
import type { Station, Connector } from "../types/stations";

// ————————————————————————————————————————————————————————————————
// Small, dependency-free body scroll lock + focus management
// ————————————————————————————————————————————————————————————————
function useBodyScrollLock(locked: boolean) {
  useEffect(() => {
    const { body } = document;
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

// Trap focus within the drawer when open (no deps)
function useFocusTrap(enabled: boolean, containerRef: React.RefObject<HTMLElement>) {
  useEffect(() => {
    if (!enabled || !containerRef.current) return;
    const el = containerRef.current;

    // focus first focusable on open
    const focusable = el.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const first = focusable[0] || el;
    const prevActive = document.activeElement as HTMLElement | null;
    // Delay to avoid racing with map marker click
    const id = requestAnimationFrame(() => first.focus({ preventScroll: true }));

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const list = Array.from(focusable);
      if (!list.length) return;

      const current = document.activeElement as HTMLElement | null;
      const idx = Math.max(0, list.indexOf(current || first));
      const nextIdx =
        e.shiftKey ? (idx - 1 + list.length) % list.length : (idx + 1) % list.length;

      if (!el.contains(current)) {
        // if focus escaped somehow, bring it back
        (e.shiftKey ? list[list.length - 1] : list[0]).focus({ preventScroll: true });
        e.preventDefault();
        return;
      }

      if ((e.shiftKey && idx === 0) || (!e.shiftKey && idx === list.length - 1)) {
        list[nextIdx].focus({ preventScroll: true });
        e.preventDefault();
      }
    };

    document.addEventListener("keydown", onKey, { capture: true });
    return () => {
      cancelAnimationFrame(id);
      document.removeEventListener("keydown", onKey, { capture: true } as any);
      prevActive?.focus?.();
    };
  }, [enabled, containerRef]);
}

// ————————————————————————————————————————————————————————————————
// Utilities
// ————————————————————————————————————————————————————————————————
const sumConnectors = (connectors?: Connector[]) => {
  if (!Array.isArray(connectors) || connectors.length === 0) return null;
  let total = 0;
  for (const c of connectors) {
    const qty =
      typeof c?.quantity === "number" && !Number.isNaN(c.quantity) ? c.quantity : 0;
    total += qty;
  }
  return total > 0 ? total : null;
};

const prettyConnectorLines = (connectors?: Connector[]) => {
  if (!Array.isArray(connectors) || connectors.length === 0) return ["Unknown × 1"];
  const lines: string[] = [];
  for (const c of connectors) {
    const type = c?.type?.toString?.() || "Unknown";
    const qty =
      typeof c?.quantity === "number" && !Number.isNaN(c.quantity) ? c.quantity : 1;
    lines.push(`${type} × ${qty}`);
  }
  return lines;
};

// ————————————————————————————————————————————————————————————————
// Component
// ————————————————————————————————————————————————————————————————
type Props = {
  station: Station | null; // when null => closed
  onClose?: () => void;
  onFeedbackSubmit?: (stationId: number | string, vote: "up" | "down", comment?: string) => void;
};

export default function StationDrawer({ station, onClose, onFeedbackSubmit }: Props) {
  const open = Boolean(station);
  const containerRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  // Hardened: lock body scroll only when open
  useBodyScrollLock(open);
  useEscapeToClose(open, onClose);
  useFocusTrap(open, cardRef);

  // Outside click (pointerdown to catch before focus happens)
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      const card = cardRef.current;
      if (!card) return;
      if (!card.contains(e.target as Node)) {
        onClose?.();
      }
    };
    // Only when clicking our overlay; prevent interfering with the map when closed
    const overlay = containerRef.current;
    overlay?.addEventListener("pointerdown", onPointer);
    return () => overlay?.removeEventListener("pointerdown", onPointer);
  }, [open, onClose]);

  // Debounce telemetry for rapid marker taps (prevents stuck focus race)
  useEffect(() => {
    if (!open || !station) return;
    const id = window.setTimeout(() => {
      telemetry.drawerOpen(station.id as any, Boolean((station as any).isCouncil));
    }, 60);
    return () => window.clearTimeout(id);
  }, [open, station]);

  // Derived display fields (safe against missing data)
  const title = station?.name || "Unknown location";
  const address =
  station?.address ??
  (station as unknown as { AddressInfo?: { AddressLine1?: string } })?.AddressInfo?.AddressLine1 ??
  "—";

const postcode =
  station?.postcode ??
  (station as unknown as { AddressInfo?: { Postcode?: string } })?.AddressInfo?.Postcode ??
  "—";
  const totalConnectors = useMemo(() => sumConnectors(station?.connectors), [station]);
  const perLines = useMemo(() => prettyConnectorLines(station?.connectors), [station]);
  const isCouncil = Boolean((station as any)?.isCouncil);

  if (!open) return null;

  return (
    <div
      ref={containerRef}
      aria-hidden={!open}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        // transparent overlay that still receives pointer events for outside-click close
        background: "transparent",
        display: "flex",
        justifyContent: "flex-end",
      }}
    >
      {/* Drawer card */}
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{
          width: "min(420px, 92vw)",
          height: "100%",
          background: "#fff",
          boxShadow:
            "0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05)",
          borderLeft: "1px solid rgba(0,0,0,0.06)",
          padding: "14px 14px 12px 14px",
          display: "flex",
          flexDirection: "column",
          gap: "10px",
        }}
        // stop outside-click handler when interacting inside
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <h3
                style={{
                  fontSize: 18,
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
                    fontSize: 12,
                    fontWeight: 600,
                    background: "#ede9fe",
                    color: "#6d28d9",
                    padding: "3px 8px",
                    borderRadius: 999,
                    whiteSpace: "nowrap",
                  }}
                >
                  Council dataset
                </span>
              )}
            </div>
            {station?.town && (
              <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{station.town}</div>
            )}
          </div>

          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              appearance: "none",
              border: 0,
              background: "transparent",
              width: 36,
              height: 36,
              borderRadius: 10,
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
          }}
        >
          <div style={{ fontWeight: 600, color: "#374151" }}>Address:</div>
          <div
            style={{
              color: "#111827",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={`${address}${postcode ? `, ${postcode}` : ""}`}
          >
            {address}
            {postcode ? `, ${postcode}` : ""}
          </div>
          <button
            onClick={() => {
              navigator.clipboard?.writeText(`${address}${postcode ? `, ${postcode}` : ""}`);
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
          }}
        >
          <div style={{ fontWeight: 700, color: "#111827" }}>
            Connectors: {totalConnectors ?? "Unknown"}
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, color: "#374151", fontSize: 14 }}>
            {perLines.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
          {isCouncil && (
            <div style={{ fontSize: 12, color: "#6b7280" }}>
              Council feed may not include per-connector details.
            </div>
          )}
        </div>

        {/* CTA row */}
        <div style={{ display: "flex", gap: 10, marginTop: 2 }}>
          <a
            href={
              station
                ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
                    `${station.lat},${station.lng}`
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
                station.name ||
                station.address ||
                station.postcode ||
                `${station.lat}, ${station.lng}`;
              navigator.clipboard?.writeText(String(text));
            }}
            style={secondaryBtnStyle}
          >
            Copy
          </button>
        </div>

        {/* Feedback (unchanged API; better tap targets) */}
        <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 13, color: "#374151" }}>Rate this location</div>
          <div style={{ display: "flex", gap: 10 }}>
            <button
              style={voteBtnStyle}
              onClick={() => station && onFeedbackSubmit?.(station.id as any, "up")}
            >
              👍 Good
            </button>
            <button
              style={voteBtnStyle}
              onClick={() => station && onFeedbackSubmit?.(station.id as any, "down")}
            >
              👎 Bad
            </button>
          </div>
          <button
            style={footerSubmitStyle}
            onClick={() => {
              if (!station) return;
              onFeedbackSubmit?.(station.id as any, "up");
            }}
          >
            Submit feedback
          </button>
        </div>
      </div>
    </div>
  );
}

/* ——— styles ——— */
const copyBtnStyle: React.CSSProperties = {
  appearance: "none",
  border: "1px solid #e5e7eb",
  background: "#fff",
  padding: "6px 10px",
  borderRadius: 8,
  fontSize: 13,
  cursor: "pointer",
};

const primaryBtnStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  appearance: "none",
  textDecoration: "none",
  border: 0,
  background: "#2563eb",
  color: "#fff",
  padding: "12px 14px",
  borderRadius: 10,
  fontWeight: 700,
  width: "100%",
  cursor: "pointer",
  boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
};

const secondaryBtnStyle: React.CSSProperties = {
  ...primaryBtnStyle,
  background: "#fff",
  color: "#111827",
  border: "1px solid #e5e7eb",
};

const voteBtnStyle: React.CSSProperties = {
  ...secondaryBtnStyle,
  padding: "10px 12px",
  fontWeight: 600,
};

const footerSubmitStyle: React.CSSProperties = {
  ...primaryBtnStyle,
  marginTop: 4,
};
