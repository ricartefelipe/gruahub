'use client';

import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { EmptyState } from '@/components/EmptyState';

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
    className: 'bg-rose-100 text-rose-700',
    bar: 'border-l-rose-500',
  },
  HIGH: {
    label: 'Alto',
    className: 'bg-orange-100 text-orange-800',
    bar: 'border-l-orange-500',
  },
  MEDIUM: {
    label: 'Médio',
    className: 'bg-amber-100 text-amber-800',
    bar: 'border-l-amber-500',
  },
  LOW: {
    label: 'Baixo',
    className: 'bg-brand/10 text-[color:var(--brand-strong)]',
    bar: 'border-l-brand',
  },
  INFO: {
    label: 'Info',
    className: 'bg-[color:var(--surface-muted)] text-[color:var(--text-muted)]',
    bar: 'border-l-[color:var(--text-soft)]',
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
          <span className="rounded-full bg-[color:var(--ink-soft)] text-white px-3 py-1 text-xs font-semibold">
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
          className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-700 text-sm"
          role="alert"
        >
          Erro ao carregar alertas: {(error as Error)?.message ?? 'falha de comunicação'}
        </div>
      )}

      {isLoading ? (
        <div className="rounded-2xl border border-[color:var(--line)] bg-[color:var(--surface)] p-10 text-center text-[color:var(--text-soft)]">
          Carregando alertas…
        </div>
      ) : alerts.length === 0 ? (
        <EmptyState
          title="Nenhum alerta aberto"
          description="Frota estável no momento."
          className="border-emerald-300/60 bg-emerald-50/50"
        />
      ) : (
        <ul className="space-y-3" aria-label="Alertas abertos">
          {alerts.map((alert) => {
            const meta = SEVERITY_META[alert.severity] || SEVERITY_META.INFO;
            const typeLabel = ALERT_TYPE_LABEL[alert.alertType] || alert.alertType;
            return (
              <li
                key={alert.id}
                className={`rounded-2xl bg-[color:var(--surface)] shadow-sm border border-[color:var(--line)]/80 p-4 border-l-4 ${meta.bar}`}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`px-2 py-0.5 rounded-md text-xs font-semibold ${meta.className}`}>
                        {meta.label}
                      </span>
                      <span className="text-sm font-semibold text-[color:var(--text)]">
                        {typeLabel}
                      </span>
                      <span className="font-mono text-xs bg-[color:var(--surface-muted)] text-[color:var(--text-muted)] px-2 py-0.5 rounded">
                        {alert.machineAssetNumber || '—'}
                      </span>
                    </div>
                    <p className="text-sm text-[color:var(--text-muted)]">{alert.message}</p>
                    <p className="text-xs text-[color:var(--text-soft)] tabular-nums">{fmt(alert.occurredAt)}</p>
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
