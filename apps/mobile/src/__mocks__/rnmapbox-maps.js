/**
 * Mock for @rnmapbox/maps.
 * On web: loads real Mapbox GL JS from CDN and wires sources/layers into the canvas.
 * On native (Expo Go): renders placeholder Views.
 */
const React = require('react');
const { View, Text, Platform } = require('react-native');

let _accessToken = null;

// Shared context: provides the mapboxgl.Map instance to all child components
const MapContext = React.createContext(null);

// Shared context: provides the parent ShapeSource id to layer children
const SourceContext = React.createContext(null);

// ---------------------------------------------------------------------------
// MapView – creates the Mapbox GL canvas and exposes the map via context
// ---------------------------------------------------------------------------
const MapView = ({ children, style, styleURL }) => {
  const mapId = React.useMemo(() => `mapbox-web-${Math.random().toString(36).slice(2, 8)}`, []);
  const [mapInstance, setMapInstance] = React.useState(null);

  React.useEffect(() => {
    const token =
      _accessToken ||
      (typeof process !== 'undefined' && process.env && process.env.EXPO_PUBLIC_MAPBOX_TOKEN) ||
      null;
    if (Platform.OS !== 'web' || !token) return;
    _accessToken = token;

    let map = null;
    let cancelled = false;

    const init = async () => {
      if (!document.getElementById('mapbox-gl-css')) {
        const link = document.createElement('link');
        link.id = 'mapbox-gl-css';
        link.rel = 'stylesheet';
        link.href = 'https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.css';
        document.head.appendChild(link);
      }

      if (!window.mapboxgl) {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.js';
          script.onload = resolve;
          script.onerror = reject;
          document.head.appendChild(script);
        });
      }

      if (cancelled) return;
      const el = document.getElementById(mapId);
      if (!el) return;

      window.mapboxgl.accessToken = token;
      map = new window.mapboxgl.Map({
        container: el,
        style: styleURL || 'mapbox://styles/mapbox/streets-v12',
        center: [44.4991, 40.1792],
        zoom: 12,
      });

      map.once('load', () => {
        if (!cancelled) {
          window.__devMap = map; // dev convenience
          setMapInstance(map);
        }
      });
    };

    void init();

    return () => {
      cancelled = true;
      if (map) map.remove();
      setMapInstance(null);
    };
  }, [mapId, styleURL]);

  if (Platform.OS !== 'web') {
    return React.createElement(
      View,
      {
        style: [
          { backgroundColor: '#e5e7eb', alignItems: 'center', justifyContent: 'center' },
          style,
        ],
      },
      React.createElement(
        Text,
        { style: { color: '#6b7280', fontSize: 13 } },
        '🗺 Map unavailable in Expo Go',
      ),
      children,
    );
  }

  return React.createElement(
    MapContext.Provider,
    { value: mapInstance },
    React.createElement(View, { style, nativeID: mapId }, children),
  );
};

// ---------------------------------------------------------------------------
// Camera – flies to centerCoordinate/zoomLevel when they change
// ---------------------------------------------------------------------------
const Camera = ({ centerCoordinate, zoomLevel }) => {
  const map = React.useContext(MapContext);

  React.useEffect(() => {
    if (!map || !centerCoordinate) return;
    map.flyTo({ center: centerCoordinate, zoom: zoomLevel ?? 12, duration: 500 });
  }, [map, centerCoordinate, zoomLevel]);

  return null;
};

// ---------------------------------------------------------------------------
// ShapeSource – adds/updates a GeoJSON source; wires click → onPress
// ---------------------------------------------------------------------------
const ShapeSource = ({
  id,
  shape,
  cluster,
  clusterMaxZoomLevel,
  clusterRadius,
  onPress,
  children,
}) => {
  const map = React.useContext(MapContext);

  // Add or update the source whenever map or shape changes
  React.useEffect(() => {
    if (!map || !shape) return;

    const addOrUpdate = () => {
      if (map.getSource(id)) {
        map.getSource(id).setData(shape);
      } else {
        map.addSource(id, {
          type: 'geojson',
          data: shape,
          cluster: cluster || false,
          clusterMaxZoom: clusterMaxZoomLevel ?? 14,
          clusterRadius: clusterRadius ?? 50,
        });
      }
    };

    // Map is already loaded (setMapInstance is called on 'load'), so call directly
    addOrUpdate();
  }, [map, id, shape, cluster, clusterMaxZoomLevel, clusterRadius]);

  // Click handler: query features from this source and emit onPress
  React.useEffect(() => {
    if (!map || !onPress) return;

    const handleClick = (e) => {
      const features = map.queryRenderedFeatures(e.point).filter((f) => f.source === id);
      if (features.length > 0) {
        onPress({ features });
      }
    };

    map.on('click', handleClick);
    return () => map.off('click', handleClick);
  }, [map, id, onPress]);

  return React.createElement(SourceContext.Provider, { value: id }, children);
};

// ---------------------------------------------------------------------------
// Helper: add a layer once its source exists (poll every 50 ms)
// ---------------------------------------------------------------------------
function addLayerWhenSourceReady(map, sourceId, layerConfig) {
  const tryAdd = () => {
    if (!map.getStyle()) return; // map was removed
    if (map.getLayer(layerConfig.id)) return; // already added
    if (!map.getSource(sourceId)) {
      setTimeout(tryAdd, 50);
      return;
    }
    map.addLayer(layerConfig);
  };
  tryAdd();
}

// ---------------------------------------------------------------------------
// CircleLayer
// ---------------------------------------------------------------------------
const CircleLayer = ({ id, filter, style: layerStyle }) => {
  const map = React.useContext(MapContext);
  const sourceId = React.useContext(SourceContext);

  React.useEffect(() => {
    if (!map || !sourceId) return;

    const paint = {};
    if (layerStyle?.circleColor !== undefined) paint['circle-color'] = layerStyle.circleColor;
    if (layerStyle?.circleRadius !== undefined) paint['circle-radius'] = layerStyle.circleRadius;
    if (layerStyle?.circleStrokeColor !== undefined)
      paint['circle-stroke-color'] = layerStyle.circleStrokeColor;
    if (layerStyle?.circleStrokeWidth !== undefined)
      paint['circle-stroke-width'] = layerStyle.circleStrokeWidth;

    const layerConfig = { id, type: 'circle', source: sourceId, paint };
    if (filter) layerConfig.filter = filter;

    addLayerWhenSourceReady(map, sourceId, layerConfig);
  }, [map, sourceId, id]);

  return null;
};

// ---------------------------------------------------------------------------
// SymbolLayer
// ---------------------------------------------------------------------------
const SymbolLayer = ({ id, filter, style: layerStyle }) => {
  const map = React.useContext(MapContext);
  const sourceId = React.useContext(SourceContext);

  React.useEffect(() => {
    if (!map || !sourceId) return;

    const layout = {};
    const paint = {};
    if (layerStyle?.textField !== undefined) layout['text-field'] = layerStyle.textField;
    if (layerStyle?.textSize !== undefined) layout['text-size'] = layerStyle.textSize;
    if (layerStyle?.textAllowOverlap !== undefined)
      layout['text-allow-overlap'] = layerStyle.textAllowOverlap;
    if (layerStyle?.textColor !== undefined) paint['text-color'] = layerStyle.textColor;

    const layerConfig = { id, type: 'symbol', source: sourceId, layout, paint };
    if (filter) layerConfig.filter = filter;

    addLayerWhenSourceReady(map, sourceId, layerConfig);
  }, [map, sourceId, id]);

  return null;
};

// ---------------------------------------------------------------------------
// MarkerView – renders a React component as a Mapbox HTML marker via portal
// ---------------------------------------------------------------------------
const MarkerView = ({ coordinate, children }) => {
  const map = React.useContext(MapContext);
  const [markerEl, setMarkerEl] = React.useState(null);
  const markerRef = React.useRef(null);

  React.useEffect(() => {
    if (!map || !coordinate || !window.mapboxgl) return;

    const el = document.createElement('div');
    el.style.pointerEvents = 'none';

    const marker = new window.mapboxgl.Marker({ element: el, anchor: 'center' })
      .setLngLat(coordinate)
      .addTo(map);

    markerRef.current = marker;
    setMarkerEl(el);

    return () => {
      marker.remove();
      markerRef.current = null;
      setMarkerEl(null);
    };
  }, [map, coordinate ? coordinate[0] : null, coordinate ? coordinate[1] : null]);

  if (!markerEl) return null;

  try {
    const ReactDOM = require('react-dom');
    return ReactDOM.createPortal(children, markerEl);
  } catch {
    return null;
  }
};

// ---------------------------------------------------------------------------
// Stubs for components not needed on web
// ---------------------------------------------------------------------------
const PointAnnotation = ({ children }) => React.createElement(React.Fragment, null, children);
const UserLocation = () => null;

// ---------------------------------------------------------------------------
// Mapbox namespace export
// ---------------------------------------------------------------------------
const Mapbox = {
  MapView,
  Camera,
  ShapeSource,
  CircleLayer,
  SymbolLayer,
  MarkerView,
  PointAnnotation,
  UserLocation,
  StyleURL: {
    Street: 'mapbox://styles/mapbox/streets-v12',
    Satellite: 'mapbox://styles/mapbox/satellite-v9',
    Dark: 'mapbox://styles/mapbox/dark-v11',
  },
  setAccessToken: (token) => {
    _accessToken = token;
    return Promise.resolve(token);
  },
  getAccessToken: () => Promise.resolve(_accessToken),
  // Offline tile packs require the real native Mapbox module. Fail loudly so
  // the UI reports an error instead of pretending the download succeeded.
  offlineManagerLegacy: {
    createPack: () => Promise.reject(new Error('offline maps unsupported in mock map mode')),
  },
  offlineManager: {
    createPack: () => Promise.reject(new Error('offline maps unsupported in mock map mode')),
  },
};

module.exports = Mapbox;
module.exports.default = Mapbox;
