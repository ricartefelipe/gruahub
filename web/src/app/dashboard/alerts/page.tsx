'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';

interface Alert {
  id: string;
  machineId: string;
  machineAssetNumber: string;
  alertType: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
  status: string;
  message: string;
  occurredAt: string;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
}

const SEVERITY_META: Record<string, { label: string; className: string }> = {
  CRITICAL: { label: 'Crítico',   className: 'bg-red-100 text-red-700 border-red-200' },
  HIGH:     { label: 'Alto',      className: 'bg-orange-100 text-orange-700 border-orange-200' },
  MEDIUM:   { label: 'Médio',     className: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  LOW:      { label: 'Baixo',     className: 'bg-blue-100 text-blue-700 border-blue-200' },
  INFO:     { label: 'Info',      className: 'bg-gray-100 text-gray-600 border-gray-200' },
};

const ALERT_TYPE_LABEL: Record<string, string> = {
  MACHINE_OFFLINE:    'Máquina offline',
  MOTOR_FAULT:        'Falha no motor',
  DOOR_OPEN:          'Porta aberta',
  PAYMENT_FAILURE:    'Falha de pagamento',
  LOW_STOCK:          'Estoque baixo',
  HEARTBEAT_TIMEOUT:  'Timeout de heartbeat',
};

function fmt(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export default function AlertsPage() {
  const qc = useQueryClient();
  const { data: alerts = [], isLoading, isError, error } = useQuery<Alert[]>({
    queryKey: ['alerts', 'OPEN'],
    queryFn: () =>
      api.get('/alerts?status=OPEN&size=100').then(r => r.data?.content ?? []),
    refetchInterval: 30_000,
  });

  const { data: summary } = useQuery<{ total: number; bySeverity: Record<string, number> }>({
    queryKey: ['alerts-summary'],
    queryFn: () => api.get('/alerts/summary/open-count').then(r => r.data),
    refetchInterval: 30_000,
  });

  const acknowledge = useMutation({
    mutationFn: (id: string) =>
      api.post(`/alerts/${id}/acknowledge`, { note: 'Reconhecido via painel web' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['alerts'] });
      qc.invalidateQueries({ queryKey: ['alerts-summary'] });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">Carregando alertas...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {isError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm" role="alert">
          Erro ao carregar alertas: {(error as Error)?.message ?? 'falha de comunicação'}
        </div>
      )}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Alertas Operacionais</h1>
          <p className="text-sm text-gray-500 mt-1">Alertas abertos em tempo real</p>
        </div>
        {summary && (
          <div className="flex gap-2">
            {Object.entries(summary.bySeverity).map(([sev, count]) => {
              const meta = SEVERITY_META[sev] || SEVERITY_META.INFO;
              return (
                <span
                  key={sev}
                  className={`px-3 py-1 rounded-full text-xs font-semibold border ${meta.className}`}
                  aria-label={`${meta.label}: ${count} alertas`}
                >
                  {meta.label}: {count}
                </span>
              );
            })}
          </div>
        )}
      </div>

      {alerts.length === 0 ? (
        <div className="bg-green-50 border border-green-200 rounded-xl p-8 text-center">
          <div className="text-2xl mb-2">✅</div>
          <p className="text-green-700 font-semibold">Nenhum alerta aberto</p>
          <p className="text-green-600 text-sm mt-1">Todas as máquinas estão operando normalmente.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm" role="table" aria-label="Alertas abertos">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Severidade</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Tipo</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Máquina</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Mensagem</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Ocorrência</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {alerts.map((alert) => {
                const meta = SEVERITY_META[alert.severity] || SEVERITY_META.INFO;
                const typeLabel = ALERT_TYPE_LABEL[alert.alertType] || alert.alertType;
                return (
                  <tr key={alert.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-md text-xs font-semibold border ${meta.className}`}>
                        {meta.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{typeLabel}</td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded">
                        {alert.machineAssetNumber || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 max-w-xs truncate" title={alert.message}>
                      {alert.message}
                    </td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                      {fmt(alert.occurredAt)}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => {
                          if (confirm(`Reconhecer alerta "${typeLabel}" da máquina ${alert.machineAssetNumber}?`)) {
                            acknowledge.mutate(alert.id);
                          }
                        }}
                        disabled={acknowledge.isPending}
                        className="text-xs px-3 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
                        aria-label={`Reconhecer alerta ${typeLabel}`}
                      >
                        Reconhecer
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
