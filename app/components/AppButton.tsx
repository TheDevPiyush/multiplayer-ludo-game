import { ReactNode } from 'react';
import { Pressable, StyleProp, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';

type AppButtonProps = {
  label: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary';
  leftIcon?: ReactNode;
  style?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
  disabled?: boolean;
};

export function AppButton({
  label,
  onPress,
  variant = 'primary',
  leftIcon,
  style,
  labelStyle,
  disabled = false,
}: AppButtonProps) {
  const scheme = useColorScheme() ?? 'dark';
  const palette = Colors[scheme];
  const isPrimary = variant === 'primary';

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: isPrimary ? palette.buttonPrimaryBg : palette.buttonSecondaryBg,
          borderColor: isPrimary ? palette.buttonPrimaryBg : palette.buttonSecondaryBorder,
          opacity: pressed || disabled ? 0.88 : 1,
        },
        style,
      ]}>
      <View style={styles.content}>
        {leftIcon ? <View style={styles.iconWrap}>{leftIcon}</View> : null}
        <Text
          style={[
            styles.label,
            { color: isPrimary ? palette.buttonPrimaryText : palette.buttonSecondaryText },
            labelStyle,
          ]}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    width: '100%',
    borderRadius: 14,
    borderWidth: 1.5,
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrap: {
    marginRight: 10,
  },
  label: {
    fontSize: 13.5,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});
