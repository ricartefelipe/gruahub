import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { spacing, useTheme } from '../theme';
import { AppText } from './AppText';

type LoadingBlockProps = {
  message?: string;
};

export function LoadingBlock({ message = 'Carregando…' }: LoadingBlockProps) {
  const { colors } = useTheme();

  return (
    <View style={styles.root}>
      <ActivityIndicator color={colors.primary} size="large" />
      <AppText
        variant="body"
        color={colors.textSecondary}
        style={styles.message}
      >
        {message}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    padding: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  message: { textAlign: 'center' },
});
