'use client';

import { useQuery } from '@tanstack/react-query';
import { machinesApi, alertsApi } from '@/lib/api';

function MetricCard({ title, value, sub, color }: {
  title: string; value: string | number; sub?: string; color: string;
}) {
  return (
    <div className={`bg-white rounded-xl shadow p-5 border-l-4 ${color}`}>
      <p className="text-sm text-gray-500">{title}</p>
      <p className="text-3xl font-bold text-gray-900 mt-1">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    ACTIVE:      { label: 'Online',      className: 'badge-online' },
    OFFLINE:     { label: 'Offline',     className: 'badge-offline' },
    MAINTENANCE: { label: 'Manutenção',  className: 'badge-maintenance' },
    DRAFT:       { label: 'Rascunho',    className: 'badge-draft' },
    DISABLED:    { label: 'Desabilitada',className: 'badge-draft' },
    RETIRED:     { label: 'Aposentada',  className: 'badge-draft' },
  };
  const cfg = map[status] || { label: status, className: 'badge-draft' };
  return <span className={cfg.className}>{cfg.label}</span>;
}

export default function DashboardPage() {
  const { data: machines, isLoading: machinesLoading } = useQuery({
    queryKey: ['machines'],
    queryFn: () => machinesApi.list(0, 100).then(r => r.data),
    refetchInterval: 30_000,
  });

  const { data: summary } = useQuery({
    queryKey: ['machines-summary'],
    queryFn: () => machinesApi.statusSummary().then(r => r.data),
    refetchInterval: 15_000,
  });

  const { data: alerts } = useQuery({
    queryKey: ['alerts-open'],
    queryFn: () => alertsApi.list(0, 5, 'OPEN').then(r => r.data),
    refetchInterval: 30_000,
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <span className="text-xs text-gray-400">
          Atualização automática a cada 30s
        </span>
      </div>

      {/* Métricas de frota */}
      <section aria-label="Resumo da frota">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
          Status da Frota
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <MetricCard
            title="Máquinas Online"
            value={summary?.online ?? '—'}
            color="border-green-500"
          />
          <MetricCard
            title="Máquinas Offline"
            value={summary?.offline ?? '—'}
            color="border-red-500"
          />
          <MetricCard
            title="Em Manutenção"
            value={summary?.maintenance ?? '—'}
            color="border-yellow-500"
          />
        </div>
      </section>

      {/* Lista de máquinas */}
      <section aria-label="Máquinas da frota" className="mb-6">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
          Máquinas ({machines?.totalElements ?? 0})
        </h2>
        {machinesLoading ? (
          <div className="bg-white rounded-xl shadow p-8 text-center text-gray-400">
            Carregando máquinas...
          </div>
        ) : machines?.content.length === 0 ? (
          <div className="bg-white rounded-xl shadow p-8 text-center text-gray-400">
            Nenhuma máquina cadastrada.
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Patrimônio
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Nome
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Preço
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Último sinal
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {machines?.content.map(m => (
                  <tr key={m.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-mono text-gray-600">
                      {m.assetNumber}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">{m.name}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={m.status} />
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: m.currency })
                        .format(m.playPriceCents / 100)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-400">
                      {m.lastSeenAt
                        ? new Intl.DateTimeFormat('pt-BR', {
                            dateStyle: 'short',
                            timeStyle: 'short',
                          }).format(new Date(m.lastSeenAt))
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Alertas abertos */}
      <section aria-label="Alertas abertos">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
          Alertas Abertos ({alerts?.totalElements ?? 0})
        </h2>
        {alerts?.content.length === 0 ? (
          <div className="bg-white rounded-xl shadow p-4 text-center text-gray-400 text-sm">
            Nenhum alerta aberto ✓
          </div>
        ) : (
          <div className="space-y-2">
            {alerts?.content.map(a => (
              <div
                key={a.id}
                className={`bg-white rounded-lg shadow p-4 border-l-4 ${
                  a.severity === 'CRITICAL'
                    ? 'border-red-500'
                    : a.severity === 'WARNING'
                    ? 'border-yellow-500'
                    : 'border-blue-400'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium text-gray-900 text-sm">{a.title}</p>
                    {a.message && (
                      <p className="text-gray-500 text-xs mt-0.5">{a.message}</p>
                    )}
                  </div>
                  <span
                    className={`ml-3 text-xs font-semibold px-2 py-0.5 rounded ${
                      a.severity === 'CRITICAL'
                        ? 'bg-red-100 text-red-700'
                        : a.severity === 'WARNING'
                        ? 'bg-yellow-100 text-yellow-700'
                        : 'bg-blue-100 text-blue-700'
                    }`}
                    aria-label={`Severidade: ${a.severity}`}
                  >
                    {a.severity}
                  </span>
                </div>
                <p className="text-gray-400 text-xs mt-1">
                  {new Intl.DateTimeFormat('pt-BR', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  }).format(new Date(a.createdAt))}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
