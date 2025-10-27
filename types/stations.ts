export interface Connector {
  type: string;
  quantity: number;
  powerKW?: number;
}

export interface Station {
  id: string | number;
  name?: string;
  address?: string;
  postcode?: string;
  lat?: number;
  lng?: number;
  connectors?: Connector[];
  AddressInfo?: {
    Title?: string;
    AddressLine1?: string;
    Town?: string;
    City?: string;
    Postcode?: string;
    PostalCode?: string;
  };
  Connections?: any[];
  properties?: any;
  NumberOfPoints?: number;
  isCouncil?: boolean;
}
