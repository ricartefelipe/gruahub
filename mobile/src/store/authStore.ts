import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import {
  KEYCLOAK_CLIENT_ID,
  KEYCLOAK_REALM,
  KEYCLOAK_URL,
} from '../config/env';

const TOKEN_URL = `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/token`;
const REFRESH_MARGIN_MS = 60_000;

const SK = {
  accessToken: 'gh_access_token',
  refreshToken: 'gh_refresh_token',
  expiresAt: 'gh_token_expires_at',
  tenantId: 'gh_tenant_id',
  userId: 'gh_user_id',
  userEmail: 'gh_user_email',
} as const;

export interface AuthParams {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
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
  isRestoring: boolean;
  setAuth: (params: AuthParams) => Promise<void>;
  refreshAccessToken: () => Promise<boolean>;
  clearAuth: () => Promise<void>;
  restoreSession: () => Promise<void>;
  needsRefresh: () => boolean;
}

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

    await Promise.all([
      SecureStore.setItemAsync(SK.accessToken, params.accessToken),
      SecureStore.setItemAsync(SK.refreshToken, params.refreshToken),
      SecureStore.setItemAsync(SK.expiresAt, String(params.expiresAt)),
      SecureStore.setItemAsync(SK.tenantId, params.tenantId),
      SecureStore.setItemAsync(SK.userId, params.userId),
      SecureStore.setItemAsync(SK.userEmail, params.userEmail),
    ]);
  },

  clearAuth: async () => {
    set({
      accessToken: null,
      refreshToken: null,
      expiresAt: null,
      tenantId: null,
      userEmail: null,
      userId: null,
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
        client_id: KEYCLOAK_CLIENT_ID,
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
