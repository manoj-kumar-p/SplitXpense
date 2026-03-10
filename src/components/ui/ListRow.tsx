import React from 'react';
import {View, Text, TouchableOpacity, StyleSheet} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {useTheme} from '../../theme';
import {fonts} from '../../theme/fonts';
import {spacing} from '../../theme/spacing';

interface Props {
  icon: string;
  label: string;
  value?: string;
  onPress?: () => void;
  rightElement?: React.ReactNode;
}

export function ListRow({icon, label, value, onPress, rightElement}: Props) {
  const {colors} = useTheme();

  const inner = (
    <View style={styles.row}>
      <View style={[styles.iconWrap, {backgroundColor: colors.surfaceElevated}]}>
        <Icon name={icon} size={18} color={colors.text} />
      </View>
      <Text style={[styles.label, {color: colors.text}]}>{label}</Text>
      <View style={styles.right}>
        {rightElement || (
          <>
            {value ? (
              <Text style={[styles.value, {color: colors.textMuted}]}>
                {value}
              </Text>
            ) : null}
            {onPress ? (
              <Icon name="chevron-right" size={20} color={colors.textMuted} />
            ) : null}
          </>
        )}
      </View>
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity activeOpacity={0.7} onPress={onPress}>
        {inner}
      </TouchableOpacity>
    );
  }
  return inner;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: spacing.base,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  label: {
    flex: 1,
    fontSize: fonts.sizes.base,
    fontWeight: '400',
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  value: {
    fontSize: fonts.sizes.sm,
  },
});
