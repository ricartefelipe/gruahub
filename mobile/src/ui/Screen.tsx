import { ReactNode } from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';
import { spacing, useTheme } from '../theme';

type ScreenProps = ViewProps & {
  children: ReactNode;
  padded?: boolean;
};

export function Screen({ children, padded = false, style, ...rest }: ScreenProps) {
  const { colors } = useTheme();

  return (
    <View
      style={[
        styles.root,
        { backgroundColor: colors.background },
        padded && styles.padded,
        style,
      ]}
      {...rest}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  padded: { padding: spacing.md },
});
