// Learn more https://docs.expo.dev/guides/customizing-metro
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// The shared rules engine lives outside the app folder (../packages/ludo-engine).
// Metro only bundles files it watches; `@ludo/engine` itself is mapped by tsconfig `paths`.
config.watchFolders = [path.resolve(__dirname, '../packages')];

module.exports = config;
