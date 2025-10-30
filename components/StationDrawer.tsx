// components/StationDrawer.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { telemetry, scoreRequested, scoreReturned } from "../utils/telemetry";
import type { Station, Connector } from "../types/stations";
import {
  aggregateToCanonical,
  CONNECTOR_COLORS,
} from "../lib/connectorCatalog";

/* ─────────────── UX helpers ─────────────── */

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

/* ─────────────── Normalizers ─────────────── */

const pick = <T,>(obj: any, keys: string[]): T | undefined => {
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== undefined && v !== null && v !== "") return v as T;
  }
  return undefined;
};

// canonicalize raw connector titles to your legend labels
function canonicalizeConnectorLabel(raw?: string): string {
  if (!raw) return "Unknown";
  const t = raw.toLowerCase().trim();

  if (t.includes("ccs") || t.includes("combo 2") || t.includes("combo type 2"))
    return "CCS";
  if (t.includes("chademo")) return "CHAdeMO";
  if (t.includes("type 2") || t.includes("type-2")) return "Type 2";
  if (t.includes("iec 62196") && t.includes("type 2")) return "Type 2";
  if (t.includes("tesla") && t.includes("type 2")) return "Type 2"; // older Tesla AC
  return raw.trim();
}

// safe number parser for PowerKW, etc.
function safeNumber(n: any, dflt = undefined as number | undefined) {
  const v = typeof n === "string" ? Number(n) : n;
  return typeof v === "number" && Number.isFinite(v) ? v : dflt;
}

// helper to read nested paths safely
function oget(obj: any, path: string[]): any {
  return path.reduce((a, k) => (a && a[k] != null ? a[k] : undefined), obj);
}

// minimal OCM ID → label fallback when titles are missing
const OCM_TYPE_BY_ID: Record<number, string> = {
  25: "Type 2", // Type 2 (Socket Only)
  33: "CCS", // CCS (Type 2 Combo)
  2: "CHAdeMO", // CHAdeMO
  // add more if you encounter them frequently
};

function normalizeConnectors(station: any): Connector[] | null {
  // 1) Preferred: connectorsDetailed from EnhancedMapV2 normalization
  if (
    Array.isArray(station?.connectorsDetailed) &&
    station.connectorsDetailed.length
  ) {
    return station.connectorsDetailed.map((c: any) => ({
      type: canonicalizeConnectorLabel(c?.type ?? "Unknown"),
      quantity:
        typeof c?.quantity === "number" && !Number.isNaN(c.quantity)
          ? c.quantity
          : 1,
      powerKW: safeNumber(c?.powerKW),
    }));
  }

  // 2) Fallback: already-normalized station.connectors array
  if (Array.isArray(station?.connectors) && station.connectors.length) {
    return station.connectors.map((c: any) => ({
      type: canonicalizeConnectorLabel(c?.type ?? "Unknown"),
      quantity:
        typeof c?.quantity === "number" && !Number.isNaN(c.quantity)
          ? c.quantity
          : 1,
      powerKW: safeNumber(c?.powerKW),
    }));
  }

  // 2) OpenChargeMap: try all common locations for Connections
  const candidates =
    oget(station, ["Connections"]) ||
    oget(station, ["properties", "Connections"]) ||
    oget(station, ["connections"]) ||
    oget(station, ["properties", "connections"]) ||
    null;

  if (Array.isArray(candidates) && candidates.length) {
    return candidates.map((c: any) => {
      // Priority: explicit titles → fall back to IDs if needed
      const rawType =
        c?.ConnectionType?.Title ??
        c?.ConnectionType?.FormalName ??
        c?.CurrentType?.Title ??
        c?.Level?.Title ??
        (typeof c?.ConnectionTypeID === "number"
          ? OCM_TYPE_BY_ID[c.ConnectionTypeID]
          : undefined) ??
        "Unknown";

      return {
        type: canonicalizeConnectorLabel(rawType),
        quantity:
          typeof c?.Quantity === "number" && c.Quantity > 0 ? c.Quantity : 1,
        powerKW: safeNumber(c?.PowerKW),
      };
    });
  }

  // 3) Council: NumberOfPoints, etc. → default to Type 2 when it's a council record
  const npts =
    pick<number>(station, [
      "NumberOfPoints",
      "numberOfPoints",
      "points",
      "count",
    ]) ?? null;

  if (typeof npts === "number" && npts > 0) {
    const label = station?.isCouncil ? "Type 2" : "Unknown";
    return [{ type: label, quantity: npts }];
  }

  return null;
}

function sumConnectors(list: Connector[] | null): number | null {
  if (!Array.isArray(list) || !list.length) return null;
  let total = 0;
  for (const c of list) {
    const q =
      typeof c?.quantity === "number" && !Number.isNaN(c.quantity)
        ? c.quantity
        : 0;
    total += q;
  }
  return total > 0 ? total : null;
}

/* ─────────────── Component ─────────────── */

type Props = {
  station: Station | null;
  onClose?: () => void;
  onFeedbackSubmit?: (
    stationId: number | string,
    vote: "up" | "down",
    comment?: string
  ) => void;
  /** Optional: bubble AI score up so map heat can update immediately */
  onAiScore?: (stationId: number | string, score: number) => void;
};

export default function StationDrawer({
  station,
  onClose,
  onFeedbackSubmit,
  onAiScore,
}: Props) {
  const open = Boolean(station);
  const overlayRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  // feedback state
  const [vote, setVote] = useState<"up" | "down" | null>(null);
  const [comment, setComment] = useState("");

  // AI score state
  const [aiScore, setAiScore] = useState<number | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  useBodyScrollLock(open);
  useEscapeToClose(open, onClose);
  useFocusTrap(open, cardRef);

  // reset feedback when the station changes
  useEffect(() => {
    if (!open) return;
    setVote(null);
    setComment("");
    setAiScore(null);
    setAiError(null);
    setAiLoading(false);
  }, [open, station?.id]);

  // outside click (on transparent overlay)
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
      () =>
        telemetry.drawerOpen(
          (station as any).id,
          Boolean((station as any).isCouncil)
        ),
      60
    );
    return () => clearTimeout(id);
  }, [open, station]);

  const s: any = station || {};
  const isCouncil = Boolean(s.isCouncil);
  // Address build (line1, town/city, postcode)
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

  // Connectors (with robust fallbacks)
  const connectors = useMemo(() => normalizeConnectors(s), [s]);

  // total count label: try explicit sums, then known OCM fields, then council fallback
  const totalNum = useMemo(() => {
    const totals = [
      sumConnectors(connectors),
      pick<number>(s, ["NumberOfPoints", "numberOfPoints"]),
      Array.isArray(s?.Connections)
        ? s.Connections.reduce(
            (acc: number, c: any) =>
              acc + (typeof c?.Quantity === "number" ? c.Quantity : 1),
            0
          )
        : null,
    ].filter((n) => typeof n === "number" && !Number.isNaN(n)) as number[];
    if (totals.length) return totals[0]!;
    return isCouncil ? 1 : null;
  }, [connectors, s, isCouncil]);

  const totalLabel = totalNum !== null ? String(totalNum) : "Unknown";

  // canonical breakdown (CCS / CHAdeMO / Type 2), if we can map types
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

  const showUnknownBreakdown =
    (!canonical || canonical.length === 0) && totalNum !== null;

  /* ─────────────── AI score logic (with 30m client cache) ─────────────── */

  function getCacheKey(st: any) {
    return `aiScore:${String(st?.id ?? "")}`;
  }

  function maybeLoadFromCache(st: any): number | null {
    try {
      const raw = localStorage.getItem(getCacheKey(st));
      if (!raw) return null;
      const { score, t } = JSON.parse(raw);
      if (typeof score !== "number" || typeof t !== "number") return null;
      if (Date.now() - t > 30 * 60 * 1000) return null; // >30m
      return score;
    } catch {
      return null;
    }
  }

  function saveToCache(st: any, score: number) {
    try {
      localStorage.setItem(
        getCacheKey(st),
        JSON.stringify({ score, t: Date.now() })
      );
    } catch {}
  }

  async function fetchAiScore() {
    if (!station) return;
    setAiLoading(true);
    setAiError(null);

    // cache check (applies even if scorer disabled; we surface last known)
    const cached = maybeLoadFromCache(station);
    if (typeof cached === "number") {
      setAiScore(cached);
      onAiScore?.(s.id, cached);
      // still emit telemetry for button usage
      scoreReturned({ stationId: s.id, score: cached, cache: "HIT" });
      setAiLoading(false);
      return;
    }

    // Feature engineering (robust fallbacks)
    const power_kw =
      safeNumber(
        pick<number>(s, ["PowerKW", "powerKW"]),
        Array.isArray(connectors)
          ? connectors
              .map((c: any) => safeNumber(c?.powerKW, 0) || 0)
              .reduce((a, b) => Math.max(a, b), 0) || undefined
          : undefined
      ) ?? 50;

    const n_connectors =
      totalNum ?? (Array.isArray(connectors) ? connectors.length : 1);

    const has_fast_dc =
      (canonical?.some((c) => c.label === "CCS" || c.label === "CHAdeMO") ||
        (Array.isArray(connectors) &&
          connectors.some((c: any) => (c?.powerKW ?? 0) >= 50)))
        ? 1
        : 0;

    const rating =
      safeNumber(pick<number>(s, ["rating", "UserRating", "userRating"]), 4.2) ??
      4.2;

    const usage_score = 1;

    const has_geo =
      (typeof s.lat === "number" && typeof s.lng === "number") ||
      (typeof s.Latitude === "number" && typeof s.Longitude === "number")
        ? 1
        : 0;

    // telemetry (request)
    scoreRequested({
      stationId: s.id,
      src: "drawer",
      features: { power_kw, n_connectors, has_fast_dc, rating, usage_score, has_geo },
    });

    const t0 = Date.now();
    try {
      const resp = await fetch(`/api/score?stationId=${encodeURIComponent(String(s.id ?? ""))}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          power_kw,
          n_connectors,
          has_fast_dc,
          rating,
          usage_score,
          has_geo,
        }),
      });

      const data = await resp.json();

      if (!resp.ok) {
        // degrade gracefully; server also degrades
        setAiScore(typeof data?.score === "number" ? data.score : null);
        setAiError(data?.error || "Failed to score");
        scoreReturned({
          stationId: s.id,
          score: data?.score,
          cache: "MISS",
          ms: Date.now() - t0,
        });
        return;
      }

      const score = typeof data?.score === "number" ? data.score : null;
      setAiScore(score);
      if (typeof score === "number") {
        saveToCache(s, score);
        onAiScore?.(s.id, score); // bubble up to update heat weights
      }
      scoreReturned({
        stationId: s.id,
        score: score ?? undefined,
        cache: "MISS",
        ms: Date.now() - t0,
      });
    } catch (err: any) {
      console.error(err);
      setAiError(err?.message || "Unable to score this station");
      setAiScore(null);
      scoreReturned({ stationId: s.id, cache: "MISS" });
    } finally {
      setAiLoading(false);
    }
  }

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
      {/* floating compact card (kept as you approved) */}
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

            {canonical.length > 0 ? (
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
            ) : showUnknownBreakdown ? (
              <ul
                style={{
                  margin: "6px 0 0 0",
                  padding: 0,
                  listStyle: "none",
                }}
              >
                <li
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 12,
                    color: "#374151",
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 999,
                      background: "#9ca3af", // gray bullet for unknown
                      display: "inline-block",
                      flex: "0 0 10px",
                    }}
                  />
                  <span>Unknown × {totalLabel}</span>
                </li>
              </ul>
            ) : (
              <div style={{ marginTop: 6, fontSize: 12, color: "#6b7280" }}>
                Connector types not specified.
              </div>
            )}

            {isCouncil && (
              <div style={{ marginTop: 4, fontSize: 10.5, color: "#6b7280" }}>
                Council feed may not include per-connector details.
              </div>
            )}
          </div>

          {/* Directions / copy */}
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

          {/* AI Score */}
          <div style={cardRow}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ fontWeight: 800, color: "#111827", fontSize: 13 }}>
                AI Score
              </div>
              {aiScore !== null && (
                <span
                  title="Model score (0–1)"
                  style={{
                    marginLeft: "auto",
                    fontSize: 12,
                    fontWeight: 700,
                    background:
                      aiScore >= 0.75
                        ? "#dcfce7"
                        : aiScore >= 0.5
                        ? "#fef9c3"
                        : "#fee2e2",
                    color:
                      aiScore >= 0.75
                        ? "#166534"
                        : aiScore >= 0.5
                        ? "#854d0e"
                        : "#991b1b",
                    padding: "3px 8px",
                    borderRadius: 999,
                  }}
                >
                  {aiScore.toFixed(3)}
                </span>
              )}
            </div>

            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
              <button
                onClick={fetchAiScore}
                disabled={aiLoading}
                style={primaryBtn}
              >
                {aiLoading ? "Scoring..." : "Get AI Score"}
              </button>
            </div>

            {aiError && (
              <div
                style={{
                  marginTop: 6,
                  fontSize: 12,
                  color: "#991b1b",
                }}
              >
                {aiError}
              </div>
            )}
          </div>

          {/* Feedback */}
          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ fontSize: 12, color: "#374151" }}>
              Rate this location
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                style={{
                  ...voteBtn,
                  borderColor: vote === "up" ? "#22c55e" : "#e5e7eb",
                  background: vote === "up" ? "#dcfce7" : "#fff",
                }}
                onClick={() => setVote("up")}
              >
                👍 Good
              </button>
              <button
                style={{
                  ...voteBtn,
                  borderColor: vote === "down" ? "#f59e0b" : "#e5e7eb",
                  background: vote === "down" ? "#fffbeb" : "#fff",
                }}
                onClick={() => setVote("down")}
              >
                👎 Bad
              </button>
            </div>

            {/* comment box */}
            <textarea
              placeholder="Optional comment (e.g., price, access, reliability)…"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              style={textarea}
            />

            <button
              style={primaryBtn}
              onClick={() => {
                if (!station) return;
                const chosen = vote ?? "up";
                onFeedbackSubmit?.(s.id, chosen, comment.trim() || undefined);
              }}
            >
              Submit feedback
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

/* ─────────────── Styles ─────────────── */

const drawerStyle: CSSProperties = {
  position: "fixed",
  right: 12,
  top: 84, // below the app bar
  zIndex: 10001,
  width: "min(286px, 92vw)",
  maxHeight: "calc(100vh - 96px)",
  background: "#fff",
  border: "1px solid #eaeaea", // ← fixed
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

const textarea: CSSProperties = {
  width: "100%",
  resize: "vertical",
  minHeight: 70,
  fontSize: 12,
  padding: "8px 10px",
  borderRadius: 10,
  border: "1px solid #e5e7eb",
  outline: "none",
  color: "#111827",
  background: "#fff",
};
