// utils/ocm.ts
import type { Station } from "../components/StationDrawer";

export function mapOcmToStation(ocmItem: any): Station {
  const id = String(ocmItem?.ID ?? ocmItem?.id ?? "");
  const name =
    ocmItem?.AddressInfo?.Title ??
    ocmItem?.OperatorInfo?.Title ??
    "Charging station";

  const lat = Number(ocmItem?.AddressInfo?.Latitude ?? ocmItem?.lat ?? 0);
  const lng = Number(ocmItem?.AddressInfo?.Longitude ?? ocmItem?.lng ?? 0);

  const address = [
    ocmItem?.AddressInfo?.AddressLine1,
    ocmItem?.AddressInfo?.Town,
    ocmItem?.AddressInfo?.Postcode,
  ]
    .filter(Boolean)
    .join(", ");

  const connectors =
    Array.isArray(ocmItem?.Connections) && ocmItem.Connections.length
      ? ocmItem.Connections.map((c: any) => ({
          type:
            c?.ConnectionType?.Title ??
            c?.CurrentType?.Title ??
            c?.Level?.Title ??
            "Connector",
          count: Number(c?.Quantity ?? 1),
        }))
      : [];

  const network =
    ocmItem?.OperatorInfo?.Title ??
    (ocmItem?.OperatorID ? `Operator ${ocmItem.OperatorID}` : undefined);

  return { id, name, address, lat, lng, connectors, network };
}
