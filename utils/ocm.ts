// utils/ocm.ts
import type { Station, Connector } from "../types/station";

export function mapOcmToStation(ocmItem: any): Station {
  const id = Number(ocmItem?.ID ?? ocmItem?.id ?? 0);

  const name =
    ocmItem?.AddressInfo?.Title ??
    ocmItem?.OperatorInfo?.Title ??
    "Charging station";

  const lat = Number(ocmItem?.AddressInfo?.Latitude ?? ocmItem?.lat ?? 0);
  const lng = Number(ocmItem?.AddressInfo?.Longitude ?? ocmItem?.lng ?? 0);

  const address = [
    ocmItem?.AddressInfo?.AddressLine1,
    ocmItem?.AddressInfo?.Town,
  ]
    .filter(Boolean)
    .join(", ") || undefined;

  const postcode = ocmItem?.AddressInfo?.Postcode || undefined;

  const connectors: Connector[] =
    Array.isArray(ocmItem?.Connections) && ocmItem.Connections.length
      ? ocmItem.Connections.map((c: any) => ({
          type:
            c?.ConnectionType?.Title ??
            c?.CurrentType?.Title ??
            c?.Level?.Title ??
            "Connector",
          powerKW:
            typeof c?.PowerKW === "number"
              ? c.PowerKW
              : typeof c?.PowerKW === "string"
              ? Number(c.PowerKW)
              : undefined,
          quantity:
            typeof c?.Quantity === "number"
              ? c.Quantity
              : typeof c?.Quantity === "string"
              ? Number(c.Quantity)
              : 1,
        }))
      : [];

  return { id, name, lat, lng, address, postcode, connectors };
}
