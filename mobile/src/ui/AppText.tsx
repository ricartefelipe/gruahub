import { Text, type TextProps, type TextStyle } from 'react-native';
import { typography, useTheme } from '../theme';

type AppTextVariant = keyof typeof typography;

type AppTextProps = TextProps & {
  variant?: AppTextVariant;
  color?: string;
};

export function AppText({
  variant = 'body',
  color,
  style,
  children,
  ...rest
}: AppTextProps) {
  const { colors } = useTheme();
  const variantStyle = typography[variant] as TextStyle;

  return (
    <Text
      style={[variantStyle, { color: color ?? colors.text }, style]}
      {...rest}
    >
      {children}
    </Text>
  );
}
