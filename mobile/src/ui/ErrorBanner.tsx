import { StyleSheet, View } from 'react-native';
import { radius, spacing, useTheme } from '../theme';
import { AppText } from './AppText';

type ErrorBannerProps = {
  message: string;
};

export function ErrorBanner({ message }: ErrorBannerProps) {
  const { colors } = useTheme();

  return (
    <View
      accessibilityRole="alert"
      style={[styles.root, { backgroundColor: colors.errorBannerBg }]}
    >
      <AppText variant="body" color={colors.errorBannerText}>
        {message}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    marginHorizontal: spacing.md,
    marginVertical: spacing.sm,
  },
});
