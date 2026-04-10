import React, {useRef} from 'react';
import {
  Pressable,
  Text,
  ActivityIndicator,
  StyleSheet,
  Animated,
  type ViewStyle,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {useTheme} from '../../theme';
import {fonts} from '../../theme/fonts';
import {spacing} from '../../theme/spacing';
import {radii} from '../../theme/radii';

type Variant = 'primary' | 'secondary' | 'danger' | 'outline';

interface Props {
  title: string;
  onPress: () => void;
  variant?: Variant;
  icon?: string;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}

export function AppButton({
  title,
  onPress,
  variant = 'primary',
  icon,
  loading,
  disabled,
  style,
}: Props) {
  const {colors} = useTheme();
  const scale = useRef(new Animated.Value(1)).current;

  const bg: Record<Variant, string> = {
    primary: colors.text,
    secondary: colors.surfaceElevated,
    danger: 'transparent',
    outline: 'transparent',
  };

  const fg: Record<Variant, string> = {
    primary: colors.background,
    secondary: colors.text,
    danger: colors.negative,
    outline: colors.text,
  };

  const borderColor: Record<Variant, string> = {
    primary: 'transparent',
    secondary: 'transparent',
    danger: colors.negative,
    outline: colors.border,
  };

  const onPressIn = () => {
    Animated.spring(scale, {
      toValue: 0.97,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4,
    }).start();
  };

  const onPressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4,
    }).start();
  };

  return (
    <Pressable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      disabled={disabled || loading}>
      <Animated.View
        style={[
          styles.button,
          {
            backgroundColor: bg[variant],
            borderColor: borderColor[variant],
            opacity: disabled ? 0.5 : 1,
            transform: [{scale}],
          },
          style,
        ]}>
        {loading ? (
          <ActivityIndicator size="small" color={fg[variant]} />
        ) : (
          <>
            {icon && <Icon name={icon} size={20} color={fg[variant]} />}
            <Text style={[styles.text, {color: fg[variant]}]}>{title}</Text>
          </>
        )}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
    borderWidth: 1,
    paddingVertical: 16,
    gap: spacing.sm,
  },
  text: {
    fontSize: fonts.sizes.md,
    fontWeight: '600',
  },
});
