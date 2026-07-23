import { Alert, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { spacing, useTheme } from '../../src/theme';
import {
  Screen,
  AppHeader,
  VisitStepHeader,
  AppButton,
  AppText,
} from '../../src/ui';

export default function StockStepScreen() {
  const { visitId, pointName } = useLocalSearchParams<{
    visitId: string;
    pointName: string;
  }>();
  const { colors } = useTheme();

  function goToComplete() {
    router.replace({
      pathname: '/visits/complete',
      params: { visitId, pointName },
    });
  }

  function handleScanQr() {
    router.push({
      pathname: '/qr-scan',
      params: { visitId, pointName, returnTo: 'stock-step' },
    });
  }

  function handleSkip() {
    Alert.alert(
      'Pular reposição?',
      'Nenhuma reposição será registrada neste ponto. Deseja continuar?',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Pular', style: 'destructive', onPress: goToComplete },
      ]
    );
  }

  return (
    <Screen>
      <AppHeader title="Estoque / QR" subtitle="Reposição no ponto" />
      <VisitStepHeader step={3} pointName={pointName ?? ''} />

      <View style={styles.body}>
        <AppText variant="body" color={colors.textSecondary} style={styles.copy}>
          Se não houver reposição neste ponto, pode pular.
        </AppText>

        <AppButton label="Escanear QR" onPress={handleScanQr} />
        <AppButton
          label="Pular"
          variant="secondary"
          onPress={handleSkip}
          style={styles.skip}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
    padding: spacing.md,
    gap: spacing.md,
  },
  copy: {
    marginBottom: spacing.sm,
  },
  skip: {
    marginTop: spacing.xs,
  },
});
