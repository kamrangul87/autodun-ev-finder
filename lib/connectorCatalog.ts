// lib/connectorCatalog.ts
export type CanonicalConnector = "CCS" | "CHAdeMO" | "Type 2";

export const CONNECTOR_COLORS: Record<CanonicalConnector, string> = {
  CCS: "#0ea5e9",       // sky-500
  CHAdeMO: "#f59e0b",   // amber-500
  "Type 2": "#10b981",  // emerald-500
};

const contains = (s: string | undefined | null, needle: string) =>
  !!s && s.toLowerCase().includes(needle.toLowerCase());

/** Map a raw connector title/name into one of the 3 canonical types (best effort). */
export function toCanonicalConnector(title?: string | null): CanonicalConnector | null {
  if (!title) return null;
  if (contains(title, "ccs")) return "CCS";
  if (contains(title, "chademo")) return "CHAdeMO";
  if (contains(title, "type 2") || contains(title, "type-2") || contains(title, "mennekes"))
    return "Type 2";
  return null;
}

/** Aggregate any list of {type, quantity, powerKW?} into the 3 canonical buckets. */
export function aggregateToCanonical(
  raw: Array<{ type?: string; quantity?: number; powerKW?: number }>
): Array<{ label: CanonicalConnector; quantity: number }> {
  const tally: Record<CanonicalConnector, number> = { CCS: 0, CHAdeMO: 0, "Type 2": 0 };
  for (const c of raw || []) {
    const label = toCanonicalConnector(c?.type || "");
    if (!label) continue;
    const q = typeof c?.quantity === "number" && c.quantity > 0 ? c.quantity : 1;
    tally[label] += q;
  }
  return (Object.keys(tally) as CanonicalConnector[])
    .filter((k) => tally[k] > 0)
    .map((k) => ({ label: k, quantity: tally[k] }));
}
