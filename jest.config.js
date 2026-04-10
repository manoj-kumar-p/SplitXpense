module.exports = {
  preset: 'react-native',
  testPathIgnorePatterns: [
    '/node_modules/',
    '/__tests__/__mocks__/',
  ],
  moduleNameMapper: {
    // Node already provides crypto.getRandomValues; skip the RN polyfill in tests.
    '^react-native-get-random-values$': '<rootDir>/__tests__/__mocks__/empty.js',
  },
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|@react-navigation|tweetnacl|tweetnacl-util|scrypt-js)/)',
  ],
};
