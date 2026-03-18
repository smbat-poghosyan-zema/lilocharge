/**
 * Builds Babel configuration for Expo Router and React Native transforms.
 */
module.exports = function babelConfig(api) {
  api.cache(true);

  return {
    presets: ['babel-preset-expo'],
  };
};
