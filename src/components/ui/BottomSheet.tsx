import React from 'react';
import {View, Text, TouchableOpacity, TouchableWithoutFeedback, Pressable, Modal, StyleSheet} from 'react-native';
import {useTheme} from '../../theme';
import {fonts} from '../../theme/fonts';
import {spacing} from '../../theme/spacing';
import {radii} from '../../theme/radii';

interface Props {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}

export function BottomSheet({visible, onClose, title, children}: Props) {
  const {colors} = useTheme();
  return (
    <Modal visible={visible} transparent animationType="slide">
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={[styles.overlay, {backgroundColor: colors.modalOverlay}]}>
          <Pressable style={[styles.content, {backgroundColor: colors.surface}]} onPress={() => {}}>
              <View style={[styles.handle, {backgroundColor: colors.handleBar}]} />
              {title && (
                <Text style={[styles.title, {color: colors.text}]}>{title}</Text>
              )}
              {children}
              <TouchableOpacity style={styles.cancel} onPress={onClose}>
                <Text style={[styles.cancelText, {color: colors.textMuted}]}>
                  Cancel
                </Text>
              </TouchableOpacity>
            </Pressable>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  content: {
    maxHeight: '70%',
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.lg,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontSize: fonts.sizes.lg,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  cancel: {
    alignItems: 'center',
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
  },
  cancelText: {
    fontSize: fonts.sizes.base,
    fontWeight: '500',
  },
});
