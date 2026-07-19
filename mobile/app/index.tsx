import { Redirect } from 'expo-router';
import { useAuthStore } from '../src/store/authStore';

export default function Index() {
  const { accessToken, isRestoring } = useAuthStore();
  if (isRestoring) return null;
  return <Redirect href={accessToken ? '/(tabs)' : '/login'} />;
}
