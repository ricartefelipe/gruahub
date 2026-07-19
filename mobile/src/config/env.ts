import Constants from 'expo-constants';

type Extra = {
  apiUrl?: string;
  keycloakIssuer?: string;
  keycloakClientId?: string;
};

const extra = (Constants.expoConfig?.extra ?? {}) as Extra;

function trimSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

export const API_URL = trimSlash(
  process.env.EXPO_PUBLIC_API_URL ??
    extra.apiUrl ??
    'http://localhost:8080'
);

export const KEYCLOAK_URL = trimSlash(
  process.env.EXPO_PUBLIC_KEYCLOAK_URL ??
    (extra.keycloakIssuer
      ? extra.keycloakIssuer.replace(/\/realms\/[^/]+$/, '')
      : 'http://localhost:8180')
);

export const KEYCLOAK_REALM =
  process.env.EXPO_PUBLIC_KEYCLOAK_REALM ?? 'gruahub';

export const KEYCLOAK_CLIENT_ID =
  process.env.EXPO_PUBLIC_KEYCLOAK_CLIENT_ID ??
  extra.keycloakClientId ??
  'gruahub-mobile';

export const KEYCLOAK_ISSUER = `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}`;

export function isLocalhostUrl(url: string): boolean {
  return /:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(url);
}
