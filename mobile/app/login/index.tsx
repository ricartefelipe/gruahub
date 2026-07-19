import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri, useAuthRequest, exchangeCodeAsync } from 'expo-auth-session';
import { useEffect, useMemo, useRef, useState } from 'react';
import { router } from 'expo-router';
import { useAuthStore } from '../../src/store/authStore';
import {
  API_URL,
  KEYCLOAK_CLIENT_ID,
  KEYCLOAK_REALM,
  KEYCLOAK_URL,
  isLocalhostUrl,
} from '../../src/config/env';

WebBrowser.maybeCompleteAuthSession();

const discovery = {
  authorizationEndpoint: `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/auth`,
  tokenEndpoint: `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/token`,
  revocationEndpoint: `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/logout`,
};

function parseJwtPayload(token: string): Record<string, unknown> {
  try {
    const base64Url = token.split('.')[1];
    if (!base64Url) return {};
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    return JSON.parse(atob(padded));
  } catch {
    return {};
  }
}

function formatTokenExchangeError(err: unknown): string {
  if (err && typeof err === 'object') {
    const tokenErr = err as {
      code?: string;
      description?: string;
      message?: string;
    };
    const code = typeof tokenErr.code === 'string' ? tokenErr.code : '';
    const description =
      typeof tokenErr.description === 'string' ? tokenErr.description : '';
    if (code || description) {
      return [code, description].filter(Boolean).join(' — ');
    }
    if (typeof tokenErr.message === 'string' && tokenErr.message) {
      return tokenErr.message;
    }
  }
  if (err instanceof Error && err.message) return err.message;
  return 'Falha desconhecida no endpoint /token.';
}

export default function LoginScreen() {
  const { setAuth, accessToken } = useAuthStore();
  const [exchanging, setExchanging] = useState(false);
  const exchangedCodesRef = useRef(new Set<string>());
  const codeVerifierRef = useRef<string | null>(null);

  const redirectUri = useMemo(
    () => makeRedirectUri({ scheme: 'gruahub', path: 'auth' }),
    []
  );

  const [request, , promptAsync] = useAuthRequest(
    {
      clientId: KEYCLOAK_CLIENT_ID,
      scopes: ['openid', 'profile', 'email', 'offline_access'],
      redirectUri,
      usePKCE: true,
    },
    discovery
  );

  useEffect(() => {
    if (accessToken) {
      router.replace('/(tabs)');
    }
  }, [accessToken]);

  async function exchangeAuthCode(code: string, codeVerifier: string) {
    if (exchangedCodesRef.current.has(code)) return;
    exchangedCodesRef.current.add(code);
    setExchanging(true);
    try {
      const tokenResponse = await exchangeCodeAsync(
        {
          clientId: KEYCLOAK_CLIENT_ID,
          code,
          redirectUri,
          extraParams: { code_verifier: codeVerifier },
        },
        discovery
      );

      const claims = parseJwtPayload(tokenResponse.accessToken);
      const tenantId = (claims['tenant_id'] as string) ?? '';
      const userEmail =
        (claims['email'] as string) ??
        (claims['preferred_username'] as string) ?? '';
      const userId = (claims['sub'] as string) ?? '';
      const expiresAt = Date.now() + (tokenResponse.expiresIn ?? 300) * 1000;
      const refreshToken = tokenResponse.refreshToken ?? '';

      if (!tenantId) {
        Alert.alert(
          'Login incompleto',
          'O token não contém tenant_id. Confirme os protocol mappers do client gruahub-mobile no Keycloak.'
        );
      }

      await setAuth({
        accessToken: tokenResponse.accessToken,
        refreshToken,
        expiresAt,
        tenantId,
        userEmail,
        userId,
      });

      router.replace('/(tabs)');
    } catch (err: unknown) {
      exchangedCodesRef.current.delete(code);
      const detail = formatTokenExchangeError(err);
      console.warn('[Auth] Token exchange falhou:', detail, err);
      Alert.alert(
        'Erro de autenticação',
        `Não foi possível trocar o código por token.\n${detail}\n\nRedirect: ${redirectUri}`
      );
    } finally {
      setExchanging(false);
    }
  }

  async function handleLogin() {
    try {
      if (!request?.codeVerifier) {
        Alert.alert(
          'Erro de autenticação',
          'PKCE ainda não está pronto. Aguarde e tente novamente.'
        );
        return;
      }
      codeVerifierRef.current = request.codeVerifier;
      const result = await promptAsync();
      if (result.type === 'error') {
        Alert.alert(
          'Erro de autenticação',
          result.error?.message ??
            'Falha no login Keycloak. Verifique EXPO_PUBLIC_KEYCLOAK_URL e o client gruahub-mobile.'
        );
        return;
      }
      if (result.type === 'success') {
        const code = result.params.code;
        const codeVerifier = codeVerifierRef.current;
        if (!code || !codeVerifier) {
          Alert.alert(
            'Erro de autenticação',
            'Retorno OAuth sem código ou code_verifier. Tente novamente.'
          );
          return;
        }
        await exchangeAuthCode(code, codeVerifier);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Não foi possível abrir o navegador.';
      Alert.alert('Erro', message);
    }
  }

  const isLoading = !request || exchanging;
  const deviceHint =
    isLocalhostUrl(API_URL) || isLocalhostUrl(KEYCLOAK_URL)
      ? 'Emulador/web: localhost ok. Device físico: use o IP da máquina em EXPO_PUBLIC_API_URL e EXPO_PUBLIC_KEYCLOAK_URL.'
      : null;

  return (
    <View style={styles.container}>
      <View style={styles.brand}>
        <Text style={styles.appName}>GruaHub</Text>
        <Text style={styles.tagline}>Gestão de gruas no campo</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Acesso do operador</Text>
        <Text style={styles.cardDesc}>
          Entre com a conta Keycloak para ver a rota do dia, registrar visitas e sincronizar offline.
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

        <Text style={styles.envHint}>
          API: {API_URL}{'\n'}
          Auth: {KEYCLOAK_URL}{'\n'}
          Redirect: {redirectUri}
        </Text>
        {deviceHint ? <Text style={styles.deviceHint}>{deviceHint}</Text> : null}
      </View>

      <View style={styles.offlineNote}>
        <Text style={styles.offlineNoteText}>
          Após o primeiro login, operações ficam na fila local e sincronizam ao reconectar.
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
  appName: { fontSize: 36, fontWeight: 'bold', color: '#fff' },
  tagline: { fontSize: 14, color: '#bfdbfe', marginTop: 6 },
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
  envHint: {
    marginTop: 16, fontSize: 11, color: '#9ca3af', lineHeight: 16,
  },
  deviceHint: {
    marginTop: 8, fontSize: 12, color: '#b45309', lineHeight: 17,
  },
  offlineNote: {
    marginTop: 24, backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 10, padding: 14,
  },
  offlineNoteText: { color: '#bfdbfe', fontSize: 13, lineHeight: 18, textAlign: 'center' },
  version: { marginTop: 32, color: '#93c5fd', fontSize: 11 },
});
