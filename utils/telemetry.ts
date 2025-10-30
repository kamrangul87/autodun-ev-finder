/**
 * Telemetry logging utility - captures anonymized, non-PII events
 * for later ML analysis. No-ops if no endpoint configured.
 */

export interface TelemetryEvent {
  name: string;
  payload: Record<string, any>;
  timestamp: number;
}

const TELEMETRY_ENABLED =
  typeof window !== "undefined" &&
  process.env.NEXT_PUBLIC_TELEMETRY_DISABLED !== "true";

/**
 * Hash a string for anonymization (simple non-cryptographic hash)
 */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16);
}

/**
 * Get or create an anonymous session ID (stored in sessionStorage)
 */
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

/**
 * Log a telemetry event
 * @param name Event name (e.g., 'search', 'feedback_submit', 'drawer_open')
 * @param payload Event data (must not contain PII)
 */
export function logEvent(
  name: string,
  payload: Record<string, any> = {}
): void {
  if (!TELEMETRY_ENABLED) return;

  const event: TelemetryEvent = {
    name,
    payload: {
      ...payload,
      // Add session context (anonymized)
      sessionId: getSessionId(),
    },
    timestamp: Date.now(),
  };

  // Dev console logging
  console.log("[Telemetry]", event.name, event.payload);

  // Future: POST to /api/telemetry endpoint
  // if (TELEMETRY_ENDPOINT) {
  //   fetch('/api/telemetry', {
  //     method: 'POST',
  //     headers: { 'Content-Type': 'application/json' },
  //     body: JSON.stringify(event),
  //   }).catch(() => {});
  // }
}

/**
 * Hash a search query for telemetry
 */
export function hashSearchQuery(query: string): string {
  return simpleHash(query.toLowerCase().trim());
}

/**
 * Telemetry event helpers (client-side)
 */
export const telemetry = {
  search: (query: string, resultsCount: number) =>
    logEvent("search", { queryHash: hashSearchQuery(query), resultsCount }),

  drawerOpen: (stationId: string, isCouncil: boolean = false) =>
    logEvent("drawer_open", { stationId, isCouncil }),

  drawerClose: (stationId: string, durationMs: number) =>
    logEvent("drawer_close", { stationId, durationMs }),

  feedbackSubmit: (
    stationId: string,
    vote: "good" | "bad",
    hasComment: boolean
  ) => logEvent("feedback_submit", { stationId, vote, hasComment }),

  routeClicked: (stationId: string, provider: "google" | "apple") =>
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

/* ------------------------------------------------------------------ */
/*                          AI scorer telemetry                        */
/*  Server-safe helpers (no-ops if console not available).            */
/*  These DO NOT rely on window and can be used in API routes.        */
/* ------------------------------------------------------------------ */

// add these (keep your existing exports)
export function scoreRequested(meta: {
  stationId?: string | number;
  src?: string;
  features?: Record<string, any>;
}) {
  try {
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
    console.info("[telemetry] scoreReturned", meta);
  } catch {}
}
