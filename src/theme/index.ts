export {fonts} from './fonts';
export {spacing} from './spacing';
export {radii} from './radii';
export {shadows} from './shadows';
export {getColors, lightColors, darkColors} from './colors';
export type {ThemeColors} from './colors';
export type {Theme} from './ThemeContext';
export {ThemeProvider, useThemeContext} from './ThemeContext';

// useTheme is an alias for useThemeContext for backward compatibility
export {useThemeContext as useTheme} from './ThemeContext';
