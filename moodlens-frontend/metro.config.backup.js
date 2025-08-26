// metro.config.js (place in moodlens-frontend/)
const { getDefaultConfig } = require('expo/metro-config');
const exclusionList = require('metro-config/src/defaults/exclusionList');

const config = getDefaultConfig(__dirname);

// Ignore folders that don't need bundling or watching
config.resolver.blockList = exclusionList([
  // Native build outputs (if you ever prebuild or eject)
  /android\/.*/,
  /ios\/.*/,

  // VCS / caches / build artifacts
  /(\.git)\/.*/,
  /(\.expo)\/.*/,
  /(\.cache)\/.*/,
  /dist\/.*/,
  /build\/.*/,
  /coverage\/.*/,

  // Misc
  /logs?\/.*/,
  /tmp\/.*/,
  /\.DS_Store/,
]);

// Slightly safer default; not required but helps some monorepo setups
config.watchFolders = [__dirname];

module.exports = config;
