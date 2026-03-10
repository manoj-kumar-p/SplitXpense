import React, {createContext, useContext, useState, useCallback, useRef} from 'react';
import {View, Text, TouchableOpacity, StyleSheet, Modal, Animated} from 'react-native';
import {useTheme} from '../theme';
import {fonts} from '../theme/fonts';
import {spacing} from '../theme/spacing';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

interface AlertButton {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
}

interface AlertConfig {
  title: string;
  message: string;
  buttons?: AlertButton[];
  icon?: string;
}

interface AlertContextType {
  showAlert: (config: AlertConfig) => void;
}

const AlertContext = createContext<AlertContextType>({showAlert: () => {}});

export function useAlert() {
  return useContext(AlertContext);
}

export function AlertProvider({children}: {children: React.ReactNode}) {
  const {colors} = useTheme();
  const [visible, setVisible] = useState(false);
  const [config, setConfig] = useState<AlertConfig | null>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;

  const showAlert = useCallback((cfg: AlertConfig) => {
    setConfig(cfg);
    setVisible(true);
    Animated.parallel([
      Animated.timing(fadeAnim, {toValue: 1, duration: 200, useNativeDriver: true}),
      Animated.spring(scaleAnim, {toValue: 1, tension: 65, friction: 10, useNativeDriver: true}),
    ]).start();
  }, [fadeAnim, scaleAnim]);

  const hideAlert = useCallback((callback?: () => void) => {
    Animated.timing(fadeAnim, {toValue: 0, duration: 150, useNativeDriver: true}).start(() => {
      setVisible(false);
      setConfig(null);
      scaleAnim.setValue(0.9);
      callback?.();
    });
  }, [fadeAnim, scaleAnim]);

  const getIcon = () => {
    if (config?.icon) return config.icon;
    const title = config?.title?.toLowerCase() || '';
    if (title.includes('error') || title.includes('cannot')) return 'alert-circle-outline';
    if (title.includes('success') || title.includes('saved') || title.includes('sent')) return 'check-circle-outline';
    if (title.includes('remove') || title.includes('delete')) return 'trash-can-outline';
    if (title.includes('permission') || title.includes('denied')) return 'shield-alert-outline';
    return 'information-outline';
  };

  const getIconColor = () => {
    const title = config?.title?.toLowerCase() || '';
    if (title.includes('error') || title.includes('cannot') || title.includes('denied')) return colors.negative;
    if (title.includes('success') || title.includes('saved') || title.includes('sent')) return colors.positive;
    if (title.includes('remove') || title.includes('delete')) return colors.negative;
    return colors.text;
  };

  const buttons = config?.buttons || [{text: 'OK', style: 'default'}];

  return (
    <AlertContext.Provider value={{showAlert}}>
      {children}
      <Modal visible={visible} transparent statusBarTranslucent animationType="none">
        <Animated.View style={[styles.overlay, {opacity: fadeAnim}]}>
          <Animated.View style={[
            styles.dialog,
            {backgroundColor: colors.surface, transform: [{scale: scaleAnim}]},
          ]}>
            {/* Icon */}
            <View style={[styles.iconCircle, {backgroundColor: getIconColor() + '15'}]}>
              <Icon name={getIcon()} size={28} color={getIconColor()} />
            </View>

            {/* Title */}
            <Text style={[styles.title, {color: colors.text}]}>{config?.title}</Text>

            {/* Message */}
            <Text style={[styles.message, {color: colors.textSecondary}]}>{config?.message}</Text>

            {/* Buttons */}
            <View style={styles.buttonRow}>
              {buttons.map((btn, i) => {
                const isDestructive = btn.style === 'destructive';
                const isCancel = btn.style === 'cancel';
                const isPrimary = !isCancel && !isDestructive && buttons.length > 1 && i === buttons.length - 1;
                return (
                  <TouchableOpacity
                    key={i}
                    style={[
                      styles.button,
                      buttons.length === 1 && styles.singleButton,
                      isCancel && {backgroundColor: colors.surfaceElevated},
                      isDestructive && {backgroundColor: colors.negative + '15'},
                      isPrimary && {backgroundColor: colors.text},
                      !isCancel && !isDestructive && !isPrimary && {backgroundColor: colors.text},
                    ]}
                    activeOpacity={0.7}
                    onPress={() => hideAlert(btn.onPress)}>
                    <Text style={[
                      styles.buttonText,
                      isCancel && {color: colors.textMuted},
                      isDestructive && {color: colors.negative},
                      isPrimary && {color: colors.background},
                      !isCancel && !isDestructive && !isPrimary && {color: colors.background},
                    ]}>
                      {btn.text}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </Animated.View>
        </Animated.View>
      </Modal>
    </AlertContext.Provider>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing['2xl'],
  },
  dialog: {
    width: '100%',
    maxWidth: 320,
    borderRadius: 20,
    padding: spacing.xl,
    alignItems: 'center',
  },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontSize: fonts.sizes.lg,
    fontWeight: '700',
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  message: {
    fontSize: fonts.sizes.base,
    lineHeight: 21,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    width: '100%',
  },
  button: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  singleButton: {
    flex: 1,
  },
  buttonText: {
    fontSize: fonts.sizes.base,
    fontWeight: '600',
  },
});
