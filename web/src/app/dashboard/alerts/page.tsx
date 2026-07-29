'use client';

import Link from 'next/link';
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

const SEVERITY_META: Record<string, { label: string; className: string; bar: string }> = {
  CRITICAL: {
    label: 'Crítico',
    className: 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-200',
    bar: 'border-l-rose-500',
  },
  HIGH: {
    label: 'Alto',
    className: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200',
    bar: 'border-l-orange-500',
  },
  MEDIUM: {
    label: 'Médio',
    className: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
    bar: 'border-l-amber-500',
  },
  LOW: {
    label: 'Baixo',
    className: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-200',
    bar: 'border-l-blue-500',
  },
  INFO: {
    label: 'Info',
    className: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
    bar: 'border-l-slate-400',
  },
};

const ALERT_TYPE_LABEL: Record<string, string> = {
  MACHINE_OFFLINE: 'Máquina offline',
  MOTOR_FAULT: 'Falha no motor',
  DOOR_OPEN: 'Porta aberta',
  PAYMENT_FAILURE: 'Falha de pagamento',
  LOW_STOCK: 'Estoque baixo',
  HEARTBEAT_TIMEOUT: 'Timeout de heartbeat',
};

function fmt(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export default function AlertsPage() {
  const qc = useQueryClient();
  const { data: alerts = [], isLoading, isError, error } = useQuery<Alert[]>({
    queryKey: ['alerts', 'OPEN'],
    queryFn: () => api.get('/alerts?status=OPEN&size=100').then((r) => r.data?.content ?? []),
    refetchInterval: 30_000,
  });

  const { data: summary } = useQuery<{ total: number; bySeverity: Record<string, number> }>({
    queryKey: ['alerts-summary'],
    queryFn: () => api.get('/alerts/summary/open-count').then((r) => r.data),
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

  const resolve = useMutation({
    mutationFn: (id: string) =>
      api.post(`/alerts/${id}/resolve`, { note: 'Resolvido via painel web' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['alerts'] });
      qc.invalidateQueries({ queryKey: ['alerts-summary'] });
    },
  });

  return (
    <div className="space-y-8 gh-fade-up">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">
            Monitoramento
          </p>
          <h1 className="font-display mt-1 text-3xl font-bold tracking-tight text-[color:var(--text)] md:text-4xl">
            Alertas
          </h1>
          <p className="mt-1 text-sm text-[color:var(--text-muted)]">
            Abertos em tempo real · atualização a cada 30s
          </p>
        </div>
        <Link href="/dashboard/machines" className="gh-btn-ghost">
          Ir para frota
        </Link>
      </header>

      {summary && (
        <section className="flex flex-wrap gap-2" aria-label="Resumo por severidade">
          <span className="rounded-full bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 px-3 py-1 text-xs font-semibold">
            Abertos: {summary.total}
          </span>
          {Object.entries(summary.bySeverity).map(([sev, count]) => {
            const meta = SEVERITY_META[sev] || SEVERITY_META.INFO;
            return (
              <span
                key={sev}
                className={`px-3 py-1 rounded-full text-xs font-semibold ${meta.className}`}
                aria-label={`${meta.label}: ${count} alertas`}
              >
                {meta.label}: {count}
              </span>
            );
          })}
        </section>
      )}

      {isError && (
        <div
          className="rounded-xl border border-rose-200 bg-rose-50 dark:bg-rose-950/40 dark:border-rose-900 p-4 text-rose-700 dark:text-rose-200 text-sm"
          role="alert"
        >
          Erro ao carregar alertas: {(error as Error)?.message ?? 'falha de comunicação'}
        </div>
      )}

      {isLoading ? (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-10 text-center text-slate-400">
          Carregando alertas…
        </div>
      ) : alerts.length === 0 ? (
        <div className="rounded-2xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/30 p-10 text-center">
          <p className="text-emerald-800 dark:text-emerald-200 font-semibold">Nenhum alerta aberto</p>
          <p className="text-emerald-700/80 dark:text-emerald-300/80 text-sm mt-1">
            Frota estável no momento.
          </p>
        </div>
      ) : (
        <ul className="space-y-3" aria-label="Alertas abertos">
          {alerts.map((alert) => {
            const meta = SEVERITY_META[alert.severity] || SEVERITY_META.INFO;
            const typeLabel = ALERT_TYPE_LABEL[alert.alertType] || alert.alertType;
            return (
              <li
                key={alert.id}
                className={`rounded-2xl bg-white dark:bg-slate-900 shadow-sm border border-slate-200/80 dark:border-slate-800 p-4 border-l-4 ${meta.bar}`}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`px-2 py-0.5 rounded-md text-xs font-semibold ${meta.className}`}>
                        {meta.label}
                      </span>
                      <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {typeLabel}
                      </span>
                      <span className="font-mono text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded">
                        {alert.machineAssetNumber || '—'}
                      </span>
                    </div>
                    <p className="text-sm text-slate-600 dark:text-slate-300">{alert.message}</p>
                    <p className="text-xs text-slate-400 tabular-nums">{fmt(alert.occurredAt)}</p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (
                          confirm(
                            `Reconhecer alerta "${typeLabel}" da máquina ${alert.machineAssetNumber}?`,
                          )
                        ) {
                          acknowledge.mutate(alert.id);
                        }
                      }}
                      disabled={acknowledge.isPending}
                      className="gh-btn-primary text-xs disabled:opacity-50"
                      aria-label={`Reconhecer alerta ${typeLabel}`}
                    >
                      Reconhecer
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (
                          confirm(
                            `Resolver alerta "${typeLabel}" da máquina ${alert.machineAssetNumber}?`,
                          )
                        ) {
                          resolve.mutate(alert.id);
                        }
                      }}
                      disabled={resolve.isPending}
                      className="text-xs px-3 py-2 bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-500 disabled:opacity-50"
                      aria-label={`Resolver alerta ${typeLabel}`}
                    >
                      Resolver
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
