import { StyleSheet, View } from 'react-native';
import { radius, spacing, useTheme } from '../theme';
import { getVisitStep } from './visitSteps';
import { AppText } from './AppText';

type VisitStepHeaderProps = {
  step: 1 | 2 | 3 | 4;
  pointName: string;
};

export function VisitStepHeader({ step, pointName }: VisitStepHeaderProps) {
  const { colors } = useTheme();
  const { title } = getVisitStep(step);

  return (
    <View style={styles.root}>
      <View style={styles.segments}>
        {([1, 2, 3, 4] as const).map((n) => {
          const active = n <= step;
          return (
            <View
              key={n}
              style={[
                styles.segment,
                {
                  backgroundColor: active ? colors.primary : colors.border,
                },
              ]}
            />
          );
        })}
      </View>
      <AppText variant="caption" color={colors.textSecondary}>
        {`Passo ${step} de 4 · ${title}`}
      </AppText>
      <AppText variant="title">{pointName}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  segments: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  segment: {
    flex: 1,
    height: 4,
    borderRadius: radius.full,
  },
});
