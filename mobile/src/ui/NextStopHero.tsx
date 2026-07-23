import { Pressable, StyleSheet, View } from 'react-native';
import { radius, spacing, touchTarget, useTheme } from '../theme';
import { openMapsForStop } from '../location/openMaps';
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
          backgroundColor: colors.header,
          shadowColor: colors.shadow,
        },
      ]}
    >
      <AppText variant="caption" color={colors.headerMuted}>
        {indexLabel ?? 'AGORA'}
      </AppText>
      <AppText variant="hero" color={colors.headerText}>
        {pointName}
      </AppText>
      {address ? (
        <AppText variant="body" color={colors.headerMuted}>
          {address}
        </AppText>
      ) : null}
      {reason ? (
        <AppText variant="caption" color={colors.primaryMuted}>
          {reason}
        </AppText>
      ) : null}
      <AppButton
        label="Iniciar visita"
        variant="secondary"
        onPress={onStart}
        style={styles.cta}
      />
      {address || pointName ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Abrir no mapa"
          onPress={() => {
            void openMapsForStop({ address, pointName });
          }}
          style={styles.mapBtn}
        >
          <AppText variant="cta" color={colors.headerMuted}>
            Abrir no mapa
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    marginHorizontal: spacing.md,
    marginVertical: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.lg,
    gap: spacing.sm,
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 4,
  },
  cta: { marginTop: spacing.sm },
  mapBtn: {
    minHeight: touchTarget.min,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
