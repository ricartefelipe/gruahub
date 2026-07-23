import { ActivityIndicator, View } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuthStore } from '../src/store/authStore';
import { useTheme } from '../src/theme';

export default function Index() {
  const { accessToken, isRestoring } = useAuthStore();
  const { colors } = useTheme();
  if (isRestoring) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.header }}>
        <ActivityIndicator color={colors.headerText} size="large" />
      </View>
    );
  }
  return <Redirect href={accessToken ? '/(tabs)' : '/login'} />;
}
