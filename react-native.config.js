module.exports = {
  dependencies: {
    'react-native-zeroconf': {
      platforms: {
        android: null, // Exclude from Android build (NDK fails with spaces in path)
      },
    },
  },
};
