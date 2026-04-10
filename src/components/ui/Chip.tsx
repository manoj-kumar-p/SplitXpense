import React from 'react';
import {TouchableOpacity, Text, StyleSheet} from 'react-native';
import {useTheme} from '../../theme';
import {fonts} from '../../theme/fonts';
import {spacing} from '../../theme/spacing';

interface Props {
  label: string;
  selected?: boolean;
  onPress: () => void;
}

export function Chip({label, selected, onPress}: Props) {
  const {colors} = useTheme();
  return (
    <TouchableOpacity
      style={[
        styles.chip,
        {
          backgroundColor: selected ? colors.text : colors.surfaceElevated,
          borderColor: selected ? colors.text : colors.border,
        },
      ]}
      onPress={onPress}
      activeOpacity={0.7}
      hitSlop={{top: 4, bottom: 4}}>
      <Text
        style={[
          styles.label,
          {color: selected ? colors.background : colors.text},
        ]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 20,
    borderWidth: 1,
    minHeight: 36,
  },
  label: {
    fontSize: fonts.sizes.sm,
    fontWeight: '500',
  },
});
