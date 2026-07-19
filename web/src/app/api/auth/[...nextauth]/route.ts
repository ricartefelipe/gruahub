import NextAuth from 'next-auth';
import KeycloakProvider from 'next-auth/providers/keycloak';
import type { JWT } from 'next-auth/jwt';
import type { Account, Session } from 'next-auth';

const publicIssuer = process.env.KEYCLOAK_ISSUER!;
const internalIssuer =
  process.env.KEYCLOAK_INTERNAL_ISSUER?.trim() || publicIssuer;

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
    const tokenUrl = `${internalIssuer}/protocol/openid-connect/token`;

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
    return { ...token, error: 'RefreshAccessTokenError' };
  }
}

const handler = NextAuth({
  providers: [
    KeycloakProvider({
      clientId: process.env.KEYCLOAK_CLIENT_ID!,
      clientSecret: process.env.KEYCLOAK_CLIENT_SECRET!,
      issuer: publicIssuer,
      wellKnown: '',
      authorization: {
        url: `${publicIssuer}/protocol/openid-connect/auth`,
        params: { scope: 'openid email profile roles' },
      },
      token: `${internalIssuer}/protocol/openid-connect/token`,
      userinfo: `${internalIssuer}/protocol/openid-connect/userinfo`,
      jwks_endpoint: `${internalIssuer}/protocol/openid-connect/certs`,
    }),
  ],

  callbacks: {
    async jwt({ token, account }: { token: JWT; account: Account | null }) {
      if (account) {
        token.accessToken  = account.access_token;
        token.idToken      = account.id_token;
        token.refreshToken = account.refresh_token;
        token.expiresAt    = account.expires_at;
        token.roles        = decodeKeycloakRoles(account.access_token ?? '');
        return token;
      }

      const expiresAt = (token.expiresAt as number) ?? 0;
      if (Date.now() / 1000 < expiresAt - 60) {
        return token;
      }

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
    maxAge: 8 * 60 * 60,
  },

  pages: {
    signIn: '/login',
    error:  '/login',
  },

  secret: process.env.NEXTAUTH_SECRET,
});

export { handler as GET, handler as POST };
