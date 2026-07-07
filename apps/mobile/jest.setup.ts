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

jest.mock('expo-location', () => ({
  Accuracy: {
    Balanced: 3,
    High: 4,
    Highest: 5,
    Low: 2,
    Lowest: 1,
  },
  getCurrentPositionAsync: jest.fn(() => {
    return Promise.reject(new Error('location unavailable in tests'));
  }),
  requestForegroundPermissionsAsync: jest.fn(() => {
    return Promise.resolve({
      canAskAgain: true,
      expires: 'never',
      granted: false,
      status: 'denied',
    });
  }),
}));

jest.mock('expo-image-picker', () => ({
  MediaTypeOptions: {
    All: 'All',
    Images: 'Images',
    Videos: 'Videos',
  },
  launchImageLibraryAsync: jest.fn(() => {
    return Promise.resolve({ assets: null, canceled: true });
  }),
  requestMediaLibraryPermissionsAsync: jest.fn(() => {
    return Promise.resolve({
      canAskAgain: true,
      expires: 'never',
      granted: true,
      status: 'granted',
    });
  }),
}));

jest.mock('expo-notifications', () => ({
  AndroidImportance: {
    DEFAULT: 3,
    HIGH: 4,
    LOW: 2,
    MAX: 5,
    MIN: 1,
  },
  addNotificationReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  addPushTokenListener: jest.fn(() => ({ remove: jest.fn() })),
  getDevicePushTokenAsync: jest.fn(() => {
    return Promise.resolve({ data: 'device-push-token', type: 'android' });
  }),
  getLastNotificationResponseAsync: jest.fn(() => Promise.resolve(null)),
  getPermissionsAsync: jest.fn(() => {
    return Promise.resolve({
      canAskAgain: true,
      expires: 'never',
      granted: false,
      status: 'undetermined',
    });
  }),
  requestPermissionsAsync: jest.fn(() => {
    return Promise.resolve({
      canAskAgain: false,
      expires: 'never',
      granted: false,
      status: 'denied',
    });
  }),
  setNotificationChannelAsync: jest.fn(() => Promise.resolve(null)),
}));

jest.mock('@react-native-community/netinfo', () => {
  const addEventListener = jest.fn(() => jest.fn());
  const fetchState = jest.fn(() => {
    return Promise.resolve({ isConnected: true, isInternetReachable: true });
  });
  const netInfoModule = {
    addEventListener,
    fetch: fetchState,
  };

  return {
    __esModule: true,
    ...netInfoModule,
    default: netInfoModule,
  };
});

jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();

  return {
    deleteItemAsync: jest.fn((key: string) => {
      store.delete(key);
      return Promise.resolve();
    }),
    getItem: jest.fn((key: string): string | null => {
      return store.has(key) ? (store.get(key) as string) : null;
    }),
    getItemAsync: jest.fn((key: string): Promise<string | null> => {
      return Promise.resolve(store.has(key) ? (store.get(key) as string) : null);
    }),
    setItem: jest.fn((key: string, value: string): void => {
      store.set(key, value);
    }),
    setItemAsync: jest.fn((key: string, value: string): Promise<void> => {
      store.set(key, value);
      return Promise.resolve();
    }),
  };
});

jest.mock('expo-file-system', () => ({
  cacheDirectory: 'file:///cache/',
  downloadAsync: jest.fn(() => {
    return Promise.resolve({ status: 200, uri: 'file:///cache/receipt.pdf' });
  }),
}));

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(() => Promise.resolve(true)),
  shareAsync: jest.fn(() => Promise.resolve()),
}));

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
