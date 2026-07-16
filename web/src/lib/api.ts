import axios from 'axios';
import { getSession } from 'next-auth/react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

export const apiClient = axios.create({
  baseURL: `${API_URL}/api/v1`,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Injetar token Bearer automaticamente
apiClient.interceptors.request.use(async (config) => {
  const session = await getSession();
  if ((session as any)?.accessToken) {
    config.headers.Authorization = `Bearer ${(session as any).accessToken}`;
  }
  // Adicionar correlationId
  config.headers['X-Correlation-Id'] = crypto.randomUUID();
  return config;
});

// Tipagem básica das respostas
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

// API functions
export const machinesApi = {
  list: (page = 0, size = 20) =>
    apiClient.get<PageResponse<Machine>>('/machines', { params: { page, size } }),

  get: (id: string) => apiClient.get<Machine>(`/machines/${id}`),

  create: (data: Partial<Machine>) => apiClient.post<Machine>('/machines', data),

  update: (id: string, data: Partial<Machine>) => apiClient.patch<Machine>(`/machines/${id}`, data),

  changeStatus: (id: string, status: string) =>
    apiClient.post<Machine>(`/machines/${id}/status`, null, { params: { status } }),

  statusSummary: () => apiClient.get<MachineStatusSummary>('/machines/summary/status'),
};

export const alertsApi = {
  list: (page = 0, size = 20, status?: string) =>
    apiClient.get<PageResponse<Alert>>('/alerts', { params: { page, size, status } }),
};

export const reconciliationApi = {
  list: (page = 0, size = 20, status?: string) =>
    apiClient.get<PageResponse<any>>('/reconciliation', { params: { page, size, status } }),
};

/**
 * Default export — alias de apiClient para uso simplificado nas páginas.
 * Uso: import api from '@/lib/api'
 *      api.get('/machines'), api.post('/machines', body)
 */
export default apiClient;
