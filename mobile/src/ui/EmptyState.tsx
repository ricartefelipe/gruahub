import { StyleSheet, View } from 'react-native';
import { spacing, useTheme } from '../theme';
import { AppButton } from './AppButton';
import { AppText } from './AppText';

type EmptyStateProps = {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  const { colors } = useTheme();

  return (
    <View style={styles.root}>
      <AppText variant="title" style={styles.title}>
        {title}
      </AppText>
      {description ? (
        <AppText
          variant="body"
          color={colors.textSecondary}
          style={styles.description}
        >
          {description}
        </AppText>
      ) : null}
      {actionLabel && onAction ? (
        <AppButton
          label={actionLabel}
          onPress={onAction}
          variant="secondary"
          style={styles.action}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    padding: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { textAlign: 'center' },
  description: { textAlign: 'center', marginTop: spacing.sm },
  action: { marginTop: spacing.md, alignSelf: 'stretch' },
});
