import { Pressable, StyleSheet, View } from 'react-native';
import { radius, spacing, touchTarget, useTheme } from '../theme';
import { AppText } from './AppText';

type SyncQueueRowProps = {
  title: string;
  statusLabel: string;
  statusColor: string;
  statusBg: string;
  subtitle?: string;
  onRetry?: () => void;
};

export function SyncQueueRow({
  title,
  statusLabel,
  statusColor,
  statusBg,
  subtitle,
  onRetry,
}: SyncQueueRowProps) {
  const { colors } = useTheme();

  return (
    <View
      style={[
        styles.root,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
        },
      ]}
    >
      <View style={styles.header}>
        <AppText variant="body" style={styles.title}>
          {title}
        </AppText>
        <View style={[styles.badge, { backgroundColor: statusBg }]}>
          <AppText variant="caption" color={statusColor}>
            {statusLabel}
          </AppText>
        </View>
      </View>
      {subtitle ? (
        <AppText variant="caption" color={colors.textMuted}>
          {subtitle}
        </AppText>
      ) : null}
      {onRetry ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Re-tentar operação"
          onPress={onRetry}
          style={({ pressed }) => [
            styles.retry,
            {
              backgroundColor: colors.primary,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
          <AppText variant="cta" color={colors.headerText}>
            Re-tentar
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    marginHorizontal: spacing.md,
    marginVertical: spacing.xs,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  title: { flex: 1 },
  badge: {
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    flexShrink: 0,
  },
  retry: {
    minHeight: touchTarget.min,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
});
