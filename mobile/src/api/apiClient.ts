/**
 * Cliente HTTP do app mobile.
 *
 * Garantias:
 *   - Timeout de 15 s via AbortController
 *   - Header Authorization: Bearer <token>
 *   - Header X-Correlation-Id (UUID v4 por requisição, para rastreabilidade)
 *   - Header Idempotency-Key (clientOperationId) quando fornecido
 *   - Parse de Problem Details RFC 7807 como ApiError tipado
 *   - Tokens NUNCA logados
 */

import { v4 as uuidv4 } from 'uuid';
import Constants from 'expo-constants';

const API_BASE: string =
  (Constants.expoConfig?.extra?.apiUrl as string | undefined) ?? 'http://localhost:8080';

export const REQUEST_TIMEOUT_MS = 15_000;

// ── Erro tipado RFC 7807 ─────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly type: string,
    public readonly title: string,
    public readonly detail: string
  ) {
    super(`[${status}] ${title}: ${detail}`);
    this.name = 'ApiError';
  }

  /** True para falhas transitórias — vale retry com backoff. */
  get isRetryable(): boolean {
    return this.status >= 500 || this.status === 0;
  }

  /** True para falhas permanentes — não adianta tentar novamente. */
  get isPermanent(): boolean {
    return this.status === 400 || this.status === 403 || this.status === 422;
  }
}

// ── Opções de requisição ─────────────────────────────────────────────────────

export interface FetchOptions extends Omit<RequestInit, 'headers'> {
  accessToken?: string;
  tenantId?: string;
  /** clientOperationId para Idempotency-Key (enfileiramento offline). */
  operationId?: string;
  /** Substituir URL base. */
  baseUrl?: string;
}

// ── Função principal ─────────────────────────────────────────────────────────

/**
 * Realiza uma requisição HTTP com timeout, correlationId e Problem Details.
 *
 * @throws ApiError   em respostas 4xx/5xx com body Problem Details
 * @throws Error      em timeout ou erro de rede
 */
export async function apiFetch(
  path: string,
  options: FetchOptions = {}
): Promise<Response> {
  const { accessToken, tenantId, operationId, baseUrl, ...init } = options;

  const correlationId = uuidv4();
  const url = `${baseUrl ?? API_BASE}${path}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'X-Correlation-Id': correlationId,
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    ...(tenantId ? { 'X-Tenant-Id': tenantId } : {}),
    ...(operationId ? { 'Idempotency-Key': operationId } : {}),
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...init,
      headers,
      signal: controller.signal,
    });

    if (!response.ok) {
      await throwApiError(response);
    }

    return response;
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw new ApiError(
        0,
        'urn:gruahub:error:timeout',
        'Timeout',
        `Requisição para ${path} excedeu ${REQUEST_TIMEOUT_MS / 1000}s`
      );
    }
    if (err instanceof ApiError) throw err;
    // Erro de rede puro (sem resposta)
    throw new ApiError(
      0,
      'urn:gruahub:error:network',
      'Network error',
      err?.message ?? 'sem conexão'
    );
  } finally {
    clearTimeout(timer);
  }
}

// ── Atalhos ──────────────────────────────────────────────────────────────────

export function apiGet(path: string, options?: FetchOptions): Promise<Response> {
  return apiFetch(path, { ...options, method: 'GET' });
}

export function apiPost(
  path: string,
  body: unknown,
  options?: FetchOptions
): Promise<Response> {
  return apiFetch(path, {
    ...options,
    method: 'POST',
    body: JSON.stringify(body),
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function throwApiError(response: Response): Promise<never> {
  let type = `urn:gruahub:error:http-${response.status}`;
  let title = response.statusText || `HTTP ${response.status}`;
  let detail = '';

  try {
    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('application/problem+json') || contentType.includes('application/json')) {
      const body = await response.json();
      type = body.type ?? type;
      title = body.title ?? title;
      detail = body.detail ?? body.message ?? '';
    } else {
      detail = (await response.text()).slice(0, 300);
    }
  } catch {
    // parsing falhou — usa valores padrão
  }

  throw new ApiError(response.status, type, title, detail);
}
