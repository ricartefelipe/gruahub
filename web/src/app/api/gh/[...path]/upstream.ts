// Só para desenvolvimento local (sem TLS): nunca usado em produção, ver upstreamBase().
const DEV_SCHEME = 'http';

/**
 * Origem do backend para o proxy server-side. Em produção ela vem obrigatoriamente de
 * `API_INTERNAL_URL` (rede interna do Compose, atrás do Caddy): sem a variável a rota
 * falha fechada em vez de adivinhar um destino. O fallback em texto claro existe só para
 * desenvolvimento local, onde não há TLS nem exposição de rede.
 */
export function upstreamBase(env: NodeJS.ProcessEnv = process.env): string {
  const internal = env.API_INTERNAL_URL?.trim();
  if (internal) {
    return internal.replace(/\/$/, '');
  }
  if (env.NODE_ENV === 'production') {
    throw new Error('API_INTERNAL_URL não definida: o proxy /api/gh exige a origem interna do backend');
  }
  const publicUrl = env.NEXT_PUBLIC_API_URL?.trim();
  if (publicUrl && !publicUrl.startsWith('/')) {
    return publicUrl.replace(/\/$/, '');
  }
  return `${DEV_SCHEME}://localhost:8080`;
}
