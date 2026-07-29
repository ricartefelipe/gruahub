'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { machinesApi, Machine } from '@/lib/api';

type StatusFilter = 'ALL' | Machine['status'];

function StatusBadge({ status }: { status: Machine['status'] }) {
  const labels: Record<Machine['status'], string> = {
    ACTIVE: 'Online',
    OFFLINE: 'Offline',
    MAINTENANCE: 'Manutenção',
    DRAFT: 'Rascunho',
    DISABLED: 'Desabilitada',
    RETIRED: 'Aposentada',
  };
  const classes: Record<Machine['status'], string> = {
    ACTIVE: 'badge-online',
    OFFLINE: 'badge-offline',
    MAINTENANCE: 'badge-maintenance',
    DRAFT: 'badge-draft',
    DISABLED: 'badge-draft',
    RETIRED: 'badge-draft',
  };
  return <span className={classes[status]}>{labels[status]}</span>;
}

function fmtMoney(cents: number, currency: string) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(cents / 100);
}

function fmtSeen(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(iso));
}

export default function MachinesPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(0);
  const [filter, setFilter] = useState<StatusFilter>('ALL');
  const [q, setQ] = useState('');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['machines', page],
    queryFn: () => machinesApi.list(page, 20).then((r) => r.data),
    refetchInterval: 30_000,
  });

  const { data: summary } = useQuery({
    queryKey: ['machines-summary'],
    queryFn: () => machinesApi.statusSummary().then((r) => r.data),
    refetchInterval: 15_000,
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      machinesApi.changeStatus(id, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['machines'] });
      qc.invalidateQueries({ queryKey: ['machines-summary'] });
      toast.success('Status atualizado');
    },
    onError: (e: Error) => toast.error(e.message || 'Erro ao atualizar status'),
  });

  const filtered = useMemo(() => {
    const rows = data?.content ?? [];
    const needle = q.trim().toLowerCase();
    return rows.filter((m) => {
      if (filter !== 'ALL' && m.status !== filter) return false;
      if (!needle) return true;
      return (
        m.name.toLowerCase().includes(needle) ||
        m.assetNumber.toLowerCase().includes(needle)
      );
    });
  }, [data?.content, filter, q]);

  const filters: Array<{ key: StatusFilter; label: string; count?: number }> = [
    { key: 'ALL', label: 'Todas', count: data?.totalElements },
    { key: 'ACTIVE', label: 'Online', count: summary?.online },
    { key: 'OFFLINE', label: 'Offline', count: summary?.offline },
    { key: 'MAINTENANCE', label: 'Manutenção', count: summary?.maintenance },
  ];

  if (isError) {
    return (
      <div
        role="alert"
        className="rounded-xl border border-rose-200 bg-rose-50 dark:bg-rose-950/40 dark:border-rose-900 p-6 text-rose-700 dark:text-rose-200"
      >
        Erro ao carregar máquinas. Verifique a conexão ou as permissões.
      </div>
    );
  }

  return (
    <div className="space-y-8 gh-fade-up">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">Frota</p>
          <h1 className="font-display mt-1 text-3xl font-bold tracking-tight text-[color:var(--text)] md:text-4xl">
            Máquinas
          </h1>
          <p className="mt-1 text-sm text-[color:var(--text-muted)]">
            Status da frota · atualização automática a cada 30s
          </p>
        </div>
        <Link href="/dashboard/machines/new" className="gh-btn-primary">
          Nova máquina
        </Link>
      </header>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3" aria-label="Resumo da frota">
        <div className="gh-metric" style={{ ['--metric-accent' as string]: 'var(--signal)' }}>
          <p className="text-xs font-semibold uppercase tracking-wider text-[color:var(--text-soft)]">Online</p>
          <p className="font-display mt-2 text-3xl font-bold tabular-nums text-[color:var(--text)]">
            {summary?.online ?? '—'}
          </p>
        </div>
        <div className="gh-metric" style={{ ['--metric-accent' as string]: 'var(--danger)' }}>
          <p className="text-xs font-semibold uppercase tracking-wider text-[color:var(--text-soft)]">Offline</p>
          <p className="font-display mt-2 text-3xl font-bold tabular-nums text-[color:var(--text)]">
            {summary?.offline ?? '—'}
          </p>
        </div>
        <div className="gh-metric" style={{ ['--metric-accent' as string]: 'var(--warn)' }}>
          <p className="text-xs font-semibold uppercase tracking-wider text-[color:var(--text-soft)]">Manutenção</p>
          <p className="font-display mt-2 text-3xl font-bold tabular-nums text-[color:var(--text)]">
            {summary?.maintenance ?? '—'}
          </p>
        </div>
      </section>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {filters.map((f) => {
            const active = filter === f.key;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                aria-pressed={active}
                className={
                  active
                    ? 'rounded-full bg-brand px-3 py-1.5 text-xs font-semibold text-white shadow-brand'
                    : 'gh-btn-ghost'
                }
              >
                {f.label}
                {typeof f.count === 'number' ? ` (${f.count})` : ''}
              </button>
            );
          })}
        </div>
        <label className="sr-only" htmlFor="machine-search">
          Buscar máquina
        </label>
        <input
          id="machine-search"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por nome ou patrimônio"
          className="w-full rounded-xl border border-[color:var(--line)] bg-[color:var(--surface)] px-3 py-2 text-sm text-[color:var(--text)] placeholder:text-[color:var(--text-soft)] focus:outline-none focus:ring-2 focus:ring-brand sm:w-72"
        />
      </div>

      {isLoading ? (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-10 text-center text-slate-400">
          Carregando frota…
        </div>
      ) : data?.content.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-10 text-center">
          <p className="text-slate-700 dark:text-slate-200 font-medium">Nenhuma máquina cadastrada</p>
          <p className="text-sm text-slate-400 mt-1">Cadastre a primeira máquina para monitorar a frota.</p>
          <Link
            href="/dashboard/machines/new"
            className="gh-btn-primary mt-4"
          >
            Nova máquina
          </Link>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-10 text-center text-slate-500">
          Nenhuma máquina neste filtro/busca.
        </div>
      ) : (
        <>
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
            <table className="min-w-full divide-y divide-slate-100 dark:divide-slate-800">
              <thead className="bg-slate-50 dark:bg-slate-950/60">
                <tr>
                  {['Patrimônio', 'Nome', 'Status', 'Preço / jogada', 'Último sinal', 'Ações'].map(
                    (h) => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider"
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filtered.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-3 text-sm font-mono text-slate-600 dark:text-slate-300">
                      <Link href={`/dashboard/machines/${m.id}`} className="hover:text-blue-600">
                        {m.assetNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-slate-900 dark:text-slate-100">
                      <Link href={`/dashboard/machines/${m.id}`} className="hover:text-blue-600">
                        {m.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={m.status} />
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300 tabular-nums">
                      {fmtMoney(m.playPriceCents, m.currency)}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-400 tabular-nums">
                      {fmtSeen(m.lastSeenAt)}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <select
                        aria-label={`Alterar status de ${m.name}`}
                        className="text-xs border border-slate-300 dark:border-slate-600 rounded-lg px-2 py-1.5 bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        defaultValue=""
                        onChange={(e) => {
                          if (e.target.value) {
                            if (confirm(`Confirmar: alterar status para ${e.target.value}?`)) {
                              statusMutation.mutate({ id: m.id, status: e.target.value });
                            }
                            e.target.value = '';
                          }
                        }}
                      >
                        <option value="">Ação…</option>
                        <option value="ACTIVE">Ativar</option>
                        <option value="OFFLINE">Marcar offline</option>
                        <option value="MAINTENANCE">Manutenção</option>
                        <option value="DISABLED">Desabilitar</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {data && data.totalPages > 1 ? (
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500 tabular-nums">
                {data.totalElements} máquinas · página {page + 1} de {data.totalPages}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={data.first}
                  className="px-3 py-1.5 text-sm font-semibold border border-slate-200 dark:border-slate-700 rounded-lg disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800"
                  aria-label="Página anterior"
                >
                  Anterior
                </button>
                <button
                  type="button"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={data.last}
                  className="px-3 py-1.5 text-sm font-semibold border border-slate-200 dark:border-slate-700 rounded-lg disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800"
                  aria-label="Próxima página"
                >
                  Próxima
                </button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
