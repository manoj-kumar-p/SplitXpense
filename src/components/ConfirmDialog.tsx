import React from 'react';
import {View, Text, TouchableOpacity, Modal, StyleSheet} from 'react-native';
import {useTheme} from '../theme';
import {fonts} from '../theme/fonts';
import {spacing} from '../theme/spacing';

interface Props {
  visible: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  visible,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  destructive = false,
  onConfirm,
  onCancel,
}: Props) {
  const {colors} = useTheme();

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={[styles.dialog, {backgroundColor: colors.surface, borderColor: colors.border}]}>
          <Text style={[styles.title, {color: colors.text}]}>{title}</Text>
          <Text style={[styles.message, {color: colors.textSecondary}]}>{message}</Text>

          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.button, {borderColor: colors.border}]}
              onPress={onCancel}>
              <Text style={[styles.buttonText, {color: colors.textSecondary}]}>{cancelText}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.button,
                styles.confirmButton,
                {backgroundColor: destructive ? colors.danger : colors.primary},
              ]}
              onPress={onConfirm}>
              <Text style={[styles.buttonText, {color: colors.textInverse}]}>{confirmText}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  dialog: {
    width: '100%',
    borderRadius: 16,
    padding: spacing.xl,
    borderWidth: 1,
  },
  title: {
    fontSize: fonts.sizes.lg,
    fontWeight: fonts.weights.bold,
    marginBottom: spacing.sm,
  },
  message: {
    fontSize: fonts.sizes.base,
    lineHeight: 22,
    marginBottom: spacing.xl,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  button: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  confirmButton: {
    borderWidth: 0,
  },
  buttonText: {
    fontSize: fonts.sizes.base,
    fontWeight: fonts.weights.semibold,
  },
});
