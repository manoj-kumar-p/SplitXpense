const baseColors = {
  pressedOverlay: 'rgba(255, 255, 255, 0.06)',
  focusRing: '#E8E8E8',
} as const;

export const lightColors = {
  background: '#FFFFFF',
  surface: '#F5F5F5',
  surfaceElevated: '#EBEBEB',
  card: '#F5F5F5',
  text: '#0A0A0A',
  textSecondary: '#3A3A3A',
  textMuted: '#6B6B6B',
  textInverse: '#FFFFFF',
  placeholder: '#8A8A8A',
  border: '#D9D9D9',
  borderFocus: '#BEBEBE',
  primary: '#0A0A0A',
  secondary: '#FFFFFF',
  accent: '#3A3A3A',
  muted: '#6B6B6B',
  subtle: '#8A8A8A',
  positive: '#2E7D32',
  negative: '#C62828',
  settled: '#8A8A8A',
  success: '#2E7D32',
  danger: '#C62828',
  warning: '#3A3A3A',
  info: '#6B6B6B',
  modalOverlay: 'rgba(0,0,0,0.45)',
  handleBar: '#CCC',
  ...baseColors,
  pressedOverlay: 'rgba(0, 0, 0, 0.06)',
  focusRing: '#0A0A0A',
} as const;

export const darkColors = {
  background: '#121212',
  surface: '#1E1E1E',
  surfaceElevated: '#2C2C2C',
  card: '#1E1E1E',
  text: '#E8E8E8',
  textSecondary: '#B0B0B0',
  textMuted: '#888888',
  textInverse: '#121212',
  placeholder: '#6E6E6E',
  border: '#333333',
  borderFocus: '#484848',
  primary: '#E8E8E8',
  secondary: '#1E1E1E',
  accent: '#C0C0C0',
  muted: '#888888',
  subtle: '#6E6E6E',
  positive: '#66BB6A',
  negative: '#EF5350',
  settled: '#6E6E6E',
  success: '#66BB6A',
  danger: '#EF5350',
  warning: '#C0C0C0',
  info: '#888888',
  modalOverlay: 'rgba(0,0,0,0.45)',
  handleBar: '#555',
  ...baseColors,
} as const;

export type ThemeColors = {
  [K in keyof typeof lightColors]: string;
};

export const getColors = (theme: 'light' | 'dark'): ThemeColors =>
  theme === 'dark' ? darkColors : lightColors;

export const colors = darkColors;
