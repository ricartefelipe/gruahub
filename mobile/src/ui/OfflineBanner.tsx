import { StyleSheet, View } from 'react-native';
import { spacing, useTheme } from '../theme';
import { AppText } from './AppText';

type OfflineBannerProps = {
  message: string | null;
};

export function OfflineBanner({ message }: OfflineBannerProps) {
  const { colors } = useTheme();

  if (message == null) return null;

  return (
    <View
      accessibilityRole="text"
      style={[styles.root, { backgroundColor: colors.warningBannerBg }]}
    >
      <AppText variant="caption" color={colors.warningBannerText}>
        {message}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
});
