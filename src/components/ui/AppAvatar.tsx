import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {useTheme} from '../../theme';
import {fonts} from '../../theme/fonts';

type Size = 'xs' | 'sm' | 'md' | 'lg';

const SIZES: Record<Size, number> = {xs: 28, sm: 36, md: 44, lg: 64};
const FONT_SIZES: Record<Size, number> = {xs: 12, sm: 13, md: fonts.sizes.lg, lg: fonts.sizes['2xl']};

interface Props {
  name: string;
  size?: Size;
  inverted?: boolean;
}

export function AppAvatar({name, size = 'sm', inverted}: Props) {
  const {colors} = useTheme();
  const dim = SIZES[size];
  const initial = (name || '?').charAt(0).toUpperCase();

  return (
    <View
      style={[
        styles.avatar,
        {
          width: dim,
          height: dim,
          borderRadius: dim / 2,
          backgroundColor: inverted ? colors.text : colors.surfaceElevated,
        },
      ]}>
      <Text
        style={{
          color: inverted ? colors.background : colors.text,
          fontWeight: '600',
          fontSize: FONT_SIZES[size],
        }}>
        {initial}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
