import React from 'react';
import {View, Text, TextInput, StyleSheet, type KeyboardTypeOptions} from 'react-native';
import {useTheme} from '../../theme';
import {fonts} from '../../theme/fonts';
import {spacing} from '../../theme/spacing';
import {radii} from '../../theme/radii';

interface Props {
  label?: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  multiline?: boolean;
  numberOfLines?: number;
  autoFocus?: boolean;
  leftElement?: React.ReactNode;
}

export function AppInput({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  multiline,
  numberOfLines,
  autoFocus,
  leftElement,
}: Props) {
  const {colors} = useTheme();

  return (
    <View>
      {label && <Text style={[styles.label, {color: colors.textSecondary}]}>{label}</Text>}
      <View
        style={[
          styles.inputWrapper,
          {backgroundColor: colors.surface, borderColor: colors.border},
          multiline && styles.multiline,
        ]}>
        {leftElement}
        <TextInput
          style={[
            styles.input,
            {color: colors.text},
            multiline && styles.multilineInput,
          ]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.placeholder}
          keyboardType={keyboardType}
          multiline={multiline}
          numberOfLines={numberOfLines}
          autoFocus={autoFocus}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: fonts.sizes.sm,
    fontWeight: '500',
    marginBottom: 6,
    marginTop: spacing.base,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radii.md,
    paddingHorizontal: spacing.base,
  },
  input: {
    flex: 1,
    paddingVertical: 14,
    fontSize: fonts.sizes.md,
  },
  multiline: {
    minHeight: 80,
    alignItems: 'flex-start',
  },
  multilineInput: {
    textAlignVertical: 'top',
  },
});
