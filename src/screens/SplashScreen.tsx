import React, {useEffect, useRef} from 'react';
import {View, Text, StyleSheet, Animated} from 'react-native';
import {useTheme} from '../theme';
import {fonts} from '../theme/fonts';
import {spacing} from '../theme/spacing';

interface Props {
  onFinish: () => void;
}

const S = 200;
const R = S * 0.22;
const GAP = S * 0.016;
const OFF = S * 0.012;
const FONT = S * 0.34;
const WRAP_W = R * 2 + GAP * 2 + 8;
const WRAP_H = R * 2 + OFF * 2 + 4;
const CX = WRAP_W / 2;
const CY = WRAP_H / 2;

export default function SplashScreen({onFinish}: Props) {
  const {colors} = useTheme();

  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.8)).current;
  const splitAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const entryAnim = Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        tension: 60,
        friction: 8,
        useNativeDriver: true,
      }),
    ]);

    const splitAnimation = Animated.spring(splitAnim, {
      toValue: 1,
      tension: 25,
      friction: 12,
      useNativeDriver: true,
    });

    entryAnim.start(() => {
      splitAnimation.start();
    });

    const timer = setTimeout(onFinish, 2200);
    return () => {
      clearTimeout(timer);
      entryAnim.stop();
      splitAnimation.stop();
    };
  }, []);

  const leftX = splitAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -5],
  });
  const leftY = splitAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -3],
  });
  const rightX = splitAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 5],
  });
  const rightY = splitAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 3],
  });

  return (
    <View style={[styles.container, {backgroundColor: colors.background}]}>
      <Animated.View style={[styles.logoContainer, {opacity, transform: [{scale}]}]}>
        <View style={styles.coinWrap}>
          <Animated.View
            style={[
              styles.halfLeft,
              {backgroundColor: colors.text, transform: [{translateX: leftX}, {translateY: leftY}]},
            ]}
          />
          <Animated.View
            style={[
              styles.halfRight,
              {backgroundColor: colors.text, transform: [{translateX: rightX}, {translateY: rightY}]},
            ]}
          />
          <View style={styles.dollarWrap}>
            <Text style={[styles.dollar, {color: colors.background}]}>$</Text>
          </View>
        </View>

        <Text style={[styles.appName, {color: colors.text}]}>SplitXpense</Text>
        <Text style={[styles.tagline, {color: colors.textMuted}]}>
          Split expenses. No internet needed.
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoContainer: {
    alignItems: 'center',
  },
  coinWrap: {
    width: WRAP_W,
    height: WRAP_H,
    marginBottom: spacing['2xl'],
  },
  dollarWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dollar: {
    fontSize: FONT,
    fontWeight: '400',
    fontFamily: 'serif',
  },
  halfLeft: {
    position: 'absolute',
    width: R,
    height: R * 2,
    borderTopLeftRadius: R,
    borderBottomLeftRadius: R,
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0,
    left: CX - R - GAP,
    top: CY - R - OFF,
  },
  halfRight: {
    position: 'absolute',
    width: R,
    height: R * 2,
    borderTopRightRadius: R,
    borderBottomRightRadius: R,
    borderTopLeftRadius: 0,
    borderBottomLeftRadius: 0,
    left: CX + GAP,
    top: CY - R + OFF,
  },
  appName: {
    fontSize: fonts.sizes['4xl'],
    fontWeight: fonts.weights.bold,
    letterSpacing: 1,
  },
  tagline: {
    fontSize: fonts.sizes.base,
    marginTop: spacing.sm,
  },
});
