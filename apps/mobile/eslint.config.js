const expoConfig = require('eslint-config-expo/flat');

module.exports = [
  ...expoConfig,
  {
    ignores: ['dist/*', '.expo/*', 'coverage/*'],
  },
  {
    // A React Native log stream is readable by anyone holding the device, so
    // every console call goes through MobileLogger, which sanitises its data
    // argument and gates level by APP_ENV (CLAUDE.md > Logging Strategy).
    rules: {
      'no-console': 'error',
    },
  },
  {
    // MobileLogger is the one permitted console caller.
    files: ['src/lib/logger.ts'],
    rules: {
      'no-console': 'off',
    },
  },
];
