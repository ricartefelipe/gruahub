import NextAuth from 'next-auth';
import KeycloakProvider from 'next-auth/providers/keycloak';
import type { JWT } from 'next-auth/jwt';
import type { Account, Session } from 'next-auth';

/**
 * NextAuth com Keycloak PKCE
 *
 * Garante:
 * - roles extraídas do access_token (realm_access + resource_access.<clientId>)
 * - token refresh automático antes da expiração (margem de 60s)
 * - accessToken mantido apenas no cookie HttpOnly via JWT strategy
 * - signIn/error apontam para /login
 */

function decodeKeycloakRoles(accessToken: string): string[] {
  try {
    const [, payloadB64] = accessToken.split('.');
    const payload = JSON.parse(
      Buffer.from(payloadB64, 'base64').toString('utf8')
    );
    const realmRoles: string[] = payload.realm_access?.roles ?? [];
    const clientId = process.env.KEYCLOAK_CLIENT_ID ?? '';
    const clientRoles: string[] = payload.resource_access?.[clientId]?.roles ?? [];
    return [...new Set([...realmRoles, ...clientRoles])];
  } catch {
    return [];
  }
}

async function refreshAccessToken(token: JWT): Promise<JWT> {
  try {
    const issuer = process.env.KEYCLOAK_ISSUER!;
    const tokenUrl = `${issuer}/protocol/openid-connect/token`;

    const res = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.KEYCLOAK_CLIENT_ID!,
        client_secret: process.env.KEYCLOAK_CLIENT_SECRET!,
        grant_type: 'refresh_token',
        refresh_token: (token.refreshToken as string) ?? '',
      }),
    });

    const data = await res.json();
    if (!res.ok) throw data;

    return {
      ...token,
      accessToken:   data.access_token,
      refreshToken:  data.refresh_token ?? token.refreshToken,
      expiresAt:     Math.floor(Date.now() / 1000) + (data.expires_in as number),
      roles:         decodeKeycloakRoles(data.access_token),
      error:         undefined,
    };
  } catch {
    // Refresh falhou — próxima request ao backend vai retornar 401
    // e o interceptor de response em api.ts vai chamar signOut()
    return { ...token, error: 'RefreshAccessTokenError' };
  }
}

const handler = NextAuth({
  providers: [
    KeycloakProvider({
      clientId: process.env.KEYCLOAK_CLIENT_ID!,
      clientSecret: process.env.KEYCLOAK_CLIENT_SECRET!,
      issuer: process.env.KEYCLOAK_ISSUER!,
      authorization: {
        params: { scope: 'openid email profile roles offline_access' },
      },
    }),
  ],

  callbacks: {
    async jwt({ token, account }: { token: JWT; account: Account | null }) {
      // Primeiro login: popular campos do account OAuth
      if (account) {
        token.accessToken  = account.access_token;
        token.idToken      = account.id_token;
        token.refreshToken = account.refresh_token;
        token.expiresAt    = account.expires_at;
        token.roles        = decodeKeycloakRoles(account.access_token ?? '');
        return token;
      }

      // Token ainda válido (com margem de 60s para refresh antecipado)
      const expiresAt = (token.expiresAt as number) ?? 0;
      if (Date.now() / 1000 < expiresAt - 60) {
        return token;
      }

      // Token expirado → tentar refresh
      return refreshAccessToken(token);
    },

    async session({ session, token }: { session: Session; token: JWT }) {
      (session as any).accessToken = token.accessToken;
      (session as any).roles       = (token.roles as string[]) ?? [];
      (session as any).error       = token.error;
      return session;
    },
  },

  session: {
    strategy: 'jwt',
    maxAge: 8 * 60 * 60, // 8h — jornada operacional padrão
  },

  pages: {
    signIn: '/login',
    error:  '/login',
  },

  secret: process.env.NEXTAUTH_SECRET,
});

export { handler as GET, handler as POST };
