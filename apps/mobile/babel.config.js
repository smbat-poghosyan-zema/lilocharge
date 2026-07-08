/**
 * Builds Babel configuration for Expo Router, React Native, and NativeWind transforms.
 *
 * `jsxImportSource: 'nativewind'` lets core RN components accept `className`; the
 * `nativewind/babel` preset (react-native-css-interop) wires the runtime. Both run in
 * Metro AND babel-jest, so `className` is accepted in tests as well.
 */
module.exports = function babelConfig(api) {
  api.cache(true);

  return {
    presets: [['babel-preset-expo', { jsxImportSource: 'nativewind' }], 'nativewind/babel'],
  };
};
