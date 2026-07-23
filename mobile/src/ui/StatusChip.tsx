import { StyleSheet, View } from 'react-native';
import { radius, spacing, useTheme } from '../theme';
import { AppText } from './AppText';

type StatusChipTone = 'success' | 'warning' | 'neutral';

type StatusChipProps = {
  label: string;
  tone: StatusChipTone;
};

export function StatusChip({ label, tone }: StatusChipProps) {
  const { colors } = useTheme();

  let backgroundColor = colors.badgeBg;
  let textColor = colors.badgeText;

  switch (tone) {
    case 'success':
      backgroundColor = colors.badgeBg;
      textColor = colors.success;
      break;
    case 'warning':
      backgroundColor = colors.warningBannerBg;
      textColor = colors.warningBannerText;
      break;
    case 'neutral':
      backgroundColor = colors.badgeBg;
      textColor = colors.badgeText;
      break;
    default: {
      const _exhaustive: never = tone;
      return _exhaustive;
    }
  }

  return (
    <View style={[styles.root, { backgroundColor }]}>
      <AppText variant="caption" color={textColor}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    alignSelf: 'flex-start',
  },
});
