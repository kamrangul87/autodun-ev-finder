export const CONNECTOR_COLORS: Record<string, string> = {
  "CCS": "#3b82f6",       // blue
  "CHAdeMO": "#10b981",   // green
  "Type 2": "#8b5cf6",    // purple
};

interface ConnectorInput {
  type?: string;
  quantity?: number;
  powerKW?: number;
}

interface CanonicalConnector {
  label: string;
  quantity: number;
  maxPowerKW?: number;
}

export function aggregateToCanonical(
  connectors: ConnectorInput[]
): CanonicalConnector[] {
  const map = new Map<string, { quantity: number; maxPowerKW?: number }>();

  for (const c of connectors) {
    const type = c.type || "Unknown";
    const qty = typeof c.quantity === "number" ? c.quantity : 1;
    const kw = c.powerKW;

    if (!map.has(type)) {
      map.set(type, { quantity: 0 });
    }
    const entry = map.get(type)!;
    entry.quantity += qty;
    if (kw !== undefined && (entry.maxPowerKW === undefined || kw > entry.maxPowerKW)) {
      entry.maxPowerKW = kw;
    }
  }

  return Array.from(map.entries()).map(([label, data]) => ({
    label,
    quantity: data.quantity,
    maxPowerKW: data.maxPowerKW,
  }));
}
