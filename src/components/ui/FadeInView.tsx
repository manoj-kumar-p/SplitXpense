import React, {useEffect, useRef} from 'react';
import {Animated, type ViewStyle} from 'react-native';

interface Props {
  index: number;
  children: React.ReactNode;
  delay?: number;
  style?: ViewStyle;
}

export function FadeInView({index, children, delay = 50, style}: Props) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: 300,
      delay: index * delay,
      useNativeDriver: true,
    }).start();
  }, []);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: anim,
          transform: [
            {
              translateY: anim.interpolate({
                inputRange: [0, 1],
                outputRange: [12, 0],
              }),
            },
          ],
        },
      ]}>
      {children}
    </Animated.View>
  );
}
