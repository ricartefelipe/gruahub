/**
 * Tela de login com OIDC PKCE via Keycloak + Expo AuthSession.
 * Armazena o access_token no Zustand (em memória), sem persistência de token.
 */

import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri, useAuthRequest, exchangeCodeAsync } from 'expo-auth-session';
import { useEffect } from 'react';
import { router } from 'expo-router';
import { useAuthStore } from '../../src/store/authStore';

WebBrowser.maybeCompleteAuthSession();

const KEYCLOAK_BASE = process.env.EXPO_PUBLIC_KEYCLOAK_URL || 'http://localhost:8180';
const REALM = process.env.EXPO_PUBLIC_KEYCLOAK_REALM || 'gruahub';
const CLIENT_ID = process.env.EXPO_PUBLIC_KEYCLOAK_CLIENT_ID || 'gruahub-mobile';

const discovery = {
  authorizationEndpoint: `${KEYCLOAK_BASE}/realms/${REALM}/protocol/openid-connect/auth`,
  tokenEndpoint: `${KEYCLOAK_BASE}/realms/${REALM}/protocol/openid-connect/token`,
  revocationEndpoint: `${KEYCLOAK_BASE}/realms/${REALM}/protocol/openid-connect/logout`,
};

function parseJwtPayload(token: string): Record<string, any> {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(base64));
  } catch {
    return {};
  }
}

export default function LoginScreen() {
  const { setAuth, accessToken } = useAuthStore();

  const redirectUri = makeRedirectUri({ scheme: 'gruahub', path: 'auth' });

  const [request, response, promptAsync] = useAuthRequest(
    {
      clientId: CLIENT_ID,
      scopes: ['openid', 'profile', 'email', 'offline_access'],
      redirectUri,
      usePKCE: true,
    },
    discovery
  );

  // Redireciona se já autenticado
  useEffect(() => {
    if (accessToken) {
      router.replace('/(tabs)');
    }
  }, [accessToken]);

  // Processa resposta OIDC
  useEffect(() => {
    if (response?.type === 'success' && request?.codeVerifier) {
      const { code } = response.params;

      exchangeCodeAsync(
        {
          clientId: CLIENT_ID,
          code,
          redirectUri,
          extraParams: { code_verifier: request.codeVerifier },
        },
        discovery
      )
        .then((tokenResponse) => {
          const claims = parseJwtPayload(tokenResponse.accessToken);
          const tenantId: string = claims['tenant_id'] || '';
          const email: string = claims['email'] || claims['preferred_username'] || '';
          const userId: string = claims['sub'] || '';

          setAuth(tokenResponse.accessToken, tenantId, email, userId);
          router.replace('/(tabs)');
        })
        .catch((err) => {
          console.error('[Auth] Token exchange failed:', err);
          Alert.alert('Erro de autenticação', 'Não foi possível obter o token. Tente novamente.');
        });
    } else if (response?.type === 'error') {
      Alert.alert('Erro de autenticação', response.error?.message || 'Falha no fluxo de login.');
    }
  }, [response]);

  async function handleLogin() {
    try {
      await promptAsync();
    } catch (err: any) {
      Alert.alert('Erro', err.message || 'Não foi possível abrir o navegador de autenticação.');
    }
  }

  const isLoading = !request;

  return (
    <View style={styles.container}>
      <View style={styles.brand}>
        <Text style={styles.logo}>🏗️</Text>
        <Text style={styles.appName}>GruaHub</Text>
        <Text style={styles.tagline}>Gestão de Gruas no Campo</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Acesso do Operador</Text>
        <Text style={styles.cardDesc}>
          Faça login com sua conta GruaHub para acessar a rota do dia, registrar visitas e
          sincronizar dados mesmo sem conexão.
        </Text>

        {isLoading ? (
          <ActivityIndicator size="large" color="#2563eb" style={{ marginTop: 24 }} />
        ) : (
          <TouchableOpacity
            style={styles.button}
            onPress={handleLogin}
            accessibilityLabel="Entrar com Keycloak"
            accessibilityRole="button"
          >
            <Text style={styles.buttonText}>Entrar com Keycloak</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.offlineNote}>
        <Text style={styles.offlineNoteText}>
          📵 Após o primeiro login, o app funciona offline. Operações são sincronizadas
          automaticamente ao reconectar.
        </Text>
      </View>

      <Text style={styles.version}>GruaHub Mobile v1.0.0-mvp</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1, backgroundColor: '#1e40af', alignItems: 'center',
    justifyContent: 'center', padding: 24,
  },
  brand: { alignItems: 'center', marginBottom: 40 },
  logo: { fontSize: 56 },
  appName: { fontSize: 32, fontWeight: 'bold', color: '#fff', marginTop: 8 },
  tagline: { fontSize: 14, color: '#bfdbfe', marginTop: 4 },
  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 24, width: '100%',
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 12, elevation: 8,
  },
  cardTitle: { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 8 },
  cardDesc: { fontSize: 14, color: '#6b7280', lineHeight: 20 },
  button: {
    backgroundColor: '#2563eb', borderRadius: 10, padding: 16,
    alignItems: 'center', marginTop: 24,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  offlineNote: {
    marginTop: 24, backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 10, padding: 14,
  },
  offlineNoteText: { color: '#bfdbfe', fontSize: 13, lineHeight: 18, textAlign: 'center' },
  version: { marginTop: 32, color: '#93c5fd', fontSize: 11 },
});
