import { StyleSheet, View } from 'react-native';
import { radius, spacing, useTheme } from '../theme';
import { AppButton } from './AppButton';
import { AppText } from './AppText';

type NextStopHeroProps = {
  pointName: string;
  address?: string;
  reason?: string;
  indexLabel?: string;
  onStart: () => void;
};

export function NextStopHero({
  pointName,
  address,
  reason,
  indexLabel,
  onStart,
}: NextStopHeroProps) {
  const { colors } = useTheme();

  return (
    <View
      style={[
        styles.root,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          shadowColor: colors.shadow,
        },
      ]}
    >
      {indexLabel ? (
        <AppText variant="caption" color={colors.primary}>
          {indexLabel}
        </AppText>
      ) : null}
      <AppText variant="hero">{pointName}</AppText>
      {address ? (
        <AppText variant="body" color={colors.textSecondary}>
          {address}
        </AppText>
      ) : null}
      {reason ? (
        <AppText variant="caption" color={colors.textMuted}>
          {reason}
        </AppText>
      ) : null}
      <AppButton label="Iniciar visita" onPress={onStart} style={styles.cta} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    marginHorizontal: spacing.md,
    marginVertical: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.sm,
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  cta: { marginTop: spacing.sm },
});
