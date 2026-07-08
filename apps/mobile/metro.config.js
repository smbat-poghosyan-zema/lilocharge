const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Watch all files in the monorepo
config.watchFolders = [workspaceRoot];

// Resolve packages from app, workspace, and pnpm virtual store
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules/.pnpm/node_modules'),
];

// @rnmapbox/maps ships a native module that cannot run on web. On native
// platforms the real module is bundled so real Mapbox maps ship in dev/release
// builds. Set EXPO_PUBLIC_FORCE_MOCK_MAP=1 at bundle time as an explicit
// escape hatch for Expo Go, which cannot load custom native modules.
const forceMockMap = Boolean(process.env.EXPO_PUBLIC_FORCE_MOCK_MAP);

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const shouldMockMapbox = platform === 'web' || forceMockMap;

  if (
    shouldMockMapbox &&
    (moduleName === '@rnmapbox/maps' || moduleName.startsWith('@rnmapbox/maps/'))
  ) {
    return { filePath: require.resolve('./src/__mocks__/rnmapbox-maps.js'), type: 'sourceFile' };
  }

  // The web mock loads Mapbox GL JS from a CDN (never via the `mapbox-gl`
  // package), so stub `mapbox-gl` out only for non-web bundles.
  if (platform !== 'web' && (moduleName === 'mapbox-gl' || moduleName.startsWith('mapbox-gl/'))) {
    return { filePath: require.resolve('./src/__mocks__/empty-module.js'), type: 'sourceFile' };
  }

  return context.resolveRequest(context, moduleName, platform);
};

// Wrap LAST — withNativeWind only adds a CSS transformer and Tailwind watching; it does
// NOT touch resolver.resolveRequest, so the Mapbox/mapbox-gl mock above survives intact.
module.exports = withNativeWind(config, { input: './global.css' });
