/**
 * Auth store com persistência em SecureStore (Keychain/Keystore).
 *
 * Tokens são JAMAIS logados nem armazenados em AsyncStorage ou localStorage.
 * Refresh automático 60 s antes do vencimento (escopo offline_access do Keycloak).
 */

import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';

// ── Constantes ───────────────────────────────────────────────────────────────

const KEYCLOAK_BASE =
  (process.env.EXPO_PUBLIC_KEYCLOAK_URL as string | undefined) ?? 'http://localhost:8180';
const REALM =
  (process.env.EXPO_PUBLIC_KEYCLOAK_REALM as string | undefined) ?? 'gruahub';
const CLIENT_ID =
  (process.env.EXPO_PUBLIC_KEYCLOAK_CLIENT_ID as string | undefined) ?? 'gruahub-mobile';

const TOKEN_URL = `${KEYCLOAK_BASE}/realms/${REALM}/protocol/openid-connect/token`;

/** Margem para renovar o token antes do vencimento. */
const REFRESH_MARGIN_MS = 60_000;

// ── Chaves do SecureStore ────────────────────────────────────────────────────

const SK = {
  accessToken:  'gh_access_token',
  refreshToken: 'gh_refresh_token',
  expiresAt:    'gh_token_expires_at',
  tenantId:     'gh_tenant_id',
  userId:       'gh_user_id',
  userEmail:    'gh_user_email',
} as const;

// ── Tipos ────────────────────────────────────────────────────────────────────

export interface AuthParams {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // Unix ms
  tenantId: string;
  userEmail: string;
  userId: string;
}

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: number | null;
  tenantId: string | null;
  userEmail: string | null;
  userId: string | null;
  /** true enquanto restaura sessão do SecureStore no startup */
  isRestoring: boolean;

  /** Define autenticação e persiste em SecureStore. */
  setAuth: (params: AuthParams) => Promise<void>;
  /** Tenta renovar o accessToken com o refreshToken. Retorna true em sucesso. */
  refreshAccessToken: () => Promise<boolean>;
  /** Limpa auth da memória e do SecureStore. */
  clearAuth: () => Promise<void>;
  /** Carrega tokens do SecureStore — chamar uma vez no startup (_layout.tsx). */
  restoreSession: () => Promise<void>;
  /** True se o token atual expira em menos de REFRESH_MARGIN_MS. */
  needsRefresh: () => boolean;
}

// ── Store ────────────────────────────────────────────────────────────────────

export const useAuthStore = create<AuthState>((set, get) => ({
  accessToken: null,
  refreshToken: null,
  expiresAt: null,
  tenantId: null,
  userEmail: null,
  userId: null,
  isRestoring: true,

  setAuth: async (params) => {
    set({
      accessToken: params.accessToken,
      refreshToken: params.refreshToken,
      expiresAt: params.expiresAt,
      tenantId: params.tenantId,
      userEmail: params.userEmail,
      userId: params.userId,
    });

    // Persiste em SecureStore (valores nunca logados)
    await Promise.all([
      SecureStore.setItemAsync(SK.accessToken,  params.accessToken),
      SecureStore.setItemAsync(SK.refreshToken, params.refreshToken),
      SecureStore.setItemAsync(SK.expiresAt,    String(params.expiresAt)),
      SecureStore.setItemAsync(SK.tenantId,     params.tenantId),
      SecureStore.setItemAsync(SK.userId,       params.userId),
      SecureStore.setItemAsync(SK.userEmail,    params.userEmail),
    ]);
  },

  clearAuth: async () => {
    set({
      accessToken: null, refreshToken: null, expiresAt: null,
      tenantId: null, userEmail: null, userId: null,
    });
    await Promise.all(Object.values(SK).map((k) => SecureStore.deleteItemAsync(k)));
  },

  restoreSession: async () => {
    try {
      const [accessToken, refreshToken, expiresAt, tenantId, userId, userEmail] =
        await Promise.all([
          SecureStore.getItemAsync(SK.accessToken),
          SecureStore.getItemAsync(SK.refreshToken),
          SecureStore.getItemAsync(SK.expiresAt),
          SecureStore.getItemAsync(SK.tenantId),
          SecureStore.getItemAsync(SK.userId),
          SecureStore.getItemAsync(SK.userEmail),
        ]);

      if (accessToken && refreshToken && expiresAt) {
        set({
          accessToken,
          refreshToken,
          expiresAt: Number(expiresAt),
          tenantId: tenantId ?? '',
          userId: userId ?? '',
          userEmail: userEmail ?? '',
        });
      }
    } catch (err) {
      // SecureStore pode falhar em simuladores sem Keychain — degrada graciosamente
      console.warn('[Auth] Falha ao restaurar sessão:', (err as Error).message);
    } finally {
      set({ isRestoring: false });
    }
  },

  needsRefresh: () => {
    const { expiresAt } = get();
    if (!expiresAt) return false;
    return Date.now() >= expiresAt - REFRESH_MARGIN_MS;
  },

  refreshAccessToken: async () => {
    const { refreshToken } = get();
    if (!refreshToken) return false;

    try {
      const body = new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: CLIENT_ID,
        refresh_token: refreshToken,
      });

      const res = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });

      if (!res.ok) {
        console.warn('[Auth] Refresh falhou com status:', res.status);
        return false;
      }

      const data = await res.json();
      const newExpiresAt = Date.now() + (data.expires_in ?? 300) * 1000;
      const newRefreshToken: string = data.refresh_token ?? refreshToken;

      await get().setAuth({
        accessToken: data.access_token,
        refreshToken: newRefreshToken,
        expiresAt: newExpiresAt,
        tenantId: get().tenantId ?? '',
        userId: get().userId ?? '',
        userEmail: get().userEmail ?? '',
      });

      return true;
    } catch (err) {
      console.warn('[Auth] Erro ao renovar token:', (err as Error).message);
      return false;
    }
  },
}));
