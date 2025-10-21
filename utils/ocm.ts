// utils/ocm.ts
// Self-contained mapper from OpenChargeMap items -> your Station shape.
// No external type imports so Vercel can't complain about missing paths.

export type Connector = { type: string; powerKW?: number; quantity?: number };
export type Station = {
  id: number;
  name: string;
  lat: number;
  lng: number;
  address?: string;
  postcode?: string;
  connectors: Connector[];
};

export function mapOcmToStation(ocmItem: any): Station {
  const id =
    typeof ocmItem?.ID === "number"
      ? ocmItem.ID
      : Number(ocmItem?.ID ?? ocmItem?.id ?? 0);

  const name =
    ocmItem?.AddressInfo?.Title ??
    ocmItem?.OperatorInfo?.Title ??
    "Charging station";

  const lat = Number(ocmItem?.AddressInfo?.Latitude ?? ocmItem?.lat ?? 0);
  const lng = Number(ocmItem?.AddressInfo?.Longitude ?? ocmItem?.lng ?? 0);

  const addressPart1 = ocmItem?.AddressInfo?.AddressLine1 || "";
  const addressPart2 = ocmItem?.AddressInfo?.Town || "";
  const addressCombined = [addressPart1, addressPart2].filter(Boolean).join(", ");
  const address = addressCombined || undefined;

  const postcode =
    (ocmItem?.AddressInfo?.Postcode as string | undefined) || undefined;

  const connectors: Connector[] =
    Array.isArray(ocmItem?.Connections) && ocmItem.Connections.length
      ? ocmItem.Connections.map((c: any) => {
          const type =
            c?.ConnectionType?.Title ??
            c?.CurrentType?.Title ??
            c?.Level?.Title ??
            "Connector";

          const powerKW =
            typeof c?.PowerKW === "number"
              ? c.PowerKW
              : typeof c?.PowerKW === "string"
              ? Number(c.PowerKW)
              : undefined;

          const quantity =
            typeof c?.Quantity === "number"
              ? c.Quantity
              : typeof c?.Quantity === "string"
              ? Number(c.Quantity)
              : 1;

          return { type, powerKW, quantity };
        })
      : [];

  return { id, name, lat, lng, address, postcode, connectors };
}
