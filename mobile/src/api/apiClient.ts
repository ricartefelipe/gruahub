import { v4 as uuidv4 } from 'uuid';
import { API_URL } from '../config/env';

export const REQUEST_TIMEOUT_MS = 15_000;

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

  get isRetryable(): boolean {
    return this.status >= 500 || this.status === 0;
  }

  get isPermanent(): boolean {
    return this.status === 400 || this.status === 403 || this.status === 422;
  }
}

export interface FetchOptions extends Omit<RequestInit, 'headers'> {
  accessToken?: string;
  tenantId?: string;
  operationId?: string;
  baseUrl?: string;
}

export async function apiFetch(
  path: string,
  options: FetchOptions = {}
): Promise<Response> {
  const { accessToken, tenantId, operationId, baseUrl, ...init } = options;

  const correlationId = uuidv4();
  const url = `${baseUrl ?? API_URL}${path}`;

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
  } catch (err: unknown) {
    const anyErr = err as { name?: string; message?: string };
    if (anyErr.name === 'AbortError') {
      throw new ApiError(
        0,
        'urn:gruahub:error:timeout',
        'Timeout',
        `Requisição para ${path} excedeu ${REQUEST_TIMEOUT_MS / 1000}s`
      );
    }
    if (err instanceof ApiError) throw err;
    throw new ApiError(
      0,
      'urn:gruahub:error:network',
      'Sem conexão',
      anyErr?.message ?? 'Não foi possível alcançar a API'
    );
  } finally {
    clearTimeout(timer);
  }
}

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
    // keep defaults
  }

  throw new ApiError(response.status, type, title, detail);
}
