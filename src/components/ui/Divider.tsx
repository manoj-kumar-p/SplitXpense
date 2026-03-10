import React from 'react';
import {View, StyleSheet} from 'react-native';
import {useTheme} from '../../theme';

interface Props {
  inset?: number;
}

export function Divider({inset = 0}: Props) {
  const {colors} = useTheme();
  return (
    <View
      style={[
        styles.divider,
        {backgroundColor: colors.border, marginLeft: inset},
      ]}
    />
  );
}

const styles = StyleSheet.create({
  divider: {
    height: StyleSheet.hairlineWidth,
  },
});
