import { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { spacing, useTheme } from '../theme';
import { AppText } from './AppText';

type AppHeaderProps = {
  title: string;
  subtitle?: string;
  rightSlot?: ReactNode;
};

export function AppHeader({ title, subtitle, rightSlot }: AppHeaderProps) {
  const { colors } = useTheme();

  return (
    <View style={[styles.root, { backgroundColor: colors.header }]}>
      <View style={styles.textBlock}>
        <AppText variant="title" color={colors.headerText}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText
            variant="caption"
            color={colors.headerMuted}
            style={styles.subtitle}
          >
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {rightSlot ? <View style={styles.right}>{rightSlot}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xl + spacing.md,
    paddingBottom: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  textBlock: { flex: 1 },
  subtitle: { marginTop: spacing.xs },
  right: { flexShrink: 0 },
});
