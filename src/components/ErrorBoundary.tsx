import React from 'react';
import {View, Text, TouchableOpacity, StyleSheet, Appearance} from 'react-native';

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends React.Component<
  {children: React.ReactNode},
  State
> {
  state = {hasError: false};

  static getDerivedStateFromError() {
    return {hasError: true};
  }

  componentDidCatch(error: Error) {
    console.error('ErrorBoundary caught:', error);
  }

  render() {
    if (this.state.hasError) {
      const isDark = Appearance.getColorScheme() === 'dark';
      const bg = isDark ? '#121212' : '#FFFFFF';
      const text = isDark ? '#E8E8E8' : '#1A1A1A';
      const muted = isDark ? '#888' : '#666';
      const btnBg = isDark ? '#E8E8E8' : '#1A1A1A';
      const btnText = isDark ? '#121212' : '#FFFFFF';

      return (
        <View style={[styles.container, {backgroundColor: bg}]}>
          <Text style={[styles.title, {color: text}]}>Something went wrong</Text>
          <Text style={[styles.subtitle, {color: muted}]}>Please restart the app</Text>
          <TouchableOpacity
            style={[styles.button, {backgroundColor: btnBg}]}
            onPress={() => this.setState({hasError: false})}>
            <Text style={[styles.buttonText, {color: btnText}]}>Try Again</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  title: {fontSize: 18, fontWeight: '700', marginBottom: 8},
  subtitle: {fontSize: 14, marginBottom: 24},
  button: {
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  buttonText: {fontSize: 14, fontWeight: '600'},
});
