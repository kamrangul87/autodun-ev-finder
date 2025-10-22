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
/* Connector helpers                                                   */
/* ------------------------------------------------------------------ */
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

  // Debounced telemetry (prevents race when tapping multiple markers quickly)
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
    station?.address ??
    (station as unknown as { AddressInfo?: { AddressLine1?: string } })?.AddressInfo
      ?.AddressLine1 ??
    "—";

  const postcode =
    station?.postcode ??
    (station as unknown as { AddressInfo?: { Postcode?: string } })?.AddressInfo
      ?.Postcode ??
    "—";

  // Normalize town from both shapes
  const town =
    (station as unknown as { town?: string })?.town ??
    (station as unknown as { AddressInfo?: { Town?: string } })?.AddressInfo?.Town ??
    undefined;

  const isCouncil = Boolean((station as any)?.isCouncil);

  // Derive total connectors with smart fallbacks
  const totalConnectorsNumOrNull = useMemo(() => {
    const connectors = (station as any)?.connectors as Connector[] | undefined;

    // If we have per-connector details, sum them.
    const summed = sumConnectors(connectors);
    if (summed !== null) return summed;

    // Try NumberOfPoints (present on council feed items sometimes).
    const npts = (station as any)?.NumberOfPoints;
    if (typeof npts === "number" && npts > 0) return npts;

    // Council feed with no per-connector: assume one logical point
    if (isCouncil) return 1;

    // Unknown for everything else.
    return null;
  }, [station, isCouncil]);

  const totalConnectorsLabel =
    totalConnectorsNumOrNull !== null ? String(totalConnectorsNumOrNull) : "Unknown";

  const perLines = useMemo(
    () => prettyConnectorLines((station as any)?.connectors as Connector[] | undefined),
    [station]
  );

  if (!open) return null;

  return (
    <div
      ref={containerRef}
      aria-hidden={!open}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        background: "transparent", // overlay catches outside clicks
        display: "flex",
        justifyContent: "flex-end",
      }}
    >
      {/* Drawer card (narrower + slightly tighter padding) */}
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{
          width: "min(360px, 90vw)",       // was 420px, now slimmer
          height: "100%",
          background: "#fff",
          boxShadow:
            "0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05)",
          borderLeft: "1px solid rgba(0,0,0,0.06)",
          padding: "12px 12px 10px 12px",  // slightly tighter
          display: "flex",
          flexDirection: "column",
          gap: "8px",
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <h3
                style={{
                  fontSize: 17,
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
                    padding: "2px 7px",
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
              width: 32,
              height: 32,
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
          }}
        >
          <div style={{ fontWeight: 600, color: "#374151", fontSize: 13 }}>Address:</div>
          <div
            style={{
              color: "#111827",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              fontSize: 13,
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
          }}
        >
          <div style={{ fontWeight: 700, color: "#111827", fontSize: 14 }}>
            Connectors: {totalConnectorsLabel}
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, color: "#374151", fontSize: 13 }}>
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
        <div style={{ display: "flex", gap: 8, marginTop: 2 }}>
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
                station.name ||
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

        {/* Feedback */}
        <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 12.5, color: "#374151" }}>Rate this location</div>
          <div style={{ display: "flex", gap: 8 }}>
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
  padding: "11px 12px",
  borderRadius: 10,
  fontWeight: 700,
  width: "100%",
  cursor: "pointer",
  boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
  fontSize: 14,
};

const secondaryBtnStyle: CSSProperties = {
  ...primaryBtnStyle,
  background: "#fff",
  color: "#111827",
  border: "1px solid #e5e7eb",
};

const voteBtnStyle: CSSProperties = {
  ...secondaryBtnStyle,
  padding: "10px 12px",
  fontWeight: 600,
  fontSize: 13,
};

const footerSubmitStyle: CSSProperties = {
  ...primaryBtnStyle,
  marginTop: 4,
};
