import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Vibration,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { radius, spacing, touchTarget, useTheme } from '../theme';
import { AppText } from './AppText';

type AppButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

type AppButtonProps = {
  label: string;
  onPress: () => void;
  variant?: AppButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function AppButton({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  style,
}: AppButtonProps) {
  const { colors } = useTheme();
  const isDisabled = disabled || loading;

  let backgroundColor: string;
  let textColor: string;
  let borderColor: string;

  switch (variant) {
    case 'primary':
      backgroundColor = colors.primary;
      textColor = colors.headerText;
      borderColor = 'transparent';
      break;
    case 'secondary':
      backgroundColor = colors.surface;
      textColor = colors.text;
      borderColor = colors.border;
      break;
    case 'ghost':
      backgroundColor = 'transparent';
      textColor = colors.primary;
      borderColor = 'transparent';
      break;
    case 'danger':
      backgroundColor = colors.dangerBg;
      textColor = colors.dangerText;
      borderColor = colors.dangerText;
      break;
    default: {
      const _exhaustive: never = variant;
      return _exhaustive;
    }
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      onPress={() => {
        Vibration.vibrate(10);
        onPress();
      }}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor,
          borderColor,
          opacity: isDisabled ? 0.5 : pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <AppText variant="cta" color={textColor}>
          {label}
        </AppText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: touchTarget.min,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
