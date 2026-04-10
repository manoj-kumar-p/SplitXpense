import React from 'react';
import {View, Text, TouchableOpacity, StyleSheet} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {useTheme} from '../../theme';
import {fonts} from '../../theme/fonts';
import {spacing} from '../../theme/spacing';

interface Props {
  icon: string;
  title: string;
  subtitle?: string;
  ctaLabel?: string;
  onCtaPress?: () => void;
}

export function EmptyState({icon, title, subtitle, ctaLabel, onCtaPress}: Props) {
  const {colors} = useTheme();
  return (
    <View style={styles.container}>
      <Icon name={icon} size={48} color={colors.textMuted} />
      <Text style={[styles.title, {color: colors.textMuted}]}>{title}</Text>
      {subtitle && (
        <Text style={[styles.subtitle, {color: colors.textMuted}]}>{subtitle}</Text>
      )}
      {ctaLabel && onCtaPress && (
        <TouchableOpacity
          style={[styles.cta, {borderColor: colors.border}]}
          onPress={onCtaPress}
          activeOpacity={0.7}>
          <Text style={{fontSize: fonts.sizes.base, fontWeight: '600', color: colors.text}}>
            {ctaLabel}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing['2xl'],
  },
  title: {
    fontSize: fonts.sizes.md,
  },
  subtitle: {
    fontSize: fonts.sizes.base,
  },
  cta: {
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    marginTop: spacing.md,
  },
});
