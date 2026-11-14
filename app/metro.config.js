// Learn more https://docs.expo.dev/guides/customizing-metro
const path = require('path');
// Expo's default config, plus the debug IDs that match crash reports to source maps.
const { getSentryExpoConfig } = require('@sentry/react-native/metro');

const config = getSentryExpoConfig(__dirname);

// The shared rules engine lives outside the app folder (../packages/ludo-engine).
// Metro only bundles files it watches; `@ludo/engine` itself is mapped by tsconfig `paths`.
config.watchFolders = [path.resolve(__dirname, '../packages')];

module.exports = config;
