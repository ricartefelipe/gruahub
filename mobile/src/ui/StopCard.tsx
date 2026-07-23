import { Pressable, StyleSheet, View } from 'react-native';
import { radius, spacing, touchTarget, useTheme } from '../theme';
import { AppText } from './AppText';

type StopCardProps = {
  pointName: string;
  address?: string;
  score?: number;
  onPress: () => void;
};

export function StopCard({ pointName, address, score, onPress }: StopCardProps) {
  const { colors } = useTheme();

  const scoreColor =
    score == null
      ? colors.textMuted
      : score >= 70
        ? colors.scoreHigh
        : score >= 40
          ? colors.scoreMed
          : colors.scoreLow;

  const accessibilityLabel = [
    pointName,
    score != null ? `pontuação ${score}` : null,
    address || null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [
        styles.root,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <View style={styles.main}>
        <AppText variant="title">{pointName}</AppText>
        {address ? (
          <AppText variant="caption" color={colors.textSecondary}>
            {address}
          </AppText>
        ) : null}
      </View>
      {score != null ? (
        <AppText variant="caption" color={scoreColor}>
          {String(score)}
        </AppText>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    minHeight: touchTarget.min,
    marginHorizontal: spacing.md,
    marginVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  main: { flex: 1, gap: spacing.xs },
});
