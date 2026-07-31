'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { machinesApi, alertsApi, playsApi, reconciliationApi } from '@/lib/api';
import { EmptyState } from '@/components/EmptyState';

function MetricCard({
  title,
  value,
  sub,
  accent,
}: {
  title: string;
  value: string | number;
  sub?: string;
  accent: string;
}) {
  return (
    <div className="gh-metric" style={{ ['--metric-accent' as string]: accent }}>
      <p className="text-xs font-semibold uppercase tracking-wider text-[color:var(--text-soft)]">
        {title}
      </p>
      <p className="font-display mt-2 text-3xl font-bold tabular-nums tracking-tight text-[color:var(--text)]">
        {value}
      </p>
      {sub ? <p className="mt-1 text-xs text-[color:var(--text-soft)]">{sub}</p> : null}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    ACTIVE: { label: 'Online', className: 'badge-online' },
    OFFLINE: { label: 'Offline', className: 'badge-offline' },
    MAINTENANCE: { label: 'Manutenção', className: 'badge-maintenance' },
    DRAFT: { label: 'Rascunho', className: 'badge-draft' },
    DISABLED: { label: 'Desabilitada', className: 'badge-draft' },
    RETIRED: { label: 'Aposentada', className: 'badge-draft' },
  };
  const cfg = map[status] || { label: status, className: 'badge-draft' };
  return <span className={cfg.className}>{cfg.label}</span>;
}

const quickLinks = [
  { href: '/dashboard/routes', label: 'Rotas do dia' },
  { href: '/dashboard/visits', label: 'Visitas' },
  { href: '/dashboard/alerts', label: 'Alertas' },
  { href: '/dashboard/machines', label: 'Frota' },
];

export default function DashboardPage() {
  const { data: machines, isLoading: machinesLoading, isError: machinesError } = useQuery({
    queryKey: ['machines'],
    queryFn: () => machinesApi.list(0, 100).then((r) => r.data),
    refetchInterval: 30_000,
  });

  const { data: summary } = useQuery({
    queryKey: ['machines-summary'],
    queryFn: () => machinesApi.statusSummary().then((r) => r.data),
    refetchInterval: 15_000,
  });

  const { data: alerts } = useQuery({
    queryKey: ['alerts-open'],
    queryFn: () => alertsApi.list(0, 5, 'OPEN').then((r) => r.data),
    refetchInterval: 30_000,
  });

  const { data: reconciliationSummary } = useQuery({
    queryKey: ['reconciliation-summary'],
    queryFn: () => reconciliationApi.summary().then((r) => r.data),
    refetchInterval: 30_000,
  });

  const { data: plays } = useQuery({
    queryKey: ['plays-latest'],
    queryFn: () => playsApi.list(0, 1).then((r) => r.data),
    refetchInterval: 30_000,
  });

  const total = machines?.totalElements ?? 0;
  const online = summary?.online ?? 0;
  const offline = summary?.offline ?? 0;
  const latestPlay = plays?.content[0] as
    | { machineId?: string; occurredAt?: string; status?: string }
    | undefined;
  const reconciliationBreakdown = Object.entries(reconciliationSummary?.byStatus ?? {});

  return (
    <div className="space-y-8 gh-fade-up">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-brand">
            <span className="inline-block h-2 w-2 rounded-full bg-signal gh-pulse" aria-hidden="true" />
            Operação ao vivo
          </div>
          <h1 className="font-display mt-2 text-3xl font-bold tracking-tight text-[color:var(--text)] md:text-4xl">
            Dashboard
          </h1>
          <p className="mt-1 text-sm text-[color:var(--text-muted)]">
            Visão da frota e alertas · atualização automática
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {quickLinks.map((l) => (
            <Link key={l.href} href={l.href} className="gh-btn-ghost">
              {l.label}
            </Link>
          ))}
        </div>
      </header>

      <section aria-label="Resumo da frota">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard title="Frota total" value={total} accent="var(--brand)" />
          <MetricCard
            title="Online"
            value={online}
            sub={total ? `${Math.round((Number(online) / total) * 100)}% da frota` : undefined}
            accent="var(--signal)"
          />
          <MetricCard title="Offline" value={offline} accent="var(--danger)" />
          <MetricCard
            title="Manutenção"
            value={summary?.maintenance ?? '—'}
            accent="var(--warn)"
          />
        </div>
      </section>

      <section aria-label="Operação e conciliação">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[color:var(--text-soft)]">
            Operação financeira
          </h2>
          <div className="flex gap-3">
            <Link href="/dashboard/reconciliation" className="text-xs font-semibold text-brand hover:underline">
              Conciliação
            </Link>
            <Link href="/dashboard/payments" className="text-xs font-semibold text-brand hover:underline">
              Pagamentos
            </Link>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <MetricCard
            title="Casos pendentes"
            value={reconciliationSummary?.totalPending ?? '—'}
            sub="Conciliação requer atenção"
            accent="var(--warn)"
          />
          <div className="gh-surface p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-[color:var(--text-soft)]">
              Distribuição da conciliação
            </p>
            {reconciliationBreakdown.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {reconciliationBreakdown.map(([status, count]) => (
                  <span
                    key={status}
                    className="rounded-md bg-[color:var(--surface-muted)] px-2 py-1 text-xs font-medium text-[color:var(--text-muted)]"
                  >
                    {status.replaceAll('_', ' ')}: {count}
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-[color:var(--text-soft)]">Nenhum caso registrado.</p>
            )}
          </div>
          <div className="gh-surface p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-[color:var(--text-soft)]">
              Última jogada
            </p>
            {latestPlay ? (
              <>
                <p className="mt-3 text-sm font-semibold text-[color:var(--text)]">
                  Máquina {latestPlay.machineId ?? 'não identificada'}
                </p>
                <p className="mt-1 text-xs text-[color:var(--text-soft)]">
                  {latestPlay.occurredAt
                    ? new Intl.DateTimeFormat('pt-BR', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      }).format(new Date(latestPlay.occurredAt))
                    : 'Horário indisponível'}
                  {latestPlay.status ? ` · ${latestPlay.status}` : ''}
                </p>
              </>
            ) : (
              <p className="mt-3 text-sm text-[color:var(--text-soft)]">Nenhuma jogada registrada.</p>
            )}
          </div>
        </div>
      </section>

      <section aria-label="Máquinas da frota">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[color:var(--text-soft)]">
            Máquinas ({total})
          </h2>
          <Link href="/dashboard/machines" className="text-xs font-semibold text-brand hover:underline">
            Ver todas
          </Link>
        </div>
        {machinesLoading ? (
          <div className="gh-surface p-10 text-center text-[color:var(--text-soft)]">
            Carregando máquinas…
          </div>
        ) : machinesError ? (
          <div className="gh-surface border-rose-300/50 p-10 text-center">
            <p className="font-medium text-rose-700">Falha ao carregar a frota</p>
            <p className="mt-1 text-sm text-[color:var(--text-soft)]">
              Verifique a API e tente novamente em instantes.
            </p>
          </div>
        ) : !machines?.content?.length ? (
          <EmptyState
            title="Nenhuma máquina cadastrada"
            description="Cadastre a primeira máquina para monitorar a frota."
            action={
              <Link href="/dashboard/machines/new" className="gh-btn-primary">
                Nova máquina
              </Link>
            }
          />
        ) : (
          <div className="gh-surface overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-[color:var(--line)]">
                <thead className="bg-[color:var(--surface-muted)]">
                  <tr>
                    {['Patrimônio', 'Nome', 'Status', 'Preço', 'Último sinal'].map((h) => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[color:var(--text-soft)]"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[color:var(--line)]">
                  {machines?.content.map((m) => (
                    <tr key={m.id} className="hover:bg-[color:var(--surface-muted)]/70">
                      <td className="px-4 py-3 font-mono text-sm text-[color:var(--text-muted)]">
                        <Link href={`/dashboard/machines/${m.id}`} className="hover:text-brand">
                          {m.assetNumber}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-[color:var(--text)]">
                        {m.name}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={m.status} />
                      </td>
                      <td className="px-4 py-3 text-sm tabular-nums text-[color:var(--text-muted)]">
                        {new Intl.NumberFormat('pt-BR', {
                          style: 'currency',
                          currency: m.currency,
                        }).format(m.playPriceCents / 100)}
                      </td>
                      <td className="px-4 py-3 text-sm tabular-nums text-[color:var(--text-soft)]">
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
          </div>
        )}
      </section>

      <section aria-label="Alertas abertos">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[color:var(--text-soft)]">
            Alertas abertos ({alerts?.totalElements ?? 0})
          </h2>
          <Link href="/dashboard/alerts" className="text-xs font-semibold text-brand hover:underline">
            Central de alertas
          </Link>
        </div>
        {!alerts?.content.length ? (
          <div className="gh-surface p-6 text-sm text-[color:var(--text-muted)]">
            Nenhum alerta aberto. Frota estável no momento.
          </div>
        ) : (
          <div className="space-y-2">
            {alerts.content.map((a) => (
              <div
                key={a.id}
                className="gh-metric"
                style={{
                  ['--metric-accent' as string]:
                    a.severity === 'CRITICAL'
                      ? 'var(--danger)'
                      : a.severity === 'WARNING'
                        ? 'var(--warn)'
                        : 'var(--brand)',
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[color:var(--text)]">{a.title}</p>
                    {a.message ? (
                      <p className="mt-0.5 text-xs text-[color:var(--text-muted)]">{a.message}</p>
                    ) : null}
                  </div>
                  <span
                    className={`shrink-0 rounded px-2 py-0.5 text-xs font-semibold ${
                      a.severity === 'CRITICAL'
                        ? 'bg-rose-100 text-rose-700'
                        : a.severity === 'WARNING'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-cyan-100 text-cyan-800'
                    }`}
                  >
                    {a.severity}
                  </span>
                </div>
                <p className="mt-2 text-xs tabular-nums text-[color:var(--text-soft)]">
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
