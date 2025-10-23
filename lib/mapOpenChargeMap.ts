// lib/mapOpenChargeMap.ts
export type Connector = { type: string; quantity: number; powerKW?: number };

const ID_TO_LABEL: Record<number, "CCS" | "CHAdeMO" | "Type 2"> = {
  33: "CCS",     // IEC 62196-3 Type 2 Combo
  32: "CCS",     // Type 1 Combo -> bucket CCS
  2:  "CHAdeMO",
  25: "Type 2",
};

function canonicalize(raw?: string): string {
  if (!raw) return "Unknown";
  const t = raw.toLowerCase();
  if (t.includes("ccs") || t.includes("combo")) return "CCS";
  if (t.includes("chademo")) return "CHAdeMO";
  if (t.includes("type 2") || t.includes("type-2") || t.includes("mennekes")) return "Type 2";
  if (t.includes("iec 62196") && t.includes("type 2")) return "Type 2";
  return "Unknown";
}

function n(v: any) {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(+v)) return +v;
  return undefined;
}

export function mapOCMConnectionsToConnectors(connections: any[] | undefined | null): Connector[] {
  if (!Array.isArray(connections) || connections.length === 0) return [];

  const out: Connector[] = [];
  for (const c of connections) {
    const id = n(c?.ConnectionTypeID) ?? n(c?.ConnectionType?.ID);
    const fromId = id != null ? ID_TO_LABEL[id] : undefined;

    const title =
      c?.ConnectionType?.Title ??
      c?.ConnectionType?.FormalName ??
      c?.CurrentType?.Title ??
      c?.Level?.Title;

    const type = fromId ?? canonicalize(title);
    const quantity = typeof c?.Quantity === "number" && c.Quantity > 0 ? c.Quantity : 1;
    const powerKW = typeof c?.PowerKW === "number" ? c.PowerKW : undefined;

    if (type !== "Unknown") out.push({ type, quantity, powerKW });
  }
  return out;
}
