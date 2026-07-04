import '@testing-library/jest-native/extend-expect';

jest.mock('@rnmapbox/maps', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react') as typeof import('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require('react-native') as typeof import('react-native');

  const createComponent = (displayName: string) => {
    const Component = ({
      children,
      ...props
    }: React.PropsWithChildren<Record<string, unknown>>): JSX.Element => {
      return React.createElement(View, props, children);
    };

    Component.displayName = displayName;

    return Component;
  };

  const setAccessToken = jest.fn<Promise<string | null>, [string | null]>(() => {
    return Promise.resolve(null);
  });
  // Mirrors the metro mock (src/__mocks__/rnmapbox-maps.js): offline tile
  // packs require the real native Mapbox module, so the mock rejects.
  const offlineManagerLegacy = {
    createPack: jest.fn<Promise<void>, [unknown]>(() => {
      return Promise.reject(new Error('offline maps unsupported in mock map mode'));
    }),
  };
  const mapboxModule = {
    Camera: createComponent('MapboxCamera'),
    CircleLayer: createComponent('MapboxCircleLayer'),
    MapView: createComponent('MapboxMapView'),
    MarkerView: createComponent('MapboxMarkerView'),
    ShapeSource: createComponent('MapboxShapeSource'),
    StyleURL: {
      Street: 'mapbox://styles/mapbox/streets-v11',
    },
    SymbolLayer: createComponent('MapboxSymbolLayer'),
    offlineManagerLegacy,
    setAccessToken,
  };

  return {
    __esModule: true,
    ...mapboxModule,
    default: mapboxModule,
  };
});

jest.mock('react-native-mmkv', () => {
  class MMKV {
    private readonly valueByKey: Map<string, string> = new Map<string, string>();

    public getString(key: string): string | undefined {
      return this.valueByKey.get(key);
    }

    public set(key: string, value: string): void {
      this.valueByKey.set(key, value);
    }

    public delete(key: string): void {
      this.valueByKey.delete(key);
    }
  }

  return {
    MMKV,
  };
});
