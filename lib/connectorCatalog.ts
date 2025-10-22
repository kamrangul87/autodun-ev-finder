// lib/connectorCatalog.ts
export const CONNECTOR_COLORS: Record<string, string> = {
  CCS: "#3b82f6",       // blue
  CHAdeMO: "#f59e0b",   // amber
  "Type 2": "#22c55e",  // green
};

const TYPE_ALIASES: Array<[RegExp, "CCS" | "CHAdeMO" | "Type 2"]> = [
  [/ccs/i, "CCS"],
  [/combo\s*2/i, "CCS"],
  [/combined\s*charging/i, "CCS"],

  [/chademo/i, "CHAdeMO"],
  [/cha\s*de\s*mo/i, "CHAdeMO"],

  [/type\s*2/i, "Type 2"],
  [/mennekes/i, "Type 2"],
];

export function normalizeConnectorLabel(raw?: string): "CCS" | "CHAdeMO" | "Type 2" | null {
  if (!raw) return null;
  for (const [rx, label] of TYPE_ALIASES) {
    if (rx.test(raw)) return label;
  }
  return null;
}

/** Aggregate arbitrary connectors to canonical CCS/CHAdeMO/Type 2 buckets */
export function aggregateToCanonical(
  connectors: Array<{ type?: string; quantity?: number }>
): Array<{ label: "CCS" | "CHAdeMO" | "Type 2"; quantity: number }> {
  const bucket: Record<"CCS" | "CHAdeMO" | "Type 2", number> = {
    CCS: 0,
    CHAdeMO: 0,
    "Type 2": 0,
  };
  for (const c of connectors || []) {
    const qty = typeof c?.quantity === "number" && !Number.isNaN(c.quantity) ? c.quantity : 1;
    const label = normalizeConnectorLabel(c?.type || "");
    if (label) bucket[label] += qty;
  }
  return (Object.entries(bucket) as Array<[any, number]>)
    .filter(([, q]) => q > 0)
    .map(([label, quantity]) => ({ label, quantity })) as Array<{
    label: "CCS" | "CHAdeMO" | "Type 2";
    quantity: number;
  }>;
}

