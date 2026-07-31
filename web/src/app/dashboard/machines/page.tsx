'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { machinesApi, Machine } from '@/lib/api';
import { EmptyState } from '@/components/EmptyState';
import { PageHeader } from '@/components/PageHeader';

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
        className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-rose-700"
      >
        Erro ao carregar máquinas. Verifique a conexão ou as permissões.
      </div>
    );
  }

  return (
    <div className="space-y-8 gh-fade-up">
      <PageHeader
        eyebrow="Frota"
        title="Máquinas"
        description="Status da frota · atualização automática a cada 30s"
        actions={<Link href="/dashboard/machines/new" className="gh-btn-primary">Nova máquina</Link>}
      />

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
        <div className="rounded-2xl border border-[color:var(--line)] bg-[color:var(--surface)] p-10 text-center text-[color:var(--text-soft)]">
          Carregando frota…
        </div>
      ) : data?.content.length === 0 ? (
        <EmptyState
          title="Nenhuma máquina cadastrada"
          description="Cadastre a primeira máquina para monitorar a frota."
          action={<Link href="/dashboard/machines/new" className="gh-btn-primary">Nova máquina</Link>}
        />
      ) : filtered.length === 0 ? (
        <EmptyState title="Nenhuma máquina neste filtro ou busca." />
      ) : (
        <>
          <div className="rounded-2xl border border-[color:var(--line)] bg-[color:var(--surface)] overflow-hidden shadow-sm">
            <table className="min-w-full divide-y divide-[color:var(--line)]">
              <thead className="bg-[color:var(--surface-muted)]">
                <tr>
                  {['Patrimônio', 'Nome', 'Status', 'Preço / jogada', 'Último sinal', 'Ações'].map(
                    (h) => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left text-xs font-semibold text-[color:var(--text-muted)] uppercase tracking-wider"
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--line)]">
                {filtered.map((m) => (
                  <tr key={m.id} className="hover:bg-[color:var(--surface-muted)]/80">
                    <td className="px-4 py-3 text-sm font-mono text-[color:var(--text-muted)]">
                      <Link href={`/dashboard/machines/${m.id}`} className="hover:text-brand">
                        {m.assetNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-[color:var(--text)]">
                      <Link href={`/dashboard/machines/${m.id}`} className="hover:text-brand">
                        {m.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={m.status} />
                    </td>
                    <td className="px-4 py-3 text-sm text-[color:var(--text-muted)] tabular-nums">
                      {fmtMoney(m.playPriceCents, m.currency)}
                    </td>
                    <td className="px-4 py-3 text-sm text-[color:var(--text-soft)] tabular-nums">
                      {fmtSeen(m.lastSeenAt)}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <select
                        aria-label={`Alterar status de ${m.name}`}
                        className="text-xs border border-[color:var(--line)] rounded-lg px-2 py-1.5 bg-[color:var(--surface)] text-[color:var(--text-muted)] focus:ring-2 focus:ring-brand focus:outline-none"
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
              <p className="text-sm text-[color:var(--text-muted)] tabular-nums">
                {data.totalElements} máquinas · página {page + 1} de {data.totalPages}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={data.first}
                  className="px-3 py-1.5 text-sm font-semibold border border-[color:var(--line)] rounded-lg disabled:opacity-40 hover:bg-[color:var(--surface-muted)]"
                  aria-label="Página anterior"
                >
                  Anterior
                </button>
                <button
                  type="button"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={data.last}
                  className="px-3 py-1.5 text-sm font-semibold border border-[color:var(--line)] rounded-lg disabled:opacity-40 hover:bg-[color:var(--surface-muted)]"
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
