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
