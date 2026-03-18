const { getDefaultConfig } = require('expo/metro-config');
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

// Mock native-only modules and their web dependencies for Expo Go / web
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === '@rnmapbox/maps' || moduleName.startsWith('@rnmapbox/maps/')) {
    return { filePath: require.resolve('./src/__mocks__/rnmapbox-maps.js'), type: 'sourceFile' };
  }

  if (moduleName === 'mapbox-gl' || moduleName.startsWith('mapbox-gl/')) {
    return { filePath: require.resolve('./src/__mocks__/empty-module.js'), type: 'sourceFile' };
  }

  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
