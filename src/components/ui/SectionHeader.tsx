import React from 'react';
import {Text, StyleSheet} from 'react-native';
import {useTheme} from '../../theme';
import {fonts} from '../../theme/fonts';
import {spacing} from '../../theme/spacing';

interface Props {
  title: string;
}

export function SectionHeader({title}: Props) {
  const {colors} = useTheme();
  return (
    <Text style={[styles.header, {color: colors.textMuted}]}>{title}</Text>
  );
}

const styles = StyleSheet.create({
  header: {
    fontSize: fonts.sizes.xs,
    fontWeight: '600',
    letterSpacing: 1,
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
    paddingHorizontal: 4,
  },
});
