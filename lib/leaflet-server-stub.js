// lib/leaflet-server-stub.js
// No-op Leaflet stub for server build to avoid touching `window`.
const noop = () => {};

export const DomUtil = {
  get: noop,
  getStyle: () => ({}),
  create: () => ({ style: {} }),
  addClass: noop,
  removeClass: noop,
  setTransform: noop,
};

export class LatLngBounds {
  constructor() {}
  extend() {
    return this;
  }
  pad() {
    return this;
  }
  getCenter() {
    return { lat: 0, lng: 0 };
  }
  getSouthWest() {
    return { lat: 0, lng: 0 };
  }
  getNorthEast() {
    return { lat: 0, lng: 0 };
  }
  isValid() {
    return true;
  }
}

const classCache = new Map();
const ensureClass = (name) => {
  if (!classCache.has(name)) {
    classCache.set(
      name,
      class {
        constructor() {}
        addTo() {
          return this;
        }
        remove() {
          return this;
        }
        removeFrom() {
          return this;
        }
        addLayer() {
          return this;
        }
        removeLayer() {
          return this;
        }
        setStyle() {
          return this;
        }
        setLatLng() {
          return this;
        }
        setLatLngs() {
          return this;
        }
        setRadius() {
          return this;
        }
        bindPopup() {
          return this;
        }
        openPopup() {
          return this;
        }
        closePopup() {
          return this;
        }
        on() {
          return this;
        }
        off() {
          return this;
        }
        getPane() {
          return undefined;
        }
      },
    );
  }
  return classCache.get(name);
};

export const Circle = ensureClass('Circle');
export const CircleMarker = ensureClass('CircleMarker');
export const Control = ensureClass('Control');
export const FeatureGroup = ensureClass('FeatureGroup');
export const GeoJSON = ensureClass('GeoJSON');
export const ImageOverlay = ensureClass('ImageOverlay');
export const Layer = ensureClass('Layer');
export const LayerGroup = ensureClass('LayerGroup');
export const GridLayer = ensureClass('GridLayer');
export const Map = ensureClass('Map');
export const Marker = ensureClass('Marker');
export const Polygon = ensureClass('Polygon');
export const Polyline = ensureClass('Polyline');
export const Popup = ensureClass('Popup');
export const Rectangle = ensureClass('Rectangle');
export const SVGOverlay = ensureClass('SVGOverlay');
export const TileLayer = ensureClass('TileLayer');
export const Tooltip = ensureClass('Tooltip');
export const Icon = ensureClass('Icon');
export const DivIcon = ensureClass('DivIcon');
export const DivOverlay = ensureClass('DivOverlay');
export const VideoOverlay = ensureClass('VideoOverlay');

export const heatLayer = () => ({
  addTo: noop,
  setLatLngs: noop,
});

export const map = () => ({
  remove: noop,
  addLayer: noop,
  removeLayer: noop,
  setView: noop,
  fitBounds: noop,
  flyTo: noop,
  on: noop,
  off: noop,
  hasLayer: () => false,
});

const layerInstance = () => new Layer();

export const tileLayer = () => new TileLayer();
export const layerGroup = () => layerInstance();
export const featureGroup = () => layerInstance();
export const marker = () => new Marker();
export const geoJSON = () => layerInstance();
export const circleMarker = () => layerInstance();
export const circle = () => layerInstance();
export const polygon = () => layerInstance();
export const polyline = () => layerInstance();
export const imageOverlay = () => layerInstance();
export const svgOverlay = () => layerInstance();
export const rectangle = () => layerInstance();
export const popup = () => layerInstance();
export const tooltip = () => layerInstance();
export const videoOverlay = () => layerInstance();

export const CRS = {};

const L = {
  DomUtil,
  LatLngBounds,
  Circle,
  CircleMarker,
  Control,
  FeatureGroup,
  GeoJSON,
  ImageOverlay,
  Layer,
  LayerGroup,
  GridLayer,
  Map,
  Marker,
  Polygon,
  Polyline,
  Popup,
  Rectangle,
  SVGOverlay,
  TileLayer,
  Tooltip,
  Icon,
  DivIcon,
  DivOverlay,
  VideoOverlay,
  heatLayer,
  map,
  tileLayer,
  layerGroup,
  featureGroup,
  marker,
  geoJSON,
  circle,
  circleMarker,
  polygon,
  polyline,
  imageOverlay,
  svgOverlay,
  rectangle,
  popup,
  tooltip,
  videoOverlay,
  CRS,
};

const LeafletStub = new Proxy(L, {
  get(target, prop) {
    if (prop in target) {
      return target[prop];
    }
    if (typeof prop === 'string') {
      const stubClass = ensureClass(prop);
      target[prop] = stubClass;
      return stubClass;
    }
    return undefined;
  },
});

export default LeafletStub;
