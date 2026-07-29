import axios, { AxiosError } from 'axios';
import { getSession, signOut } from 'next-auth/react';

function resolveApiBase(): string {
  const configured = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080').trim();
  if (configured === '/api/gh' || configured.startsWith('/api/gh/')) {
    return '/api/gh';
  }
  if (configured.startsWith('/')) {
    return configured.replace(/\/$/, '');
  }
  return `${configured.replace(/\/$/, '')}/api/v1`;
}

export const apiClient = axios.create({
  baseURL: resolveApiBase(),
  timeout: 15_000,
  headers: { 'Content-Type': 'application/json' },
});

function correlationId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c && typeof c.randomUUID === 'function') {
    return c.randomUUID();
  }
  if (c && typeof c.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    c.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  return `gh-${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
}

apiClient.interceptors.request.use(async (config) => {
  const session = await getSession();
  const accessToken = (session as { accessToken?: string } | null)?.accessToken;
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  config.headers['X-Correlation-Id'] = correlationId();
  return config;
});

let _signingOut = false;

apiClient.interceptors.response.use(
  (res) => res,
  async (err: AxiosError) => {
    const status = err.response?.status;

    if (status === 401 && !_signingOut) {
      _signingOut = true;
      await signOut({ callbackUrl: '/login' }).catch(() => {});
      setTimeout(() => { _signingOut = false; }, 3_000);
    }

    const data = err.response?.data as Record<string, unknown> | undefined;
    const isProblemDetails =
      typeof data === 'object' &&
      data !== null &&
      (typeof data.type === 'string' || typeof data.title === 'string') &&
      typeof data.status === 'number';

    if (isProblemDetails) {
      throw new ApiError(
        (data.detail as string) ?? (data.title as string) ?? 'Erro desconhecido',
        status ?? 0,
        (data.title as string) ?? '',
        (data.type as string) ?? '',
        data
      );
    }

    throw err;
  }
);

// ─── Classe ApiError ──────────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly title: string,
    public readonly type: string,
    public readonly raw?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get userMessage(): string {
    if (this.status === 403) return 'Você não tem permissão para esta ação.';
    if (this.status === 404) return 'Recurso não encontrado.';
    if (this.status === 409) return 'Conflito: registro já existe.';
    if (this.status >= 500) return 'Erro interno do servidor. Tente novamente.';
    return this.message || 'Ocorreu um erro. Tente novamente.';
  }
}

export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError;
}

export function apiErrorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.userMessage;
  if (err instanceof Error) return err.message;
  return 'Erro desconhecido.';
}

// ─── Tipos de domínio ─────────────────────────────────────────────────────────

export interface PageResponse<T> {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  first: boolean;
  last: boolean;
}

export interface Machine {
  id: string;
  tenantId: string;
  assetNumber: string;
  name: string;
  qrCode: string | null;
  status: 'DRAFT' | 'ACTIVE' | 'OFFLINE' | 'MAINTENANCE' | 'DISABLED' | 'RETIRED';
  playPriceCents: number;
  currency: string;
  bonusPlays: number;
  prizeCapacity: number;
  machineModelId: string | null;
  controllerId: string | null;
  operatingPointId: string | null;
  lastSeenAt: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
  notes: string | null;
}

export interface MachineStatusSummary {
  online: number;
  offline: number;
  maintenance: number;
}

export interface Alert {
  id: string;
  alertType: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  machineId: string | null;
  operatingPointId: string | null;
  title: string;
  message: string | null;
  status: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';
  createdAt: string;
}

export interface Establishment {
  id: string;
  name: string;
  cnpj: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  createdAt: string;
}

export interface OperatingPoint {
  id: string;
  establishmentId: string;
  name: string;
  address: string | null;
  commissionRate: number;
  createdAt: string;
}

export interface Visit {
  id: string;
  operatingPointId: string;
  operatingPointName: string;
  operatorId: string | null;
  status: 'OPEN' | 'COMPLETED';
  checkinAt: string | null;
  checkoutAt: string | null;
  cashCollectedCents: number | null;
  notes: string | null;
  createdAt: string;
}

export interface MaintenanceTicket {
  id: string;
  machineId: string;
  title: string;
  description: string | null;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  assignedTo: string | null;
  resolutionNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StockBalance {
  machineId: string;
  prizeId: string;
  prizeName: string;
  currentQuantity: number;
  capacity: number;
}

export interface StockMovement {
  id: string;
  machineId: string;
  prizeId: string;
  prizeName: string | null;
  movementType: 'STOCK_IN' | 'PRIZE_GIVEN' | 'ADJUSTMENT' | 'TRANSFER_OUT' | 'TRANSFER_IN';
  quantity: number;
  notes: string | null;
  occurredAt: string;
}

export interface PaymentTransaction {
  id: string;
  machineId: string;
  providerTransactionId: string;
  provider: string;
  amountCents: number;
  currency: string;
  status: 'PENDING' | 'CONFIRMED' | 'FAILED' | 'EXPIRED' | 'REFUNDED';
  createdAt: string;
  confirmedAt: string | null;
}

export interface ReconciliationCase {
  id: string;
  paymentTransactionId: string | null;
  creditGrantId: string | null;
  playSessionId: string | null;
  status: string;
  statusReason: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
}

export interface Settlement {
  id: string;
  operatingPointId: string;
  periodStart: string;
  periodEnd: string;
  grossRevenueCents: number;
  commissionCents: number;
  netRevenueCents: number;
  status: string;
  createdAt: string;
}

export interface Route {
  id: string;
  name: string;
  description: string | null;
  status: string;
  createdAt: string;
}

export interface RouteStop {
  id: string;
  routeId: string;
  operatingPointId: string;
  operatingPointName: string | null;
  stopOrder: number;
  estimatedDurationMinutes: number | null;
}

export interface AuditEvent {
  id: string;
  tenantId: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  actorUserId: string | null;
  actorEmail: string | null;
  metadata: Record<string, unknown> | null;
  occurredAt: string;
}

// ─── API por módulo ───────────────────────────────────────────────────────────

export const machinesApi = {
  list: (page = 0, size = 20, params?: Record<string, string>) =>
    apiClient.get<PageResponse<Machine>>('/machines', { params: { page, size, ...params } }),
  get: (id: string) => apiClient.get<Machine>(`/machines/${id}`),
  create: (data: Partial<Machine>) => apiClient.post<Machine>('/machines', data),
  update: (id: string, data: Partial<Machine>) =>
    apiClient.patch<Machine>(`/machines/${id}`, data),
  changeStatus: (id: string, status: string) =>
    apiClient.post<Machine>(`/machines/${id}/status`, null, { params: { status } }),
  statusSummary: () => apiClient.get<MachineStatusSummary>('/machines/summary/status'),
  sendCommand: (id: string, commandType: string) =>
    apiClient.post(`/machines/${id}/commands`, { commandType }),
};

export const alertsApi = {
  list: (page = 0, size = 20, status?: string) =>
    apiClient.get<PageResponse<Alert>>('/alerts', {
      params: { page, size, ...(status ? { status } : {}) },
    }),
  acknowledge: (id: string) => apiClient.post<Alert>(`/alerts/${id}/acknowledge`),
  resolve: (id: string) => apiClient.post<Alert>(`/alerts/${id}/resolve`),
  openCount: () => apiClient.get<{ count: number }>('/alerts/summary/open-count'),
};

export const establishmentsApi = {
  list: (page = 0, size = 50) =>
    apiClient.get<PageResponse<Establishment>>('/establishments', { params: { page, size } }),
  get: (id: string) => apiClient.get<Establishment>(`/establishments/${id}`),
  create: (data: Partial<Establishment>) =>
    apiClient.post<Establishment>('/establishments', data),
};

export const operatingPointsApi = {
  list: (page = 0, size = 100, establishmentId?: string) =>
    apiClient.get<PageResponse<OperatingPoint>>('/operating-points', {
      params: { page, size, ...(establishmentId ? { establishmentId } : {}) },
    }),
  create: (data: Partial<OperatingPoint>) =>
    apiClient.post<OperatingPoint>('/operating-points', data),
};

export const visitsApi = {
  list: (page = 0, size = 50, params?: Record<string, string>) =>
    apiClient.get<PageResponse<Visit>>('/visits', { params: { page, size, ...params } }),
  get: (id: string) => apiClient.get<Visit>(`/visits/${id}`),
};

export const maintenanceApi = {
  list: (page = 0, size = 50, status?: string) =>
    apiClient.get<PageResponse<MaintenanceTicket>>('/maintenance', {
      params: { page, size, ...(status ? { status } : {}) },
    }),
  update: (id: string, data: Partial<MaintenanceTicket>) =>
    apiClient.put<MaintenanceTicket>(`/maintenance/${id}`, data),
};

export const inventoryApi = {
  balances: (page = 0, size = 100) =>
    apiClient.get<PageResponse<StockBalance>>('/inventory/balances', { params: { page, size } }),
  movements: (page = 0, size = 100) =>
    apiClient.get<PageResponse<StockMovement>>('/inventory/movements', { params: { page, size } }),
  prizes: (page = 0, size = 100) =>
    apiClient.get<PageResponse<Record<string, unknown>>>('/inventory/prizes', { params: { page, size } }),
  createPrize: (data: Record<string, unknown>) =>
    apiClient.post('/inventory/prizes', data),
  updatePrize: (id: string, data: Record<string, unknown>) =>
    apiClient.put(`/inventory/prizes/${id}`, data),
};

export const playsApi = {
  list: (page = 0, size = 50, machineId?: string) =>
    apiClient.get<PageResponse<Record<string, unknown>>>('/plays', {
      params: { page, size, ...(machineId ? { machineId } : {}) },
    }),
  manualCredit: (data: {
    machineId: string;
    playsGranted: number;
    amountCents: number;
    justification: string;
  }) => apiClient.post('/plays/manual-credit', data),
};

export const paymentsApi = {
  list: (page = 0, size = 50, status?: string) =>
    apiClient.get<PageResponse<PaymentTransaction>>('/payments', {
      params: { page, size, ...(status ? { status } : {}) },
    }),
  initiate: (data: { machineId: string; amountCents?: number; provider?: string }) =>
    apiClient.post('/payments/initiate', data),
  sandboxConfirm: (transactionId: string) =>
    apiClient.post(`/payments/sandbox/confirm/${transactionId}`),
  sandboxFail: (transactionId: string) =>
    apiClient.post(`/payments/sandbox/fail/${transactionId}`),
};

export const reconciliationApi = {
  list: (page = 0, size = 50, status?: string) =>
    apiClient.get<PageResponse<ReconciliationCase>>('/reconciliation', {
      params: { page, size, ...(status ? { status } : {}) },
    }),
  summary: () =>
    apiClient.get<{ byStatus: Record<string, number>; totalPending: number }>(
      '/reconciliation/summary'
    ),
  resolve: (id: string, resolution: string, note?: string) =>
    apiClient.post<ReconciliationCase>(`/reconciliation/${id}/resolve`, { resolution, note }),
};

export const financeApi = {
  settlements: (page = 0, size = 50) =>
    apiClient.get<PageResponse<Settlement>>('/finance/settlements', { params: { page, size } }),
  approve: (id: string) =>
    apiClient.put<Settlement>(`/finance/settlements/${id}/approve`),
  markPaid: (id: string) =>
    apiClient.put<Settlement>(`/finance/settlements/${id}/mark-paid`),
  commissionPolicies: (page = 0, size = 50) =>
    apiClient.get<PageResponse<Record<string, unknown>>>('/finance/commission-policies', {
      params: { page, size },
    }),
  createCommissionPolicy: (data: Record<string, unknown>) =>
    apiClient.post('/finance/commission-policies', data),
};

export const routesApi = {
  list: (page = 0, size = 30, date?: string) =>
    apiClient.get<PageResponse<Route>>('/routes', { params: { page, size, ...(date ? { date } : {}) } }),
  stops: (routeId: string) =>
    apiClient.get<PageResponse<RouteStop>>(`/routes/${routeId}/stops`),
  generate: (maxStops = 10) =>
    apiClient.post<{ id: string; totalStops: number; plannedDate: string }>(
      '/routes/generate',
      null,
      { params: { maxStops } },
    ),
};

export const reportsApi = {
  generate: (reportType: string, parameters: Record<string, string>) =>
    apiClient.post('/reports/generate', { reportType, parameters }, { responseType: 'blob' }),
};

export const auditApi = {
  list: (page = 0, size = 100, params?: Record<string, string>) =>
    apiClient.get<PageResponse<AuditEvent>>('/audit', { params: { page, size, ...params } }),
};

export default apiClient;
