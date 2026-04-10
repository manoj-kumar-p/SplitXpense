import React from 'react';
import {View, StyleSheet, type ViewStyle} from 'react-native';
import {useTheme} from '../../theme';
import {spacing} from '../../theme/spacing';
import {radii} from '../../theme/radii';

interface Props {
  children: React.ReactNode;
  style?: ViewStyle;
  noPadding?: boolean;
}

export function AppCard({children, style, noPadding}: Props) {
  const {colors} = useTheme();
  return (
    <View
      style={[
        styles.card,
        {backgroundColor: colors.surface, borderColor: colors.border},
        noPadding && styles.noPadding,
        style,
      ]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.lg,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: spacing.base,
  },
  // noPadding reserved for future use - card has no default padding
  noPadding: {},
});
