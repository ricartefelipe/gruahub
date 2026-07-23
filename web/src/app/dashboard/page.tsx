'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { machinesApi, alertsApi } from '@/lib/api';

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
    <div className={`rounded-2xl bg-white dark:bg-slate-900 shadow-sm border border-slate-200/80 dark:border-slate-800 p-5 border-l-4 ${accent}`}>
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{title}</p>
      <p className="text-3xl font-bold text-slate-900 dark:text-slate-50 mt-2 tabular-nums">{value}</p>
      {sub ? <p className="text-xs text-slate-400 mt-1">{sub}</p> : null}
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
  const { data: machines, isLoading: machinesLoading } = useQuery({
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

  const total = machines?.totalElements ?? 0;
  const online = summary?.online ?? 0;
  const offline = summary?.offline ?? 0;

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">
            Operação
          </p>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white mt-1">
            Dashboard
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Visão da frota e alertas · atualização automática
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {quickLinks.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="inline-flex items-center rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-blue-500 hover:text-blue-600 transition-colors"
            >
              {l.label}
            </Link>
          ))}
        </div>
      </header>

      <section aria-label="Resumo da frota">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard title="Frota total" value={total} accent="border-blue-500" />
          <MetricCard
            title="Online"
            value={online}
            sub={total ? `${Math.round((Number(online) / total) * 100)}% da frota` : undefined}
            accent="border-emerald-500"
          />
          <MetricCard title="Offline" value={offline} accent="border-rose-500" />
          <MetricCard
            title="Manutenção"
            value={summary?.maintenance ?? '—'}
            accent="border-amber-500"
          />
        </div>
      </section>

      <section aria-label="Máquinas da frota">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">
            Máquinas ({total})
          </h2>
          <Link href="/dashboard/machines" className="text-xs font-semibold text-blue-600 hover:underline">
            Ver todas
          </Link>
        </div>
        {machinesLoading ? (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-10 text-center text-slate-400">
            Carregando máquinas…
          </div>
        ) : machines?.content.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-10 text-center">
            <p className="text-slate-700 dark:text-slate-200 font-medium">Nenhuma máquina cadastrada</p>
            <p className="text-sm text-slate-400 mt-1">Cadastre a primeira máquina para monitorar a frota.</p>
            <Link
              href="/dashboard/machines/new"
              className="inline-flex mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500"
            >
              Nova máquina
            </Link>
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
            <table className="min-w-full divide-y divide-slate-100 dark:divide-slate-800">
              <thead className="bg-slate-50 dark:bg-slate-950/60">
                <tr>
                  {['Patrimônio', 'Nome', 'Status', 'Preço', 'Último sinal'].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {machines?.content.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-3 text-sm font-mono text-slate-600 dark:text-slate-300">
                      <Link href={`/dashboard/machines/${m.id}`} className="hover:text-blue-600">
                        {m.assetNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-slate-900 dark:text-slate-100">
                      {m.name}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={m.status} />
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300 tabular-nums">
                      {new Intl.NumberFormat('pt-BR', {
                        style: 'currency',
                        currency: m.currency,
                      }).format(m.playPriceCents / 100)}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-400 tabular-nums">
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

      <section aria-label="Alertas abertos">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">
            Alertas abertos ({alerts?.totalElements ?? 0})
          </h2>
          <Link href="/dashboard/alerts" className="text-xs font-semibold text-blue-600 hover:underline">
            Central de alertas
          </Link>
        </div>
        {!alerts?.content.length ? (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 text-sm text-slate-500">
            Nenhum alerta aberto. Frota estável no momento.
          </div>
        ) : (
          <div className="space-y-2">
            {alerts.content.map((a) => (
              <div
                key={a.id}
                className={`rounded-xl bg-white dark:bg-slate-900 shadow-sm border border-slate-200/80 dark:border-slate-800 p-4 border-l-4 ${
                  a.severity === 'CRITICAL'
                    ? 'border-l-rose-500'
                    : a.severity === 'WARNING'
                      ? 'border-l-amber-500'
                      : 'border-l-blue-500'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-slate-100 text-sm">{a.title}</p>
                    {a.message ? (
                      <p className="text-slate-500 text-xs mt-0.5">{a.message}</p>
                    ) : null}
                  </div>
                  <span
                    className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded ${
                      a.severity === 'CRITICAL'
                        ? 'bg-rose-100 text-rose-700'
                        : a.severity === 'WARNING'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-blue-100 text-blue-700'
                    }`}
                  >
                    {a.severity}
                  </span>
                </div>
                <p className="text-slate-400 text-xs mt-2 tabular-nums">
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
