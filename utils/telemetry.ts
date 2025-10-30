/**
 * Telemetry logging utility - captures anonymized, non-PII events
 * for later analysis. No-ops if disabled.
 */

export interface TelemetryEvent {
  name: string;
  payload: Record<string, any>;
  timestamp: number;
}

const TELEMETRY_ENABLED =
  typeof window !== "undefined" &&
  process.env.NEXT_PUBLIC_TELEMETRY_DISABLED !== "true";

/** Hash a string for anonymization (simple non-cryptographic hash) */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // force 32-bit
  }
  return Math.abs(hash).toString(16);
}

/** Get or create an anonymous session ID (stored in sessionStorage) */
function getSessionId(): string {
  if (typeof window === "undefined") return "server";
  const key = "telemetry_session";
  let sessionId = sessionStorage.getItem(key);
  if (!sessionId) {
    sessionId = Math.random().toString(36).substring(2, 15);
    sessionStorage.setItem(key, sessionId);
  }
  return sessionId;
}

/** Log a telemetry event (non-PII). */
export function logEvent(name: string, payload: Record<string, any> = {}): void {
  if (!TELEMETRY_ENABLED) return;

  const event: TelemetryEvent = {
    name,
    payload: {
      ...payload,
      sessionId: getSessionId(), // anonymized session context
    },
    timestamp: Date.now(),
  };

  // Dev console logging
  try {
    // eslint-disable-next-line no-console
    console.log("[Telemetry]", event.name, event.payload);
  } catch {}

  // Send to API (best-effort; never block UI)
  try {
    fetch("/api/telemetry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
    }).catch(() => {});
  } catch {
    // swallow
  }
}

/** Hash a search query for telemetry */
export function hashSearchQuery(query: string): string {
  return simpleHash(query.toLowerCase().trim());
}

/** Telemetry event helpers (client-side convenience) */
export const telemetry = {
  search: (query: string, resultsCount: number) =>
    logEvent("search", { queryHash: hashSearchQuery(query), resultsCount }),

  drawerOpen: (stationId: string | number, isCouncil: boolean = false) =>
    logEvent("drawer_open", { stationId, isCouncil }),

  drawerClose: (stationId: string | number, durationMs: number) =>
    logEvent("drawer_close", { stationId, durationMs }),

  feedbackSubmit: (
    stationId: string | number,
    vote: "good" | "bad",
    hasComment: boolean
  ) => logEvent("feedback_submit", { stationId, vote, hasComment }),

  routeClicked: (stationId: string | number, provider: "google" | "apple") =>
    logEvent("route_clicked", { stationId, provider }),

  councilSelected: (borough: string, stationCount: number) =>
    logEvent("council_selected", {
      boroughHash: simpleHash(borough),
      stationCount,
    }),

  locateMeClicked: (granted: boolean) =>
    logEvent("locate_me_clicked", { granted }),

  toggleLayer: (layer: "heatmap" | "markers" | "council", visible: boolean) =>
    logEvent("toggle_layer", { layer, visible }),
};

/**
 * Lightweight AI-scoring telemetry hooks (used by /api/score and the drawer).
 * Safe on both client and server — they just console.info in try/catch.
 */
export function scoreRequested(meta: {
  stationId?: string | number;
  src?: string;
  features?: Record<string, any>;
}) {
  try {
    // eslint-disable-next-line no-console
    console.info("[telemetry] scoreRequested", meta);
  } catch {}
}

export function scoreReturned(meta: {
  stationId?: string | number;
  score?: number;
  cache?: "HIT" | "MISS";
  ms?: number;
}) {
  try {
    // eslint-disable-next-line no-console
    console.info("[telemetry] scoreReturned", meta);
  } catch {}
}
