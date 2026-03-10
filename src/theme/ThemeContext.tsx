import React, {createContext, useContext, useState, useCallback, useMemo} from 'react';
import {useColorScheme} from 'react-native';
import {getColors, type ThemeColors} from './colors';
import {fonts} from './fonts';
import {spacing} from './spacing';
import type {ThemePreference} from '../db/queries/settingsQueries';

export interface Theme {
  colors: ThemeColors;
  fonts: typeof fonts;
  spacing: typeof spacing;
  isDark: boolean;
}

interface ThemeContextValue extends Theme {
  preference: ThemePreference;
  setPreference: (pref: ThemePreference) => void;
}

const ThemeCtx = createContext<ThemeContextValue | null>(null);

interface Props {
  initialPreference: ThemePreference;
  children: React.ReactNode;
}

export function ThemeProvider({initialPreference, children}: Props) {
  const systemScheme = useColorScheme();
  const [preference, setPreference] = useState<ThemePreference>(initialPreference);

  const isDark = useMemo(() => {
    if (preference === 'system') return systemScheme === 'dark';
    return preference === 'dark';
  }, [preference, systemScheme]);

  const value = useMemo<ThemeContextValue>(() => ({
    colors: getColors(isDark ? 'dark' : 'light'),
    fonts,
    spacing,
    isDark,
    preference,
    setPreference,
  }), [isDark, preference]);

  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export function useThemeContext(): ThemeContextValue {
  const ctx = useContext(ThemeCtx);
  if (!ctx) throw new Error('useThemeContext must be used within ThemeProvider');
  return ctx;
}
