const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const { withSentryConfig } = require('@sentry/react-native/metro');

const config = getDefaultConfig(__dirname);

module.exports = withSentryConfig(withNativeWind(config, { input: './src/global.css' }), {
  autoWrapExpoRouterErrorBoundary: true,
});
